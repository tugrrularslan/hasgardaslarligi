import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard";
const ESPN_SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/summary";

type GoalEventDraft = {
  side: "home" | "away";
  scorer: string;
  assister: string;
};

type ImportedResult = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  goalEvents: GoalEventDraft[];
  sourceEventId: string;
};

type StoredMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: Timestamp;
};

type EspnEvent = {
  id?: unknown;
  competitions?: Array<{
    status?: {
      type?: {
        completed?: unknown;
      };
    };
    competitors?: Array<{
      homeAway?: unknown;
      score?: unknown;
      team?: {
        displayName?: unknown;
      };
    }>;
  }>;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

function normalizeTeamName(value: string): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const aliases: Record<string, string> = {
    "amed sk": "amed",
    "amed sfk": "amed",
    "amed sportif faaliyetler": "amed",
    amedspor: "amed",
    "erzurumspor fk": "erzurum",
    "erzurum bb": "erzurum",
    basaksehir: "istanbul basaksehir",
    "basaksehir fk": "istanbul basaksehir",
    "caykur rizespor": "rizespor",
  };

  return aliases[normalized] ?? normalized;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10).replaceAll("-", "");
}

function dateWithOffset(date: Date, offset: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

async function fetchScoreboard(date: string): Promise<EspnEvent[]> {
  const response = await fetch(`${ESPN_SCOREBOARD_URL}?dates=${date}`, {
    headers: { "User-Agent": "Has-Gardaslar-Ligi" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Canlı sonuç kaynağı ${response.status} ile yanıt verdi.`);
  }

  const data = (await response.json()) as { events?: EspnEvent[] };
  return Array.isArray(data.events) ? data.events : [];
}

function findCompletedEvent(match: StoredMatch, events: EspnEvent[]): EspnEvent | null {
  const homeKey = normalizeTeamName(match.homeTeam);
  const awayKey = normalizeTeamName(match.awayTeam);

  return (
    events.find((event) => {
      const competition = event.competitions?.[0];
      if (competition?.status?.type?.completed !== true) return false;

      const home = competition.competitors?.find(
        (competitor) => competitor.homeAway === "home",
      );
      const away = competition.competitors?.find(
        (competitor) => competitor.homeAway === "away",
      );
      const sourceHome =
        typeof home?.team?.displayName === "string"
          ? home.team.displayName
          : "";
      const sourceAway =
        typeof away?.team?.displayName === "string"
          ? away.team.displayName
          : "";

      return (
        normalizeTeamName(sourceHome) === homeKey &&
        normalizeTeamName(sourceAway) === awayKey
      );
    }) ?? null
  );
}

async function fetchGoalEvents(
  eventId: string,
  match: StoredMatch,
): Promise<GoalEventDraft[]> {
  const response = await fetch(`${ESPN_SUMMARY_URL}?event=${eventId}`, {
    headers: { "User-Agent": "Has-Gardaslar-Ligi" },
    cache: "no-store",
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
    keyEvents?: Array<{
      type?: { type?: unknown };
      scoringPlay?: unknown;
      team?: { displayName?: unknown };
      participants?: Array<{ athlete?: { displayName?: unknown } }>;
    }>;
  };
  const homeKey = normalizeTeamName(match.homeTeam);

  return (data.keyEvents ?? []).flatMap((event): GoalEventDraft[] => {
    if (event.type?.type !== "goal" && event.scoringPlay !== true) return [];

    const scorer = event.participants?.[0]?.athlete?.displayName;
    const sourceTeam = event.team?.displayName;

    if (typeof scorer !== "string" || !scorer.trim()) return [];

    return [
      {
        side:
          typeof sourceTeam === "string" &&
          normalizeTeamName(sourceTeam) === homeKey
            ? "home"
            : "away",
        scorer: scorer.trim(),
        // ESPN'in ücretsiz akışı kişi bazlı asist bilgisi sunmadığı için
        // yönetici bu alanı sonuç kaydından önce tamamlar.
        assister: "",
      },
    ];
  });
}

export async function POST(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "Oturum bilgisi bulunamadı." },
        { status: 401 },
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userSnapshot = await adminDb
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (!userSnapshot.exists || userSnapshot.data()?.isAdmin !== true) {
      return NextResponse.json(
        { success: false, error: "Yönetici yetkisi gerekiyor." },
        { status: 403 },
      );
    }

    const now = Date.now();
    const oldestEligibleKickoff = now - 14 * 24 * 60 * 60 * 1000;
    const matchSnapshot = await adminDb
      .collection("matches")
      .where("status", "==", "scheduled")
      .get();
    const matches = matchSnapshot.docs.flatMap((matchDocument): StoredMatch[] => {
      const data = matchDocument.data();
      const kickoff = data.kickoff;

      if (
        !(kickoff instanceof Timestamp) ||
        kickoff.toMillis() > now ||
        kickoff.toMillis() < oldestEligibleKickoff ||
        typeof data.homeTeam !== "string" ||
        typeof data.awayTeam !== "string"
      ) {
        return [];
      }

      return [
        {
          id: matchDocument.id,
          kickoff,
          homeTeam: data.homeTeam,
          awayTeam: data.awayTeam,
        },
      ];
    });

    const dates = Array.from(
      new Set(
        matches.flatMap((match) => {
          const kickoff = match.kickoff.toDate();
          return [-1, 0, 1].map((offset) =>
            formatDate(dateWithOffset(kickoff, offset)),
          );
        }),
      ),
    );
    const scoreboards = await Promise.all(dates.map(fetchScoreboard));
    const events = scoreboards.flat();
    const results: ImportedResult[] = [];

    for (const match of matches) {
      const event = findCompletedEvent(match, events);
      const competition = event?.competitions?.[0];
      const home = competition?.competitors?.find(
        (competitor) => competitor.homeAway === "home",
      );
      const away = competition?.competitors?.find(
        (competitor) => competitor.homeAway === "away",
      );
      const eventId = typeof event?.id === "string" ? event.id : "";
      const homeScore = numberValue(home?.score);
      const awayScore = numberValue(away?.score);

      if (!eventId || homeScore === null || awayScore === null) continue;

      results.push({
        matchId: match.id,
        homeScore,
        awayScore,
        goalEvents: await fetchGoalEvents(eventId, match),
        sourceEventId: eventId,
      });
    }

    return NextResponse.json({
      success: true,
      results,
      checkedMatchCount: matches.length,
      matchedResultCount: results.length,
    });
  } catch (error) {
    console.error("Otomatik maç sonuçları alınamadı:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Otomatik sonuçlar alınamadı.",
      },
      { status: 502 },
    );
  }
}
