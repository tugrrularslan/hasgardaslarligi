import HittiteIcon from "@/components/HittiteIcon";
import { getTeamCrestUrl } from "@/lib/team-crests";

type TeamCrestProps = {
  team: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-8 w-8 p-1",
  md: "h-10 w-10 p-1.5",
  lg: "h-12 w-12 p-1.5 sm:h-14 sm:w-14",
} as const;

const imageSizes = {
  sm: 24,
  md: 32,
  lg: 48,
} as const;

export default function TeamCrest({
  team,
  size = "md",
  className = "",
}: TeamCrestProps) {
  const crestUrl = getTeamCrestUrl(team);
  const imageSize = imageSizes[size];

  if (!crestUrl) {
    return (
      <span
        role="img"
        aria-label={`${team} amblemi`}
        className={`hg-card-soft inline-flex shrink-0 items-center justify-center rounded-full border ${sizeClasses[size]} ${className}`}
      >
        <HittiteIcon name="shield" size="xs" />
      </span>
    );
  }

  return (
    <span
      className={`hg-card-soft inline-flex shrink-0 items-center justify-center rounded-full border ${sizeClasses[size]} ${className}`}
    >
      <img
        src={crestUrl}
        width={imageSize}
        height={imageSize}
        alt={`${team} amblemi`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
