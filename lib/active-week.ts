/** Active week is chosen by an administrator, never derived from match dates. */
export function getAdminActiveWeek(data: Record<string, unknown>, seasonId: string): number | null {
  return data.activeWeekSeasonId === seasonId &&
    typeof data.activeWeek === "number" && Number.isInteger(data.activeWeek) && data.activeWeek > 0
    ? data.activeWeek : null;
}
