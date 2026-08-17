import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  KAHIN_MANUAL_PLAYERS,
  KAHIN_TEAMS,
  mergeKahinPlayers,
  resolveKahinTeamName,
  sanitizeKahinPlayers,
} from "@/lib/kahin";
import { LEAGUE_TEAM_DATA, normalizeLeagueTeamName } from "@/lib/league-data";
import type {
  FailedTeamSync,
  LeaguePlayerRecord,
  PlayerRosterResponse,
  PlayerSyncHealth,
  PlayerSyncReport,
  PlayerTransfer,
} from "@/lib/player-sync-types";

const ESPN_TEAMS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/teams";
const PLAYER_ROSTER_DOCUMENT = adminDb.collection("system").doc("playerRoster");
const MINIMUM_SAFE_PLAYER_COUNT = 180;
const MINIMUM_SAFE_TEAM_PLAYER_COUNT = 8;
const MAXIMUM_SAFE_REMOVAL_RATIO = 0.18;
const KAHIN_TEAM_SET = new Set<string>(KAHIN_TEAMS);

type SyncSource = PlayerSyncReport["source"];

type EspnTeam = {
  id: string;
  displayName: string;
};

type EspnAthlete = {
  displayName?: unknown;
};

type TeamRosterResult = {
  team: string;
  players: LeaguePlayerRecord[];
  error: string | null;
};

type ProviderRosterResult = {
  providerTeamCount: number;
  teamResults: TeamRosterResult[];
};

function decodeName(value: string): string {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(amp|apos|quot|nbsp);/g, (_, entity) => {
      const entities: Record<string, string> = {
        amp: "&",
        apos: "'",
        quot: '"',
        nbsp: " ",
      };
      return entities[entity];
    })
    .trim();
}

function normalizePlayerName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function playerTeamKey(player: LeaguePlayerRecord): string {
  return `${normalizePlayerName(player.name)}::${normalizeLeagueTeamName(player.team)}`;
}

function sortPlayers(players: LeaguePlayerRecord[]): LeaguePlayerRecord[] {
  return [...players].sort((first, second) =>
    first.name.localeCompare(second.name, "tr-TR"),
  );
}

function applyManualOverrides(
  players: LeaguePlayerRecord[],
  manualPlayers: LeaguePlayerRecord[],
): LeaguePlayerRecord[] {
  const manualNames = new Set(
    manualPlayers.map((player) => normalizePlayerName(player.name)),
  );
  return mergeKahinPlayers(
    players.filter((player) => !manualNames.has(normalizePlayerName(player.name))),
    manualPlayers,
  );
}

function readCustomManualPlayers(value: unknown): LeaguePlayerRecord[] {
  return sanitizeKahinPlayers(value).flatMap((player): LeaguePlayerRecord[] => {
    const team = resolveKahinTeamName(player.team);
    return KAHIN_TEAM_SET.has(team) ? [{ name: player.name, team }] : [];
  });
}

function getConfiguredManualPlayers(value: unknown): LeaguePlayerRecord[] {
  const bundledNames = new Set(
    KAHIN_MANUAL_PLAYERS.map((player) => normalizePlayerName(player.name)),
  );

  return mergeKahinPlayers(
    KAHIN_MANUAL_PLAYERS,
    readCustomManualPlayers(value).filter(
      (player) => !bundledNames.has(normalizePlayerName(player.name)),
    ),
  );
}

function normalizeManualPlayer(
  value: Pick<LeaguePlayerRecord, "name" | "team">,
): LeaguePlayerRecord {
  const name = value.name.trim();
  const team = resolveKahinTeamName(value.team);

  if (!name) {
    throw new Error("Futbolcu adı boş olamaz.");
  }
  if (name.length > 100) {
    throw new Error("Futbolcu adı en fazla 100 karakter olabilir.");
  }
  if (!KAHIN_TEAM_SET.has(team)) {
    throw new Error("Futbolcu için ligdeki geçerli bir takım seç.");
  }

  return { name, team };
}

