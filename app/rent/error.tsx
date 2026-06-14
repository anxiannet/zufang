"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function RentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-xl px-6 py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <AlertCircle className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-bold text-ink">房源暂时无法加载</h1>
        <p className="mt-2 text-sm leading-6 text-muted">可能是网络波动或数据服务繁忙，请稍后重试。</p>
        <button type="button" className="btn-primary mt-6" onClick={reset}>
          <RefreshCw className="h-4 w-4" /> 重新加载
        </button>
      </div>
    </div>
  );
}
