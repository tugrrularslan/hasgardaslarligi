import { canonicalTeamName, type Score } from "./super-lig-sync.ts";
import { getPlayerIdentityKey } from "./player-identity.ts";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const name = (value: unknown) => typeof value === "string" ? value.trim() : "";
const integer = (value: unknown) => (typeof value === "number" || typeof value === "string") && /^\d+$/.test(String(value)) ? Number(value) : null;
export type MatchAssistTotal = { team: string; player: string; playerKey: string; count: number };
export type ImportedGoal = { side: "home" | "away"; scorer: string; assister: string; ownGoal: boolean };
export type MatchDetailContext = Score & { sourceEventId: string; homeTeam: string; awayTeam: string };
export type ImportedMatchDetails = { goalEvents: ImportedGoal[]; assistTotals: MatchAssistTotal[] | null };

/** Reject foreign, live, incomplete or score-inconsistent summaries before importing any detail. */
export function parseEspnMatchDetails(payload: unknown, expected: MatchDetailContext): ImportedMatchDetails | null {
  const data = record(payload);
  const header = record(data.header);
  if (name(header.id) !== expected.sourceEventId) return null;
  const competition = record(list(header.competitions)[0]);
  if (record(record(competition.status).type).completed !== true) return null;
  const competitors = list(competition.competitors).map(record);
  const home = competitors.find(value => value.homeAway === "home");
  const away = competitors.find(value => value.homeAway === "away");
  if (!home || !away || canonicalTeamName(name(record(home.team).displayName)) !== expected.homeTeam ||
      canonicalTeamName(name(record(away.team).displayName)) !== expected.awayTeam ||
      integer(home.score) !== expected.homeScore || integer(away.score) !== expected.awayScore) return null;
  const sideForTeam = (value: unknown): "home" | "away" | null => {
    const team = canonicalTeamName(name(record(value).displayName));
    return team === expected.homeTeam ? "home" : team === expected.awayTeam ? "away" : null;
  };
  const rosters = list(data.rosters).map(record);
  const playerSides = new Map<string, "home" | "away">();
  for (const roster of rosters) {
    const side = sideForTeam(roster.team);
    if (!side) continue;
    for (const value of list(roster.roster)) {
      const athlete = record(record(value).athlete);
      playerSides.set(getPlayerIdentityKey(name(athlete.displayName)), side);
    }
  }
  const goals: ImportedGoal[] = [];
  const seen = new Set<string>();
  for (const value of list(data.keyEvents)) {
    const event = record(value);
    const type = record(event.type).type;
    if (event.shootout === true || event.valid === false ||
        !(event.scoringPlay === true || ["goal", "own-goal", "penalty---scored"].includes(String(type)))) continue;
    const id = name(event.id);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const participants = list(event.participants).map(record);
    const scorerParticipant = participants.find(value => value.type === "scorer") ?? participants[0];
    const scorer = name(record(record(scorerParticipant).athlete).displayName);
    if (!scorer || scorer.length > 120) return null;
    const ownGoal = event.ownGoal === true || type === "own-goal";
    let side = sideForTeam(event.team);
    if (ownGoal) {
      const scorerSide = playerSides.get(getPlayerIdentityKey(scorer));
      if (!scorerSide) return null;
      side = scorerSide === "home" ? "away" : "home";
    }
    if (!side) return null;
    const assistParticipant = participants.find(value => ["assist", "assister", "assisting"].includes(String(value.type)));
    let assister = name(record(record(assistParticipant).athlete).displayName);
    // Some feeds put a goal's explicit assist only in its matching commentary text.
    if (!assister && !ownGoal) {
      const commentary = list(data.commentary).map(record).find(value => name(record(value.play).id) === id);
      const text = name(commentary?.text);
      const match = text.match(/Assisted by (.+?)(?: with | following |\.|$)/i);
      if (match) {
        const candidate = match[1].trim();
        if (playerSides.get(getPlayerIdentityKey(candidate)) === side) assister = candidate;
      }
    }
    if (ownGoal) assister = "";
    if (assister.length > 120 || (assister && assister === scorer)) return null;
    goals.push({ side, scorer, assister, ownGoal });
  }
  if (goals.filter(goal => goal.side === "home").length !== expected.homeScore ||
      goals.filter(goal => goal.side === "away").length !== expected.awayScore) return null;

  const totals: MatchAssistTotal[] = [];
  let totalsComplete = true;
  for (const side of ["home", "away"] as const) {
    const roster = rosters.find(value => sideForTeam(value.team) === side);
    if (!roster) { totalsComplete = false; continue; }
    const players = list(roster.roster).map(record).filter(value => value.active === true || value.starter === true || value.subbedIn === true);
    if (players.length < 11) { totalsComplete = false; continue; }
    const keys = new Set<string>();
    let total = 0;
    for (const player of players) {
      const playerName = name(record(player.athlete).displayName);
      const key = getPlayerIdentityKey(playerName);
      const stat = list(player.stats).map(record).find(value => value.name === "goalAssists");
      const count = integer(stat?.value ?? stat?.displayValue);
      if (!key || playerName.length > 120 || keys.has(key) || count === null || count > 20) { totalsComplete = false; continue; }
      keys.add(key);
      total += count;
      if (count > 0) totals.push({ team: side === "home" ? expected.homeTeam : expected.awayTeam, player: playerName, playerKey: key, count });
    }
    if (total > goals.filter(goal => goal.side === side && !goal.ownGoal).length) totalsComplete = false;
  }
  return { goalEvents: goals, assistTotals: totalsComplete ? totals : null };
}

/** Prefer confirmed match totals; otherwise count explicitly linked manual/source assists. */
export function getMatchAssistTotals(match: Record<string, unknown>): MatchAssistTotal[] {
  if (match.assistDetailsStatus === "complete" && Array.isArray(match.assistTotals)) {
    return match.assistTotals.flatMap(value => {
      const row = record(value);
      const count = integer(row.count);
      const player = name(row.player);
      const team = name(row.team);
      return count !== null && count > 0 && count <= 20 && player && team
        ? [{ team, player, playerKey: getPlayerIdentityKey(player), count }] : [];
    });
  }
  const totals = new Map<string, MatchAssistTotal>();
  for (const value of list(match.goalEvents)) {
    const goal = record(value);
    const player = name(goal.assister);
    const team = name(goal.team);
    if (!player || !team || goal.ownGoal === true) continue;
    const playerKey = getPlayerIdentityKey(player);
    const key = `${team}:${playerKey}`;
    const row = totals.get(key) ?? { team, player, playerKey, count: 0 };
    row.count++;
    totals.set(key, row);
  }
  return [...totals.values()];
}
