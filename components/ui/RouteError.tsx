"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export function RouteError({ reset, title = "页面暂时无法加载" }: { reset: () => void; title?: string }) {
  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-xl p-10 text-center">
        <AlertCircle className="mx-auto h-9 w-9 text-amber-600" />
        <h1 className="mt-4 text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">数据服务可能暂时繁忙，请稍后重新加载。</p>
        <button type="button" className="btn-primary mt-6" onClick={reset}><RefreshCw className="h-4 w-4" /> 重新加载</button>
      </div>
    </div>
  );
}
