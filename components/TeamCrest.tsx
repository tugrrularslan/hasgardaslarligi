"use client";

import { useEffect, useState } from "react";
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
  const [imageFailed, setImageFailed] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [resolvingFallback, setResolvingFallback] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setFallbackUrl(null);
    setResolvingFallback(false);
  }, [crestUrl]);

  const loadFallback = async () => {
    if (resolvingFallback || fallbackUrl) {
      setImageFailed(true);
      return;
    }

    setResolvingFallback(true);

    try {
      const response = await fetch(`/api/team-crest?team=${encodeURIComponent(team)}`);
      const data = (await response.json()) as { crest?: unknown };
      const nextUrl = typeof data.crest === "string" && data.crest ? data.crest : null;

      if (nextUrl) setFallbackUrl(nextUrl);
      else setImageFailed(true);
    } catch {
      setImageFailed(true);
    } finally {
      setResolvingFallback(false);
    }
  };

  if (!crestUrl || imageFailed) {
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
        src={fallbackUrl ?? crestUrl}
        width={imageSize}
        height={imageSize}
        alt={`${team} amblemi`}
        loading="lazy"
        decoding="async"
        onError={() => void loadFallback()}
        className={`h-full w-full object-contain ${resolvingFallback ? "opacity-0" : ""}`}
      />
    </span>
  );
}
