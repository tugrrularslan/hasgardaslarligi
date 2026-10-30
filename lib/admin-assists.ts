import { getMatchAssistTotals, type MatchAssistTotal } from "./match-details.ts";
import { getPlayerIdentityKey } from "./player-identity.ts";
import { canonicalTeamName } from "./super-lig-sync.ts";

export type AssistInputMode = "goals" | "totals";
export type AssistTotalInput = { team: string; player: string; count: string };
export type AssistDraft = { mode: AssistInputMode; rows: AssistTotalInput[] };
type MatchSource = {
  homeTeam: string; awayTeam: string; assistTotals?: MatchAssistTotal[]; assistDetailsStatus?: string;
  goalEvents?: Array<{ team: string; scorer: string; assister?: string | null; ownGoal?: boolean }>;
};
export function createAssistDraft(match: MatchSource): AssistDraft {
  return { mode: match.assistDetailsStatus === "complete" && Array.isArray(match.assistTotals) ? "totals" : "goals",
    rows: getMatchAssistTotals(match).map(value => ({ team: value.team, player: value.player, count: String(value.count) })) };
}

/** Include athletes already recorded on the match even when the roster is stale or empty. */
export function mergeMatchPlayerOptions(players: Array<{ name: string; team: string }>, match: MatchSource, rows: AssistTotalInput[] = []) {
  const options = new Map<string, { name: string; team: string }>();
  const add = (name: string, team: string) => {
    if (!name.trim() || !team.trim()) return;
    const key = `${canonicalTeamName(team) ?? team}:${getPlayerIdentityKey(name)}`;
    if (!options.has(key)) options.set(key, { name: name.trim(), team });
  };
  players.forEach(player => add(player.name, player.team));
  for (const event of match.goalEvents ?? []) {
    const scorerTeam = event.ownGoal ? event.team === match.homeTeam ? match.awayTeam : match.homeTeam : event.team;
    add(event.scorer, scorerTeam);
    if (event.assister && !event.ownGoal) add(event.assister, event.team);
  }
  getMatchAssistTotals(match).forEach(value => add(value.player, value.team));
  rows.forEach(value => add(value.player, value.team));
  return [...options.values()];
}

export function normalizeManualAssistTotals(value: unknown, match: {
  homeTeam: string; awayTeam: string; homeScore: number; awayScore: number;
  goalEvents: Array<{ side: "home" | "away"; ownGoal?: boolean }>;
}): MatchAssistTotal[] {
  if (!Array.isArray(value) || value.length > 198) throw new Error("Geçerli asist kayıtları gerekli.");
  const seen = new Set<string>();
  const totals = value.map(entry => {
    if (!entry || typeof entry !== "object") throw new Error("Geçerli bir asist oyuncusu seç.");
    const row = entry as Record<string, unknown>;
    const team = typeof row.team === "string" ? row.team.trim() : "";
    const player = typeof row.player === "string" ? row.player.trim() : "";
    const count = (typeof row.count === "number" || typeof row.count === "string") && /^\d+$/.test(String(row.count)) ? Number(row.count) : 0;
    if (![match.homeTeam, match.awayTeam].includes(team) || !player || player.length > 120 || !Number.isSafeInteger(count) || count < 1 || count > 99) {
      throw new Error("Her asist için takım, oyuncu ve 1 veya daha büyük bir sayı gir.");
    }
    const playerKey = getPlayerIdentityKey(player);
    const key = `${team}:${playerKey}`;
    if (seen.has(key)) throw new Error("Aynı oyuncuyu aynı takım için tek satırda gir.");
    seen.add(key);
    return { team, player, playerKey, count };
  });
  for (const side of ["home", "away"] as const) {
    const team = side === "home" ? match.homeTeam : match.awayTeam;
    const goals = side === "home" ? match.homeScore : match.awayScore;
    const available = goals - match.goalEvents.filter(event => event.side === side && event.ownGoal).length;
    if (totals.filter(row => row.team === team).reduce((sum, row) => sum + row.count, 0) > available) {
      throw new Error(`${team} için asist toplamı asist verilebilecek gol sayısını aşıyor.`);
    }
  }
  return totals;
}
