"use client";

import { useState } from "react";

type SchoolCode = "ALL" | "NTU" | "NUS" | "SMU" | "SUTD";

type ActionResult = {
  success: boolean;
  action?: string;
  error?: string;
  result?: Record<string, unknown>;
};

export default function CommuteActionPanel() {
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function runAction(action: string, limit?: number, school: SchoolCode = "ALL") {
    setRunningAction(action);
    setResult(null);

    try {
      const response = await fetch("/api/admin/commute/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action, limit, school })
      });

      const data = (await response.json()) as ActionResult;
      setResult(data);
    } catch (error) {
      setResult({ success: false, action, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setRunningAction(null);
    }
  }

  return (
    <section className="card p-4">
      <h2 className="text-lg font-semibold text-ink">任务调用</h2>
      <p className="mt-1 text-sm text-muted">点击后会立即显示执行状态，不依赖 Server Action 页面跳转。</p>

      {result ? (
        <div className={`mt-4 rounded-md border p-3 text-sm ${result.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <div className="font-semibold">{result.success ? "执行完成" : "执行失败"}</div>
          {result.error ? <div className="mt-2 whitespace-pre-wrap">{result.error}</div> : null}
          {result.result ? <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result.result, null, 2)}</pre> : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <ActionCard
          title="扫描补漏"
          description="扫描 active listing_indexes，为有邮编或地址但缺 job 的房源补建通勤任务。"
          button="扫描入队"
          disabled={Boolean(runningAction)}
          loading={runningAction === "enqueue_missing"}
          onClick={() => runAction("enqueue_missing", 100)}
        />
        <ActionCard
          title="Dry-run"
          description="读取 pending/retry 并调用 OneMap，但不写入坐标、通勤或任务状态。"
          button="Dry-run"
          disabled={Boolean(runningAction)}
          loading={runningAction === "dry_run"}
          onClick={() => runAction("dry_run", 3, "ALL")}
        />
        <ActionCard
          title="真实执行"
          description="小批量写入坐标、四校公交通勤、completed/failed/retry 状态。"
          button="执行补齐"
          disabled={Boolean(runningAction)}
          loading={runningAction === "run"}
          onClick={() => runAction("run", 10, "ALL")}
        />
        <ActionCard
          title="重试失败"
          description="将 failed 任务重新置为 pending。适合修正地址或 OneMap 临时异常后使用。"
          button="重试 failed"
          disabled={Boolean(runningAction)}
          loading={runningAction === "retry_failed"}
          onClick={() => runAction("retry_failed")}
        />
      </div>
    </section>
  );
}

function ActionCard({
  title,
  description,
  button,
  disabled,
  loading,
  onClick
}: {
  title: string;
  description: string;
  button: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-line p-4">
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1 min-h-[60px] text-sm text-muted">{description}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="btn-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "执行中..." : button}
      </button>
    </div>
  );
}
