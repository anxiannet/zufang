"use client";

import { RouteError } from "@/components/ui/RouteError";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="运营后台暂时无法加载" />;
}
