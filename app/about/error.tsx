"use client";

import { RouteError } from "@/components/ui/RouteError";

export default function AboutError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="关于维界页面暂时无法加载" />;
}
