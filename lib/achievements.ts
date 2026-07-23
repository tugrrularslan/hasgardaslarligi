export type BadgeRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary"
  | "secret";

export type BadgeCategory =
  | "prediction"
  | "weekly"
  | "season"
  | "participation"
  | "special";

export type BadgeRequirementType =
  | "total-correct"
  | "weekly-correct"
  | "perfect-week"
  | "consecutive-correct"
  | "weekly-win"
  | "consecutive-weekly-win"
  | "participated-weeks"
  | "season-complete";

export type BadgeDefinition = {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  rarity: BadgeRarity;
  category: BadgeCategory;
  image: string;
  requirementType: BadgeRequirementType;
  requirementValue: number;
  hidden?: boolean;
  sortOrder: number;
};

export type BadgeProgressData = {
  totalCorrectPredictions: number;
  currentWeekCorrectPredictions: number;
  currentWeekTotalMatches: number;
  consecutiveCorrectPredictions: number;
  weeklyWins: number;
  consecutiveWeeklyWins: number;
  participatedWeeks: number;
  completedSeasons: number;
};

export type BadgeProgressResult = {
  badge: BadgeDefinition;
  currentValue: number;
  targetValue: number;
  percentage: number;
  unlocked: boolean;
};

export const BADGES: BadgeDefinition[] = [
  {
    id: "ilk-kan",
    name: "İlk Kan",
    description: "İlk doğru maç tahminini yap.",
    shortDescription: "İlk doğru tahmin",
    rarity: "common",
    category: "prediction",
    image: "/badges/ilk-kan.svg",
    requirementType: "total-correct",
    requirementValue: 1,
    sortOrder: 1,
  },
  {
    id: "hat-trick",
    name: "Hat-trick",
    description: "Aynı hafta içerisinde en az 3 doğru tahmin yap.",
    shortDescription: "Bir haftada 3 doğru",
    rarity: "common",
    category: "weekly",
    image: "/badges/hat-trick.svg",
    requirementType: "weekly-correct",
    requirementValue: 3,
    sortOrder: 2,
  },
  {
    id: "besibirlik",
    name: "Beşibirlik",
    description: "Aynı hafta içerisinde en az 5 doğru tahmin yap.",
    shortDescription: "Bir haftada 5 doğru",
    rarity: "rare",
    category: "weekly",
    image: "/badges/besibirlik.svg",
    requirementType: "weekly-correct",
    requirementValue: 5,
    sortOrder: 3,
  },
  {
    id: "gobel-ne-biliyo-la",
    name: "Gobel Ne Biliyo La",
    description:
      "Bir haftadaki bütün maçların sonuçlarını doğru tahmin et.",
    shortDescription: "Kusursuz hafta",
    rarity: "legendary",
    category: "weekly",
    image: "/badges/gobel-ne-biliyo-la.svg",
    requirementType: "perfect-week",
    requirementValue: 1,
    sortOrder: 4,
  },
  {
    id: "yaniyo",
    name: "Yanıyo",
    description: "Arka arkaya en az 5 maçın sonucunu doğru tahmin et.",
    shortDescription: "Üst üste 5 doğru",
    rarity: "rare",
    category: "prediction",
    image: "/badges/yaniyo.svg",
    requirementType: "consecutive-correct",
    requirementValue: 5,
    sortOrder: 5,
  },
  {
    id: "makine",
    name: "Makine",
    description: "Toplam 25 doğru maç tahminine ulaş.",
    shortDescription: "Toplam 25 doğru",
    rarity: "rare",
    category: "prediction",
    image: "/badges/makine.svg",
    requirementType: "total-correct",
    requirementValue: 25,
    sortOrder: 6,
  },
  {
    id: "esas-gobel",
    name: "Esas Gobel",
    description: "Toplam 100 doğru maç tahminine ulaş.",
    shortDescription: "Toplam 100 doğru",
    rarity: "epic",
    category: "prediction",
    image: "/badges/esas-gobel.svg",
    requirementType: "total-correct",
    requirementValue: 100,
    sortOrder: 7,
  },
  {
    id: "ilk-zafer",
    name: "İlk Zafer",
    description: "İlk kez hafta şampiyonu ol.",
    shortDescription: "İlk hafta şampiyonluğu",
    rarity: "common",
    category: "weekly",
    image: "/badges/ilk-zafer.svg",
    requirementType: "weekly-win",
    requirementValue: 1,
    sortOrder: 8,
  },
  {
    id: "seri-sampiyon",
    name: "Seri Şampiyon",
    description: "Arka arkaya 2 kez hafta şampiyonu ol.",
    shortDescription: "Üst üste 2 şampiyonluk",
    rarity: "epic",
    category: "weekly",
    image: "/badges/seri-sampiyon.svg",
    requirementType: "consecutive-weekly-win",
    requirementValue: 2,
    sortOrder: 9,
  },
  {
    id: "hafta-canavari",
    name: "Hafta Canavarı",
    description: "Toplam 5 kez hafta şampiyonu ol.",
    shortDescription: "5 hafta şampiyonluğu",
    rarity: "epic",
    category: "weekly",
    image: "/badges/hafta-canavari.svg",
    requirementType: "weekly-win",
    requirementValue: 5,
    sortOrder: 10,
  },
  {
    id: "sadik-gardas",
    name: "Sadık Gardaş",
    description: "En az 10 farklı haftada tahmin yap.",
    shortDescription: "10 hafta katılım",
    rarity: "rare",
    category: "participation",
    image: "/badges/sadik-gardas.svg",
    requirementType: "participated-weeks",
    requirementValue: 10,
    sortOrder: 11,
  },
  {
    id: "sezon-emektari",
    name: "Sezon Emektarı",
    description: "Bir sezonu en az bir tahmin yaparak tamamla.",
    shortDescription: "Bir sezonu tamamla",
    rarity: "epic",
    category: "season",
    image: "/badges/sezon-emektari.svg",
    requirementType: "season-complete",
    requirementValue: 1,
    sortOrder: 12,
  },
];

