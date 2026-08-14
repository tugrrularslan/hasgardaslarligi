"use client";

import { useEffect, useState } from "react";
import HittiteIcon from "@/components/HittiteIcon";

type PlayerPortraitProps = {
  name: string;
  team: string;
  className?: string;
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("tr-TR");
}

export default function PlayerPortrait({
  name,
  team,
  className = "",
}: PlayerPortraitProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setPhoto(null);
    setPhotoFailed(false);

    void fetch(
      `/api/player-photo?name=${encodeURIComponent(name)}&team=${encodeURIComponent(team)}&v=4`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { photo?: unknown };
        return typeof data.photo === "string" && data.photo ? data.photo : null;
      })
      .then((photoUrl) => {
        if (!controller.signal.aborted) setPhoto(photoUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhoto(null);
      });

    return () => controller.abort();
  }, [name, team]);

  if (!photo || photoFailed) {
    return (
      <span
        aria-label={`${name} fotoÄŸrafÄ±`}
        className={`hg-card-soft inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border text-[0.65rem] font-black tracking-tight ${className}`}
      >
        {initials(name) || <HittiteIcon name="user" size="xs" />}
      </span>
    );
  }

  return (
    <img
      src={photo}
      alt={`${name} fotoÄŸrafÄ±`}
      onError={() => setPhotoFailed(true)}
      className={`hg-card-soft shrink-0 rounded-full border object-cover ${className}`}
    />
  );
}
