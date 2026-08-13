"use client";

import { useState } from "react";
import HittiteIcon from "@/components/HittiteIcon";
import { getTeamCrestUrl } from "@/lib/team-crests";

type TeamCrestProps = {
  team: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  xs: "h-5 w-5 p-0.5",
  sm: "h-8 w-8 p-1",
  md: "h-10 w-10 p-1.5",
  lg: "h-12 w-12 p-1.5 sm:h-14 sm:w-14",
} as const;

const imageSizes = {
  xs: 16,
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
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageSize = imageSizes[size];
  const showFallback = !crestUrl || failedUrl === crestUrl;

  if (showFallback) {
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
        onError={() => setFailedUrl(crestUrl)}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
