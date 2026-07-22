"use client";

import { useCurrentSeason } from "@/hooks/useCurrentSeason";

type SeasonLabelProps = {
  className?: string;
};

export default function SeasonLabel({ className = "" }: SeasonLabelProps) {
  const season = useCurrentSeason();

  return (
    <p className={`mt-1 text-sm font-black tracking-wide ${className}`}>
      {season.name}
    </p>
  );
}
