import type { ReactNode } from "react";
import clsx from "clsx";

type BadgeTone = "brand" | "success" | "neutral" | "warning";

const toneClasses: Record<BadgeTone, string> = {
  brand: "border-teal-200 bg-teal-50 text-teal-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  warning: "border-amber-200 bg-amber-50 text-amber-800"
};

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", toneClasses[tone], className)}>
      {children}
    </span>
  );
}
