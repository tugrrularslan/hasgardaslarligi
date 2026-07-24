import type { CSSProperties } from "react";
import type { BadgeDefinition, BadgeRarity } from "@/lib/achievements";

type BadgeArtworkSize = "xs" | "sm" | "md" | "lg";

type BadgeArtworkProps = {
  badge: BadgeDefinition;
  size?: BadgeArtworkSize;
  locked?: boolean;
  className?: string;
  title?: string;
};

const SIZE_CLASSES: Record<BadgeArtworkSize, string> = {
  xs: "h-7 w-7",
  sm: "h-10 w-10",
  md: "h-16 w-16",
  lg: "h-20 w-20",
};

const RARITY_COLORS: Record<BadgeRarity, string> = {
  common: "#cbd5e1",
  rare: "#38bdf8",
  epic: "#c084fc",
  legendary: "#fbbf24",
  secret: "#fb7185",
};

const FRAME_FILTERS: Record<BadgeRarity, string> = {
  common: "drop-shadow(0 0 5px rgba(203, 213, 225, 0.45))",
  rare:
    "sepia(0.15) hue-rotate(145deg) saturate(1.25) drop-shadow(0 0 7px rgba(56, 189, 248, 0.7))",
  epic:
    "sepia(0.12) hue-rotate(225deg) saturate(1.35) drop-shadow(0 0 8px rgba(192, 132, 252, 0.75))",
  legendary:
    "saturate(1.28) brightness(1.08) drop-shadow(0 0 10px rgba(251, 191, 36, 0.9))",
  secret:
    "sepia(0.1) hue-rotate(300deg) saturate(1.4) drop-shadow(0 0 9px rgba(251, 113, 133, 0.8))",
};

export default function BadgeArtwork({
  badge,
  size = "md",
  locked = false,
  className = "",
  title,
}: BadgeArtworkProps) {
  const rarityColor = RARITY_COLORS[badge.rarity];
  const auraStyle: CSSProperties = {
    background: rarityColor,
    boxShadow: `0 0 22px ${rarityColor}`,
  };
  const frameStyle: CSSProperties = {
    filter: locked
      ? "grayscale(1) brightness(0.45) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.55))"
      : FRAME_FILTERS[badge.rarity],
  };

  return (
    <span
      className={`relative inline-block shrink-0 ${SIZE_CLASSES[size]} ${className}`}
      title={title ?? badge.name}
      aria-label={`${badge.name} rozeti`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-[16%] rounded-full blur-lg ${
          locked ? "opacity-0" : badge.rarity === "legendary" ? "opacity-45" : "opacity-30"
        }`}
        style={auraStyle}
      />

      <span className="absolute left-[23%] top-[25%] h-[55%] w-[54%] overflow-hidden rounded-full bg-black/55 shadow-inner">
        <img
          src={badge.image}
          alt=""
          aria-hidden="true"
          className={`h-full w-full scale-[1.18] object-cover ${
            locked ? "grayscale opacity-35" : ""
          }`}
        />
      </span>

      <img
        src="/badges/hasgardas-achievement-frame.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 z-10 h-full w-full object-contain"
        style={frameStyle}
      />
    </span>
  );
}