function mergeCustomManualPlayers(
  current: LeaguePlayerRecord[],
  additions: LeaguePlayerRecord[],
): LeaguePlayerRecord[] {
  const playersByName = new Map<string, LeaguePlayerRecord>();

  for (const player of current) {
    playersByName.set(normalizePlayerName(player.name), player);
  }
  for (const player of additions) {
    playersByName.set(normalizePlayerName(player.name), player);
  }

  return sortPlayers([...playersByName.values()]);
}

async function fetchProviderRosters(): Promise<ProviderRosterResult> {
  const fetchOptions = {
    headers: { "User-Agent": "Has-Gardaslar-Ligi" },
    cache: "no-store" as const,
  };
  const teamsResponse = await fetch(ESPN_TEAMS_URL, fetchOptions);

  if (!teamsResponse.ok) {
    throw new Error(`Takım kaynağı ${teamsResponse.status} ile yanıt verdi.`);
  }

  const teamsData = (await teamsResponse.json()) as {
    sports?: Array<{
      leagues?: Array<{ teams?: Array<{ team?: Partial<EspnTeam> }> }>;
    }>;
  };
  const providerTeams =
    teamsData.sports?.[0]?.leagues?.[0]?.teams
      ?.map((item) => item.team)
      .filter(
        (team): team is EspnTeam =>
          typeof team?.id === "string" &&
          Boolean(team.id) &&
          typeof team.displayName === "string" &&
          Boolean(team.displayName),
      ) ?? [];

  const providerByCanonicalTeam = new Map<string, EspnTeam>();
  for (const team of providerTeams) {
    const canonicalTeam = resolveKahinTeamName(team.displayName);
    if (KAHIN_TEAM_SET.has(canonicalTeam)) {
      providerByCanonicalTeam.set(canonicalTeam, team);
    }
  }

  const teamResults = await Promise.all(
    KAHIN_TEAMS.map(async (team): Promise<TeamRosterResult> => {
      const providerTeam = providerByCanonicalTeam.get(team);
      if (!providerTeam) {
        return {
          team,
          players: [],
          error: "Takım dış kaynakta bulunamadı.",
        };
      }

      try {
        const rosterResponse = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/teams/${providerTeam.id}/roster`,
          fetchOptions,
        );

        if (!rosterResponse.ok) {
          return {
            team,
            players: [],
            error: `Kadro kaynağı ${rosterResponse.status} ile yanıt verdi.`,
          };
        }

        const rosterData = (await rosterResponse.json()) as {
          athletes?: EspnAthlete[];
        };
        const players = (rosterData.athletes ?? []).flatMap(
          (athlete): LeaguePlayerRecord[] => {
            if (typeof athlete.displayName !== "string") return [];
            const name = decodeName(athlete.displayName);
            return name ? [{ name, team }] : [];
          },
        );

        return players.length >= MINIMUM_SAFE_TEAM_PLAYER_COUNT
          ? { team, players, error: null }
          : {
              team,
              players: [],
              error: `Kadro yalnızca ${players.length} oyuncu döndürdü.`,
            };
      } catch (error) {
        return {
          team,
          players: [],
          error:
            error instanceof Error ? error.message : "Kadro alınamadı.",
        };
      }
    }),
  );

  return { providerTeamCount: providerTeams.length, teamResults };
}

function computeChanges(
  previousPlayers: LeaguePlayerRecord[],
  currentPlayers: LeaguePlayerRecord[],
) {
  const previousByName = new Map<string, LeaguePlayerRecord[]>();
  const currentByName = new Map<string, LeaguePlayerRecord[]>();

  for (const player of previousPlayers) {
    const key = normalizePlayerName(player.name);
    previousByName.set(key, [...(previousByName.get(key) ?? []), player]);
  }
  for (const player of currentPlayers) {
    const key = normalizePlayerName(player.name);
    currentByName.set(key, [...(currentByName.get(key) ?? []), player]);
  }

  const addedPlayers: LeaguePlayerRecord[] = [];
  const removedPlayers: LeaguePlayerRecord[] = [];
  const transferredPlayers: PlayerTransfer[] = [];
  const allNames = new Set([...previousByName.keys(), ...currentByName.keys()]);

  for (const nameKey of allNames) {
    const previous = previousByName.get(nameKey) ?? [];
    const current = currentByName.get(nameKey) ?? [];

    if (previous.length === 1 && current.length === 1) {
      if (
        normalizeLeagueTeamName(previous[0].team) !==
        normalizeLeagueTeamName(current[0].team)
      ) {
        transferredPlayers.push({
          name: current[0].name,
          fromTeam: previous[0].team,
          toTeam: current[0].team,
        });
      }
      continue;
    }

    const previousKeys = new Set(previous.map(playerTeamKey));
    const currentKeys = new Set(current.map(playerTeamKey));
    addedPlayers.push(
      ...current.filter((player) => !previousKeys.has(playerTeamKey(player))),
    );
    removedPlayers.push(
      ...previous.filter((player) => !currentKeys.has(playerTeamKey(player))),
    );
  }

  return {
    addedPlayers: sortPlayers(addedPlayers),
    removedPlayers: sortPlayers(removedPlayers),
    transferredPlayers: transferredPlayers.sort((first, second) =>
      first.name.localeCompare(second.name, "tr-TR"),
    ),
  };
}

function getMissingCrests(): string[] {
  return LEAGUE_TEAM_DATA.flatMap((team): string[] => {
    const filePath = path.join(
      process.cwd(),
      "public",
      "team-crests",
      `${team.crest}.png`,
    );
    return existsSync(filePath) ? [] : [team.name];
  });
}

function buildHealth(
  players: LeaguePlayerRecord[],
  providerTeamCount: number,
  failedTeams: FailedTeamSync[],
): PlayerSyncHealth {
  const validTeams = new Set<string>(KAHIN_TEAMS);
  const playerTeams = new Set(players.map((player) => player.team));
  const emptyTeams = KAHIN_TEAMS.filter((team) => !playerTeams.has(team));
  const lowPlayerCountTeams = KAHIN_TEAMS.flatMap((team) => {
    const count = players.filter((player) => player.team === team).length;
    return count > 0 && count < MINIMUM_SAFE_TEAM_PLAYER_COUNT
      ? [{ team, count }]
      : [];
  });
  const invalidTeams = Array.from(playerTeams)
    .filter((team) => !validTeams.has(team))
    .sort((first, second) => first.localeCompare(second, "tr-TR"));
  const missingCrests = getMissingCrests();
  const duplicateKeys = new Map<string, number>();
  for (const player of players) {
    const key = playerTeamKey(player);
    duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1);
  }
  const duplicatePlayers = Array.from(duplicateKeys.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  const issues: string[] = [];

  if (failedTeams.length > 0) {
    issues.push(`${failedTeams.length} takımın güncel kadrosu alınamadı.`);
  }
  if (emptyTeams.length > 0) {
    issues.push(`${emptyTeams.length} takımın oyuncu listesi boş.`);
  }
  if (lowPlayerCountTeams.length > 0) {
    issues.push(`${lowPlayerCountTeams.length} takımın oyuncu sayısı çok düşük.`);
  }
  if (invalidTeams.length > 0) {
    issues.push(`${invalidTeams.length} geçersiz takım adı bulundu.`);
  }
  if (missingCrests.length > 0) {
    issues.push(`${missingCrests.length} takım amblemi eksik.`);
  }
  if (duplicatePlayers.length > 0) {
    issues.push(`${duplicatePlayers.length} yinelenen oyuncu kaydı bulundu.`);
  }
  if (players.length < MINIMUM_SAFE_PLAYER_COUNT) {
    issues.push(`Oyuncu sayısı güvenli sınırın altında (${players.length}).`);
  }

  return {
    ok: issues.length === 0,
    issues,
    expectedTeamCount: KAHIN_TEAMS.length,
    providerTeamCount,
    rosterTeamCount: playerTeams.size,
    emptyTeams,
    lowPlayerCountTeams,
    invalidTeams,
    missingCrests,
    duplicatePlayers,
  };
}

function readStoredPlayers(
  value: unknown,
  manualPlayers: LeaguePlayerRecord[],
): LeaguePlayerRecord[] {
  const storedPlayers = sanitizeKahinPlayers(value).flatMap(
    (player): LeaguePlayerRecord[] => {
      const team = resolveKahinTeamName(player.team);
      return KAHIN_TEAM_SET.has(team) ? [{ name: player.name, team }] : [];
    },
  );

  return applyManualOverrides(storedPlayers, manualPlayers);
}

function isPlayerSyncReport(value: unknown): value is PlayerSyncReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<PlayerSyncReport>;
  return (
    typeof report.completedAt === "string" &&
    typeof report.playerCount === "number" &&
    Array.isArray(report.addedPlayers) &&
    Array.isArray(report.removedPlayers) &&
    Array.isArray(report.transferredPlayers) &&
    Array.isArray(report.failedTeams)
  );
}

export async function getStoredPlayerRoster(): Promise<PlayerRosterResponse | null> {
  const snapshot = await PLAYER_ROSTER_DOCUMENT.get();
  if (!snapshot.exists) return null;

  const data = snapshot.data() ?? {};
  const storedPlayers = sanitizeKahinPlayers(data.players).flatMap(
    (player): LeaguePlayerRecord[] => {
      const team = resolveKahinTeamName(player.team);
      return KAHIN_TEAM_SET.has(team) ? [{ name: player.name, team }] : [];
    },
  );
  if (storedPlayers.length === 0) return null;

  const players = readStoredPlayers(
    storedPlayers,
    getConfiguredManualPlayers(data.manualPlayers),
  );

  return {
    success: true,
    players,
    teamCount: new Set(players.map((player) => player.team)).size,
    syncedAt: typeof data.syncedAt === "string" ? data.syncedAt : null,
    report: isPlayerSyncReport(data.lastSyncReport)
      ? data.lastSyncReport
      : undefined,
  };
}

export async function syncPlayerRoster(
  source: SyncSource,
): Promise<PlayerRosterResponse> {
  const startedAt = new Date().toISOString();
  const previousRoster = await getStoredPlayerRoster();
  const previousPlayers = previousRoster?.players ?? [];
  const manualSnapshot = await PLAYER_ROSTER_DOCUMENT.get();
  const manualPlayers = getConfiguredManualPlayers(
    manualSnapshot.data()?.manualPlayers,
  );
  const provider = await fetchProviderRosters();
  const failedTeams: FailedTeamSync[] = [];
  const fetchedPlayers: LeaguePlayerRecord[] = [];
  let successfulTeamCount = 0;

  for (const result of provider.teamResults) {
    if (!result.error) {
      successfulTeamCount += 1;
      fetchedPlayers.push(...result.players);
      continue;
    }

    const previousTeamPlayers = previousPlayers.filter(
      (player) =>
        normalizeLeagueTeamName(player.team) ===
        normalizeLeagueTeamName(result.team),
    );
    fetchedPlayers.push(...previousTeamPlayers);
    failedTeams.push({
      team: result.team,
      reason: result.error,
      usedPreviousData: previousTeamPlayers.length > 0,
    });
  }

  const players = applyManualOverrides(
    mergeKahinPlayers(fetchedPlayers),
    manualPlayers,
  );
  const changes = computeChanges(previousPlayers, players);
  const health = buildHealth(players, provider.providerTeamCount, failedTeams);
  const suspiciousRemovalLimit = Math.max(
    25,
    Math.ceil(previousPlayers.length * MAXIMUM_SAFE_REMOVAL_RATIO),
  );
  const suspiciousRemoval =
    previousPlayers.length > 0 &&
    changes.removedPlayers.length > suspiciousRemovalLimit;

  if (suspiciousRemoval) {
    health.ok = false;
    health.issues.push(
      `${changes.removedPlayers.length} oyunculuk şüpheli toplu silme engellendi.`,
    );
  }

  const completedAt = new Date().toISOString();
  const safeToPersist =
    players.length >= MINIMUM_SAFE_PLAYER_COUNT &&
    health.emptyTeams.length === 0 &&
    health.lowPlayerCountTeams.length === 0 &&
    health.invalidTeams.length === 0 &&
    !suspiciousRemoval;
  const report: PlayerSyncReport = {
    source,
    startedAt,
    completedAt,
    persisted: safeToPersist,
    previousPlayerCount: previousPlayers.length,
    playerCount: players.length,
    successfulTeamCount,
    ...changes,
    failedTeams,
    health,
  };
  const runReference = PLAYER_ROSTER_DOCUMENT.collection("runs").doc();
  const batch = adminDb.batch();
  batch.set(runReference, report);

  if (safeToPersist) {
    batch.set(
      PLAYER_ROSTER_DOCUMENT,
      {
        version: 1,
        players,
        syncedAt: completedAt,
        lastSyncReport: report,
      },
      { merge: true },
    );
  } else {
    batch.set(
      PLAYER_ROSTER_DOCUMENT,
      { lastAttemptAt: completedAt, lastAttemptReport: report },
      { merge: true },
    );
  }

  await batch.commit();

  if (!safeToPersist && previousRoster) {
    return {
      ...previousRoster,
      success: false,
      report,
      error: "Sağlık kontrolü başarısız olduğu için önceki sağlam kadro korundu.",
    };
  }

  return {
    success: safeToPersist,
    players,
    teamCount: new Set(players.map((player) => player.team)).size,
    syncedAt: safeToPersist ? completedAt : previousRoster?.syncedAt ?? null,
    report,
    error: safeToPersist
      ? undefined
      : "Oyuncu verisi sağlık kontrolünden geçemedi.",
  };
}

export async function addManualLeaguePlayer(
  value: Pick<LeaguePlayerRecord, "name" | "team">,
): Promise<{ player: LeaguePlayerRecord; created: boolean }> {
  const player = normalizeManualPlayer(value);
  const bundledPlayer = KAHIN_MANUAL_PLAYERS.find(
    (item) => normalizePlayerName(item.name) === normalizePlayerName(player.name),
  );

  if (bundledPlayer) {
    return {
      player: { name: bundledPlayer.name, team: bundledPlayer.team },
      created: false,
    };
  }

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(PLAYER_ROSTER_DOCUMENT);
    const current = readCustomManualPlayers(snapshot.data()?.manualPlayers);
    const existing = current.find(
      (item) => normalizePlayerName(item.name) === normalizePlayerName(player.name),
    );

    if (existing && existing.team === player.team) {
      return { player: existing, created: false };
    }

    transaction.set(
      PLAYER_ROSTER_DOCUMENT,
      {
        manualPlayers: mergeCustomManualPlayers(
          current.filter(
            (item) =>
              normalizePlayerName(item.name) !== normalizePlayerName(player.name),
          ),
          [player],
        ),
        manualPlayersUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { player, created: true };
  });
}

export async function migrateLegacyKahinPlayers(): Promise<{
  migratedCount: number;
  skippedCount: number;
}> {
  const legacySettings = adminDb.collection("settings").doc("kahin");

  return adminDb.runTransaction(async (transaction) => {
    const [rosterSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(PLAYER_ROSTER_DOCUMENT),
      transaction.get(legacySettings),
    ]);
    const legacyPlayers = sanitizeKahinPlayers(
      settingsSnapshot.data()?.customPlayerOptions,
    );
    if (legacyPlayers.length === 0) {
      return { migratedCount: 0, skippedCount: 0 };
    }

    const validPlayers: LeaguePlayerRecord[] = [];
    let skippedCount = 0;
    for (const legacyPlayer of legacyPlayers) {
      try {
        validPlayers.push(normalizeManualPlayer(legacyPlayer));
      } catch {
        skippedCount += 1;
      }
    }

    const current = readCustomManualPlayers(
      rosterSnapshot.data()?.manualPlayers,
    );
    const next = mergeCustomManualPlayers(current, validPlayers);
    const migratedCount = next.length - current.length;

    transaction.set(
      PLAYER_ROSTER_DOCUMENT,
      {
        manualPlayers: next,
        manualPlayersUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (skippedCount === 0) {
      transaction.set(
        legacySettings,
        { customPlayerOptions: FieldValue.delete() },
        { merge: true },
      );
    }

    return { migratedCount, skippedCount };
  });
}
