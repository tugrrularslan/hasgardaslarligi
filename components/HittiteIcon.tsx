export const HITTITE_ICON_GLYPHS = {
  sun: "☼",
  game: "✥",
  ball: "◉",
  trophy: "♛",
  chart: "↗",
  rules: "≡",
  home: "⌂",
  user: "◆",
  back: "‹",
  forward: "›",
  lock: "⊘",
  target: "⊙",
  group: "⋈",
  record: "▤",
  crown: "♛",
  check: "✓",
  close: "×",
  clock: "◴",
  fire: "▲",
  shield: "⬙",
  exit: "↦",
} as const;

export type HittiteIconName = keyof typeof HITTITE_ICON_GLYPHS;

type HittiteIconProps = {
  name: HittiteIconName;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
};

export default function HittiteIcon({
  name,
  size = "md",
  className = "",
}: HittiteIconProps) {
  return (
    <span
      className={`hg-hittite-icon hg-hittite-icon--${size} ${className}`}
      data-icon={name}
      aria-hidden="true"
    >
      <span className="hg-hittite-icon__glyph">
        {HITTITE_ICON_GLYPHS[name]}
      </span>
    </span>
  );
}
