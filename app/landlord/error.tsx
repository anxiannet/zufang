"use client";

import { RouteError } from "@/components/ui/RouteError";

export default function LandlordError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} title="房东工作区暂时无法加载" />;
}
