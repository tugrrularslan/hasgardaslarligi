/**
 * Creates a stable, human-name-based player key for data that predates player
 * IDs. Team is intentionally not included: seasonal goal and assist totals
 * belong to the player even if they change teams during the season.
 */
export function getPlayerIdentityKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[’'`´.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
