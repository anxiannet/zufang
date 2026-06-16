"use client";

import { RouteError } from "@/components/ui/RouteError";

export default function AuthError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="账号页面暂时无法加载" />;
}
