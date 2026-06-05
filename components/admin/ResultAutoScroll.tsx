"use client";

import { useEffect } from "react";

type ResultAutoScrollProps = {
  active: boolean;
  targetId?: string;
};

export function ResultAutoScroll({ active, targetId = "admin-action-result" }: ResultAutoScrollProps) {
  useEffect(() => {
    if (!active) return;
    const target = document.getElementById(targetId);
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [active, targetId]);

  return null;
}