export const BADGE_IDS = BADGES.map((badge) => badge.id);

export const MAX_SELECTED_BADGES = 3;

export const DEFAULT_BADGE_PROGRESS: BadgeProgressData = {
  totalCorrectPredictions: 0,
  currentWeekCorrectPredictions: 0,
  currentWeekTotalMatches: 0,
  consecutiveCorrectPredictions: 0,
  weeklyWins: 0,
  consecutiveWeeklyWins: 0,
  participatedWeeks: 0,
  completedSeasons: 0,
};

export const BADGE_RARITY_LABELS: Record<BadgeRarity, string> = {
  common: "Yaygın",
  rare: "Nadir",
  epic: "Destansı",
  legendary: "Efsanevi",
  secret: "Gizli",
};

export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  prediction: "Tahmin",
  weekly: "Haftalık Başarı",
  season: "Sezon",
  participation: "Katılım",
  special: "Özel",
};

export function getBadgeById(
  badgeId: string | null | undefined,
): BadgeDefinition | undefined {
  if (!badgeId) {
    return undefined;
  }

  return BADGES.find((badge) => badge.id === badgeId);
}

export function getBadgesByIds(
  badgeIds: string[] | null | undefined,
): BadgeDefinition[] {
  if (!Array.isArray(badgeIds)) {
    return [];
  }

  return badgeIds
    .map((badgeId) => getBadgeById(badgeId))
    .filter((badge): badge is BadgeDefinition => Boolean(badge));
}

export function isValidBadgeId(badgeId: unknown): badgeId is string {
  return (
    typeof badgeId === "string" &&
    BADGES.some((badge) => badge.id === badgeId)
  );
}

export function sanitizeBadgeIds(
  badgeIds: unknown,
  maximum?: number,
): string[] {
  if (!Array.isArray(badgeIds)) {
    return [];
  }

  const uniqueBadgeIds = Array.from(
    new Set(badgeIds.filter(isValidBadgeId)),
  );

  if (typeof maximum === "number") {
    return uniqueBadgeIds.slice(0, Math.max(0, maximum));
  }

  return uniqueBadgeIds;
}

export function sanitizeSelectedBadges(
  selectedBadgeIds: unknown,
  unlockedBadgeIds: unknown,
): string[] {
  const unlocked = sanitizeBadgeIds(unlockedBadgeIds);
  const selected = sanitizeBadgeIds(
    selectedBadgeIds,
    MAX_SELECTED_BADGES,
  );

  return selected.filter((badgeId) => unlocked.includes(badgeId));
}

export function getBadgeCurrentValue(
  badge: BadgeDefinition,
  progress: BadgeProgressData,
): number {
  switch (badge.requirementType) {
    case "total-correct":
      return progress.totalCorrectPredictions;

    case "weekly-correct":
      return progress.currentWeekCorrectPredictions;

    case "perfect-week": {
      const hasMatches = progress.currentWeekTotalMatches > 0;
      const isPerfectWeek =
        hasMatches &&
        progress.currentWeekCorrectPredictions ===
          progress.currentWeekTotalMatches;

      return isPerfectWeek ? 1 : 0;
    }

    case "consecutive-correct":
      return progress.consecutiveCorrectPredictions;

    case "weekly-win":
      return progress.weeklyWins;

    case "consecutive-weekly-win":
      return progress.consecutiveWeeklyWins;

    case "participated-weeks":
      return progress.participatedWeeks;

    case "season-complete":
      return progress.completedSeasons;

    default:
      return 0;
  }
}

export function isBadgeUnlocked(
  badge: BadgeDefinition,
  progress: BadgeProgressData,
): boolean {
  const currentValue = getBadgeCurrentValue(badge, progress);

  return currentValue >= badge.requirementValue;
}

