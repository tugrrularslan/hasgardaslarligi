export type ThemeId =
  | "obsidyen"
  | "hitit-zeytini"
  | "traverten"
  | "bazalt";

export type AppTheme = {
  id: ThemeId;
  name: string;
  requiredPoints: number;
  description: string;
  icon: string;
  emblem: string;
  pageClass: string;
  headerClass: string;
  cardClass: string;
  secondaryCardClass: string;
  primaryButtonClass: string;
  secondaryButtonClass: string;
  titleClass: string;
  textClass: string;
  mutedTextClass: string;
  borderClass: string;
  badgeClass: string;
  previewClass: string;
};

export const appThemes: AppTheme[] = [
  {
    id: "obsidyen",
    name: "Obsidyen",
    requiredPoints: 0,
    description: "Siyah taş, altın çizgiler ve mor obsidyen parıltısı.",
    icon: "◆",
    emblem: "/themes/obsidyen.png",
    pageClass: "theme-surface theme-obsidyen text-stone-50",
    headerClass: "theme-panel border-amber-400/45 bg-black/72 shadow-[0_18px_60px_rgba(0,0,0,.42)]",
    cardClass: "theme-panel border-amber-400/35 bg-black/74 shadow-[0_16px_45px_rgba(0,0,0,.32)]",
    secondaryCardClass: "theme-panel-soft border-violet-400/20 bg-violet-950/20",
    primaryButtonClass: "border border-amber-300/50 bg-gradient-to-r from-amber-500 to-yellow-300 text-black shadow-lg hover:brightness-110",
    secondaryButtonClass: "border border-amber-400/45 bg-black/35 text-amber-200 hover:bg-amber-400/10",
    titleClass: "text-amber-200",
    textClass: "text-stone-100",
    mutedTextClass: "text-amber-100/65",
    borderClass: "border-amber-400/30",
    badgeClass: "border border-amber-300/40 bg-amber-400/15 text-amber-200",
    previewClass: "theme-preview preview-obsidyen border-amber-400/45",
  },
  {
    id: "hitit-zeytini",
    name: "Hitit Zeytini",
    requiredPoints: 0,
    description: "Zeytin yeşili, kum taşı ve bronz Hitit ayrıntıları.",
    icon: "❧",
    emblem: "/themes/hitit-zeytini.png",
    pageClass: "theme-surface theme-hitit text-lime-50",
    headerClass: "theme-panel border-yellow-500/35 bg-[#18200e]/78 shadow-[0_18px_60px_rgba(10,20,4,.45)]",
    cardClass: "theme-panel border-yellow-500/30 bg-[#18200e]/76 shadow-[0_16px_45px_rgba(8,18,4,.35)]",
    secondaryCardClass: "theme-panel-soft border-lime-400/20 bg-lime-950/25",
    primaryButtonClass: "border border-yellow-300/50 bg-gradient-to-r from-[#777c25] to-[#bfa64d] text-[#111407] shadow-lg hover:brightness-110",
    secondaryButtonClass: "border border-yellow-500/40 bg-[#111707]/45 text-yellow-200 hover:bg-lime-500/10",
    titleClass: "text-yellow-200",
    textClass: "text-lime-50",
    mutedTextClass: "text-lime-100/60",
    borderClass: "border-yellow-500/28",
    badgeClass: "border border-yellow-300/35 bg-lime-400/12 text-yellow-200",
    previewClass: "theme-preview preview-hitit border-yellow-500/40",
  },
  {
    id: "traverten",
    name: "Traverten",
    requiredPoints: 0,
    description: "Açık taş yüzeyler, bronz zarafet ve ferah bir görünüm.",
    icon: "◫",
    emblem: "/themes/traverten.png",
    pageClass: "theme-surface theme-traverten text-[#392515]",
    headerClass: "theme-panel border-[#9b6631]/40 bg-[#f1dfbd]/80 shadow-[0_18px_60px_rgba(85,52,20,.22)]",
    cardClass: "theme-panel border-[#9b6631]/35 bg-[#ead5ae]/82 shadow-[0_16px_42px_rgba(84,50,18,.2)]",
    secondaryCardClass: "theme-panel-soft border-[#9b6631]/30 bg-[#fff1d2]/58",
    primaryButtonClass: "border border-[#78451d]/45 bg-gradient-to-r from-[#8a5528] to-[#bd8c4b] text-white shadow-lg hover:brightness-110",
    secondaryButtonClass: "border border-[#78451d]/45 bg-[#f8e6c6]/55 text-[#5f3518] hover:bg-[#d8b783]/35",
    titleClass: "text-[#5d3318]",
    textClass: "text-[#3d2818]",
    mutedTextClass: "text-[#654a34]/72",
    borderClass: "border-[#8b5b32]/30",
    badgeClass: "border border-[#845128]/35 bg-[#8b5524]/12 text-[#683b1c]",
    previewClass: "theme-preview preview-traverten border-[#8b5b32]/45",
  },
  {
    id: "bazalt",
    name: "Bazalt",
    requiredPoints: 0,
    description: "Bazalt siyahı, bakır vurgular ve sert volkanik yüzeyler.",
    icon: "▲",
    emblem: "/themes/bazalt.png",
    pageClass: "theme-surface theme-bazalt text-zinc-100",
    headerClass: "theme-panel border-orange-500/38 bg-[#111214]/80 shadow-[0_18px_60px_rgba(0,0,0,.46)]",
    cardClass: "theme-panel border-orange-500/30 bg-[#111214]/78 shadow-[0_16px_45px_rgba(0,0,0,.38)]",
    secondaryCardClass: "theme-panel-soft border-orange-500/22 bg-orange-950/18",
    primaryButtonClass: "border border-orange-400/50 bg-gradient-to-r from-[#8d3514] to-[#d56f2b] text-white shadow-lg hover:brightness-110",
    secondaryButtonClass: "border border-orange-500/40 bg-black/35 text-orange-300 hover:bg-orange-500/10",
    titleClass: "text-orange-300",
    textClass: "text-zinc-100",
    mutedTextClass: "text-zinc-400",
    borderClass: "border-orange-500/28",
    badgeClass: "border border-orange-400/35 bg-orange-500/12 text-orange-300",
    previewClass: "theme-preview preview-bazalt border-orange-500/40",
  },
];

export const defaultTheme = appThemes[0];

const legacyThemeAliases: Record<string, ThemeId> = {
  klasik: "obsidyen",
  Klasik: "obsidyen",
  "gıdala": "hitit-zeytini",
  ganara: "traverten",
  "rüzgar": "bazalt",
  batti: "obsidyen",
  "yalçın": "traverten",
  oktay: "obsidyen",
  harun: "hitit-zeytini",
  "alayınızı gavladırım": "bazalt",
  "deli gobel": "bazalt",
};

export function normalizeThemeId(selectedTheme?: string | null): ThemeId {
  const clean = selectedTheme?.trim();
  if (!clean) return defaultTheme.id;
  if (appThemes.some((theme) => theme.id === clean)) return clean as ThemeId;
  return legacyThemeAliases[clean] ?? defaultTheme.id;
}

export function getThemeById(selectedTheme?: string | null): AppTheme {
  const normalized = normalizeThemeId(selectedTheme);
  return appThemes.find((theme) => theme.id === normalized) ?? defaultTheme;
}

export function isThemeUnlocked(
  _theme?: AppTheme,
  _totalPoints?: number,
  _isAdmin?: boolean
): boolean {
  return true;
}
