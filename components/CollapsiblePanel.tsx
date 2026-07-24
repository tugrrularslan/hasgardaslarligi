"use client";

import { useId, useState, type ReactNode } from "react";
import HittiteIcon, { type HittiteIconName } from "@/components/HittiteIcon";

type CollapsiblePanelProps = {
  title: string;
  description?: string;
  icon?: HittiteIconName;
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  children: ReactNode;
};

export default function CollapsiblePanel({
  title,
  description,
  icon = "rules",
  defaultOpen = false,
  className = "",
  triggerClassName = "",
  children,
}: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={`hg-collapsible ${isOpen ? "is-open" : ""} ${className}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
        className={`hg-collapsible__trigger ${triggerClassName}`}
      >
        <span className="flex min-w-0 items-center gap-3 text-left">
          <HittiteIcon name={icon} size="md" />
          <span className="min-w-0">
            <span className="block font-black">{title}</span>
            {description && (
              <span className="hg-collapsible__description">
                {description}
              </span>
            )}
          </span>
        </span>

        <span className="hg-collapsible__toggle">
          <span className="hg-collapsible__state">
            {isOpen ? "Kapat" : "Aç"}
          </span>
          <HittiteIcon name="forward" size="sm" />
        </span>
      </button>

      <div id={contentId} hidden={!isOpen} className="hg-collapsible__content">
        {children}
      </div>
    </div>
  );
}