export function calculateBadgePercentage(
  currentValue: number,
  targetValue: number,
): number {
  if (targetValue <= 0) {
    return 100;
  }

  const percentage = (currentValue / targetValue) * 100;

  return Math.max(0, Math.min(100, Math.round(percentage)));
}

export function getBadgeProgress(
  badge: BadgeDefinition,
  progress: BadgeProgressData,
): BadgeProgressResult {
  const currentValue = getBadgeCurrentValue(badge, progress);
  const targetValue = badge.requirementValue;
  const unlocked = currentValue >= targetValue;

  return {
    badge,
    currentValue,
    targetValue,
    percentage: calculateBadgePercentage(currentValue, targetValue),
    unlocked,
  };
}

export function getAllBadgeProgress(
  progress: BadgeProgressData,
): BadgeProgressResult[] {
  return BADGES.map((badge) => getBadgeProgress(badge, progress));
}

export function calculateUnlockedBadgeIds(
  progress: BadgeProgressData,
): string[] {
  return BADGES.filter((badge) => isBadgeUnlocked(badge, progress)).map(
    (badge) => badge.id,
  );
}

export function findNewlyUnlockedBadgeIds(
  currentUnlockedBadgeIds: unknown,
  progress: BadgeProgressData,
): string[] {
  const currentUnlocked = sanitizeBadgeIds(currentUnlockedBadgeIds);
  const calculatedUnlocked = calculateUnlockedBadgeIds(progress);

  return calculatedUnlocked.filter(
    (badgeId) => !currentUnlocked.includes(badgeId),
  );
}

export function mergeUnlockedBadgeIds(
  currentUnlockedBadgeIds: unknown,
  newBadgeIds: unknown,
): string[] {
  const currentUnlocked = sanitizeBadgeIds(currentUnlockedBadgeIds);
  const newUnlocked = sanitizeBadgeIds(newBadgeIds);

  return Array.from(new Set([...currentUnlocked, ...newUnlocked]));
}

export function normalizeBadgeProgress(
  progress: Partial<BadgeProgressData> | null | undefined,
): BadgeProgressData {
  return {
    totalCorrectPredictions: normalizePositiveNumber(
      progress?.totalCorrectPredictions,
    ),
    currentWeekCorrectPredictions: normalizePositiveNumber(
      progress?.currentWeekCorrectPredictions,
    ),
    currentWeekTotalMatches: normalizePositiveNumber(
      progress?.currentWeekTotalMatches,
    ),
    consecutiveCorrectPredictions: normalizePositiveNumber(
      progress?.consecutiveCorrectPredictions,
    ),
    weeklyWins: normalizePositiveNumber(progress?.weeklyWins),
    consecutiveWeeklyWins: normalizePositiveNumber(
      progress?.consecutiveWeeklyWins,
    ),
    participatedWeeks: normalizePositiveNumber(
      progress?.participatedWeeks,
    ),
    completedSeasons: normalizePositiveNumber(
      progress?.completedSeasons,
    ),
  };
}

export function sortBadges(
  badges: BadgeDefinition[],
): BadgeDefinition[] {
  return [...badges].sort((firstBadge, secondBadge) => {
    return firstBadge.sortOrder - secondBadge.sortOrder;
  });
}

export function getUnlockedBadges(
  unlockedBadgeIds: unknown,
): BadgeDefinition[] {
  return sortBadges(getBadgesByIds(sanitizeBadgeIds(unlockedBadgeIds)));
}

export function getLockedBadges(
  unlockedBadgeIds: unknown,
): BadgeDefinition[] {
  const unlocked = sanitizeBadgeIds(unlockedBadgeIds);

  return sortBadges(
    BADGES.filter((badge) => !unlocked.includes(badge.id)),
  );
}

export function getVisibleLockedBadges(
  unlockedBadgeIds: unknown,
): BadgeDefinition[] {
  return getLockedBadges(unlockedBadgeIds).filter(
    (badge) => !badge.hidden,
  );
}

export function getSelectedBadgeDefinitions(
  selectedBadgeIds: unknown,
  unlockedBadgeIds: unknown,
): BadgeDefinition[] {
  const selected = sanitizeSelectedBadges(
    selectedBadgeIds,
    unlockedBadgeIds,
  );

  return getBadgesByIds(selected);
}

export function getActiveTitleBadge(
  activeTitle: unknown,
  unlockedBadgeIds: unknown,
): BadgeDefinition | undefined {
  if (typeof activeTitle !== "string") {
    return undefined;
  }

  const unlocked = sanitizeBadgeIds(unlockedBadgeIds);

  if (!unlocked.includes(activeTitle)) {
    return undefined;
  }

  return getBadgeById(activeTitle);
}

export function createDefaultBadgeFields() {
  return {
    unlockedBadges: [] as string[],
    selectedBadges: [] as string[],
    activeTitle: "",
    badgeProgress: DEFAULT_BADGE_PROGRESS,
  };
}

function normalizePositiveNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}