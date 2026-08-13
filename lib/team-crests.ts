import { getLeagueTeamCrestFile } from "@/lib/league-data";

export function getTeamCrestUrl(team: string): string | null {
  const fileName = getLeagueTeamCrestFile(team);

  return fileName ? `/team-crests/${fileName}.png` : null;
}
