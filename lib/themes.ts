export type ThemeId =
  | "klasik"
  | "gıdala"
  | "ganara"
  | "rüzgar"
  | "batti"
  | "yalçın"
  | "oktay"
  | "harun"
  | "alayınızı gavladırım"
  | "deli gobel";

export type AppTheme = {
  id: ThemeId;
  name: string;
  requiredPoints: number;
  description: string;
  icon: string;

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
    id: "klasik",
    name: "Klasik",
    requiredPoints: 0,
    description: "Kırmızı ve beyaz klasik futbol görünümü.",
    icon: "⚽",

    pageClass:
      "bg-gradient-to-br from-red-950 via-red-900 to-black text-white",

    headerClass:
      "border-red-400/40 bg-red-950/70",

    cardClass:
      "border-red-400/40 bg-red-950/80",

    secondaryCardClass:
      "border-white/20 bg-white/10",

    primaryButtonClass:
      "bg-white text-red-700 hover:bg-red-100",

    secondaryButtonClass:
      "border border-white text-white hover:bg-white/10",

    titleClass: "text-white",
    textClass: "text-white",
    mutedTextClass: "text-red-100/70",

    borderClass: "border-red-400/40",

    badgeClass:
      "bg-white text-red-700",

    previewClass:
      "border-red-400/50 bg-gradient-to-br from-red-700 via-red-900 to-white/20",
  },

  {
    id: "gıdala",
    name: "gıdala",
    requiredPoints: 10,
    description: "Yeşil saha ve çim havası.",
    icon: "🌱",

    pageClass:
      "bg-gradient-to-br from-green-950 via-emerald-900 to-black text-white",

    headerClass:
      "border-green-400/40 bg-green-950/70",

    cardClass:
      "border-green-400/40 bg-green-950/80",

    secondaryCardClass:
      "border-green-300/20 bg-green-500/10",

    primaryButtonClass:
      "bg-green-400 text-green-950 hover:bg-green-300",

    secondaryButtonClass:
      "border border-green-400 text-green-300 hover:bg-green-500/10",

    titleClass: "text-green-300",
    textClass: "text-white",
    mutedTextClass: "text-green-100/60",

    borderClass: "border-green-400/40",

    badgeClass:
      "bg-green-400 text-green-950",

    previewClass:
      "border-green-400/50 bg-gradient-to-br from-green-700 via-emerald-950 to-black",
  },

  {
    id: "ganara",
    name: "ganara",
    requiredPoints: 20,
    description: "Turkuaz ve neon görünümlü tema.",
    icon: "💎",

    pageClass:
      "bg-gradient-to-br from-cyan-950 via-teal-900 to-black text-white",

    headerClass:
      "border-cyan-400/40 bg-cyan-950/70",

    cardClass:
      "border-cyan-400/40 bg-cyan-950/80",

    secondaryCardClass:
      "border-cyan-300/20 bg-cyan-500/10",

    primaryButtonClass:
      "bg-cyan-400 text-cyan-950 hover:bg-cyan-300",

    secondaryButtonClass:
      "border border-cyan-400 text-cyan-300 hover:bg-cyan-500/10",

    titleClass: "text-cyan-300",
    textClass: "text-white",
    mutedTextClass: "text-cyan-100/60",

    borderClass: "border-cyan-400/40",

    badgeClass:
      "bg-cyan-400 text-cyan-950",

    previewClass:
      "border-cyan-400/50 bg-gradient-to-br from-cyan-500 via-teal-900 to-black",
  },

  {
    id: "rüzgar",
    name: "rüzgar",
    requiredPoints: 35,
    description: "Mavi ve hareketli rüzgâr görünümü.",
    icon: "🌪️",

    pageClass:
      "bg-gradient-to-br from-blue-950 via-blue-900 to-slate-950 text-white",

    headerClass:
      "border-blue-400/40 bg-blue-950/70",

    cardClass:
      "border-blue-400/40 bg-blue-950/80",

    secondaryCardClass:
      "border-blue-300/20 bg-blue-500/10",

    primaryButtonClass:
      "bg-blue-400 text-blue-950 hover:bg-blue-300",

    secondaryButtonClass:
      "border border-blue-400 text-blue-300 hover:bg-blue-500/10",

    titleClass: "text-blue-300",
    textClass: "text-white",
    mutedTextClass: "text-blue-100/60",

    borderClass: "border-blue-400/40",

    badgeClass:
      "bg-blue-400 text-blue-950",

    previewClass:
      "border-blue-400/50 bg-gradient-to-br from-sky-500 via-blue-900 to-slate-950",
  },

  {
    id: "batti",
    name: "batti",
    requiredPoints: 50,
    description: "Tam siyah ve premium görünüm.",
    icon: "🌑",

    pageClass:
      "bg-black text-white",

    headerClass:
      "border-zinc-700 bg-zinc-950",

    cardClass:
      "border-zinc-700 bg-zinc-950",

    secondaryCardClass:
      "border-zinc-800 bg-zinc-900",

    primaryButtonClass:
      "bg-white text-black hover:bg-zinc-200",

    secondaryButtonClass:
      "border border-zinc-600 text-white hover:bg-zinc-900",

    titleClass: "text-white",
    textClass: "text-zinc-100",
    mutedTextClass: "text-zinc-500",

    borderClass: "border-zinc-700",

    badgeClass:
      "bg-white text-black",

    previewClass:
      "border-zinc-700 bg-gradient-to-br from-zinc-800 via-black to-black",
  },

  {
    id: "yalçın",
    name: "yalçın",
    requiredPoints: 75,
    description: "Beyaz, sade ve temiz görünüm.",
    icon: "🏔️",

    pageClass:
      "bg-gradient-to-br from-white via-zinc-100 to-zinc-300 text-zinc-950",

    headerClass:
      "border-zinc-300 bg-white/80",

    cardClass:
      "border-zinc-300 bg-white/90",

    secondaryCardClass:
      "border-zinc-300 bg-zinc-100",

    primaryButtonClass:
      "bg-zinc-950 text-white hover:bg-zinc-800",

    secondaryButtonClass:
      "border border-zinc-500 text-zinc-900 hover:bg-zinc-200",

    titleClass: "text-zinc-950",
    textClass: "text-zinc-900",
    mutedTextClass: "text-zinc-500",

    borderClass: "border-zinc-300",

    badgeClass:
      "bg-zinc-950 text-white",

    previewClass:
      "border-zinc-300 bg-gradient-to-br from-white via-zinc-100 to-zinc-400",
  },

  {
    id: "oktay",
    name: "oktay",
    requiredPoints: 100,
    description: "Mor ve neon etkili güçlü görünüm.",
    icon: "🟣",

    pageClass:
      "bg-gradient-to-br from-purple-950 via-violet-900 to-black text-white",

    headerClass:
      "border-purple-400/40 bg-purple-950/70",

    cardClass:
      "border-purple-400/40 bg-purple-950/80",

    secondaryCardClass:
      "border-purple-300/20 bg-purple-500/10",

    primaryButtonClass:
      "bg-purple-400 text-purple-950 hover:bg-purple-300",

    secondaryButtonClass:
      "border border-purple-400 text-purple-300 hover:bg-purple-500/10",

    titleClass: "text-purple-300",
    textClass: "text-white",
    mutedTextClass: "text-purple-100/60",

    borderClass: "border-purple-400/40",

    badgeClass:
      "bg-purple-400 text-purple-950",

    previewClass:
      "border-purple-400/50 bg-gradient-to-br from-purple-500 via-violet-950 to-black",
  },

  {
    id: "harun",
    name: "harun",
    requiredPoints: 150,
    description: "Altın ve siyah VIP görünümü.",
    icon: "👑",

    pageClass:
      "bg-gradient-to-br from-yellow-950 via-black to-black text-white",

    headerClass:
      "border-yellow-400/50 bg-black/80",

    cardClass:
      "border-yellow-400/50 bg-black/80",

    secondaryCardClass:
      "border-yellow-400/20 bg-yellow-500/10",

    primaryButtonClass:
      "bg-yellow-400 text-black hover:bg-yellow-300",

    secondaryButtonClass:
      "border border-yellow-400 text-yellow-300 hover:bg-yellow-500/10",

    titleClass: "text-yellow-300",
    textClass: "text-white",
    mutedTextClass: "text-yellow-100/60",

    borderClass: "border-yellow-400/50",

    badgeClass:
      "bg-yellow-400 text-black",

    previewClass:
      "border-yellow-400/60 bg-gradient-to-br from-yellow-500 via-yellow-950 to-black",
  },

  {
    id: "alayınızı gavladırım",
    name: "alayınızı gavladırım",
    requiredPoints: 200,
    description: "Kırmızı ve siyah agresif görünüm.",
    icon: "😈",

    pageClass:
      "bg-gradient-to-br from-red-950 via-black to-black text-white",

    headerClass:
      "border-red-500/50 bg-black/80",

    cardClass:
      "border-red-500/50 bg-black/80",

    secondaryCardClass:
      "border-red-500/30 bg-red-950/40",

    primaryButtonClass:
      "bg-red-600 text-white hover:bg-red-500",

    secondaryButtonClass:
      "border border-red-500 text-red-400 hover:bg-red-500/10",

    titleClass: "text-red-500",
    textClass: "text-white",
    mutedTextClass: "text-red-100/60",

    borderClass: "border-red-500/50",

    badgeClass:
      "bg-red-600 text-white",

    previewClass:
      "border-red-500/60 bg-gradient-to-br from-red-700 via-black to-black",
  },

  {
    id: "deli gobel",
    name: "deli gobel",
    requiredPoints: 300,
    description: "Turuncu, ateşli ve enerjik görünüm.",
    icon: "🔥",

    pageClass:
      "bg-gradient-to-br from-orange-950 via-orange-800 to-black text-white",

    headerClass:
      "border-orange-400/50 bg-orange-950/70",

    cardClass:
      "border-orange-400/50 bg-orange-950/80",

    secondaryCardClass:
      "border-orange-300/20 bg-orange-500/10",

    primaryButtonClass:
      "bg-orange-400 text-orange-950 hover:bg-orange-300",

    secondaryButtonClass:
      "border border-orange-400 text-orange-300 hover:bg-orange-500/10",

    titleClass: "text-orange-300",
    textClass: "text-white",
    mutedTextClass: "text-orange-100/60",

    borderClass: "border-orange-400/50",

    badgeClass:
      "bg-orange-400 text-orange-950",

    previewClass:
      "border-orange-400/60 bg-gradient-to-br from-orange-400 via-orange-900 to-black",
  },
];

export const defaultTheme = appThemes[0];

export function getThemeById(
  selectedTheme?: string | null
): AppTheme {
  if (!selectedTheme) {
    return defaultTheme;
  }

  return (
    appThemes.find(
      (theme) => theme.id === selectedTheme
    ) ?? defaultTheme
  );
}

export function isThemeUnlocked(
  theme: AppTheme,
  totalPoints: number,
  isAdmin: boolean
): boolean {
  return isAdmin || totalPoints >= theme.requiredPoints;
}