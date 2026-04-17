import React from "react";
import { Activity } from "lucide-react";

interface TopNavProps {
  /** Subtitle shown above the title in tiny caps (optional) */
  label?: string;
  /** Main title */
  title: string;
  /** Action icons on the right */
  right?: React.ReactNode;
}

export function TopNav({ label, title, right }: TopNavProps) {
  return (
    <div className="bg-black px-4 pt-4 pb-3">
      <div className="flex items-center gap-3">
        {/* Logo — always on the left */}
        <Activity className="h-6 w-6 flex-shrink-0 text-[#c5e063]" strokeWidth={1.5} />

        {/* Title block */}
        <div className="flex-1 min-w-0">
          {label && (
            <p className="text-[11px] uppercase tracking-widest text-white/40 leading-none mb-0.5">
              {label}
            </p>
          )}
          <h1 className="text-xl font-semibold leading-none text-white">{title}</h1>
        </div>

        {/* Right actions */}
        {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
      </div>
    </div>
  );
}
