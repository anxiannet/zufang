"use client";

import { useMemo, useState } from "react";

type SchoolCode = "ALL" | "NTU" | "NUS" | "SMU" | "SUTD";

type RunResult = {
  success: boolean;
  started_at?: string;
  finished_at?: string;
  error?: string;
  result?: {
    pending_count: number;
    selected_count: number;
    success_count: number;
    failed_count: number;
    skipped_count: number;
    dry_run: boolean;
    school: string;
  };
};

export default function CommuteRunPanel() {
  const [limit, setLimit] = useState(20);
  const [school, setSchool] = useState<SchoolCode>("ALL");
  const [dryRun, setDryRun] = useState(false);
  const [secret, setSecret] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const canRun = useMemo(() => !isRunning && limit > 0, [isRunning, limit]);

  async function runCommuteJob() {
    if (!canRun) return;

    setIsRunning(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/commute/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret.trim() ? { "x-admin-job-secret": secret.trim() } : {})
        },
        body: JSON.stringify({
          limit,
          school,
          dryRun
        })
      });

      const data = (await response.json()) as RunResult;
      setResult(data);
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">后台任务 · 通勤计算</h1>
        <p className="text-sm leading-6 text-muted">
          手动处理 commute_enrichment_jobs 队列，把房源邮编转换为经纬度，并计算到学校的公共交通时间。
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-ink">
          每次处理数量
          <input
            className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-ink">
          学校
          <select
            className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            value={school}
            onChange={(event) => setSchool(event.target.value as SchoolCode)}
          >
            <option value="ALL">全部学校</option>
            <option value="NTU">NTU</option>
            <option value="NUS">NUS</option>
            <option value="SMU">SMU</option>
            <option value="SUTD">SUTD</option>
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium text-ink md:col-span-2">
          管理密钥，已配置 ADMIN_JOB_SECRET 时需要填写
          <input
            className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="ADMIN_JOB_SECRET"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
          <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
          只测试，不写入数据库
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canRun}
          onClick={runCommuteJob}
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "正在执行..." : "立即执行通勤计算"}
        </button>
        <span className="text-xs text-muted">执行期间不要重复点击；如果上一轮还在跑，API 会自动拒绝重复任务。</span>
      </div>

      {result ? (
        <div className={`mt-6 rounded-xl border p-4 text-sm ${result.success ? "border-teal-200 bg-teal-50 text-teal-950" : "border-red-200 bg-red-50 text-red-950"}`}>
          <div className="font-semibold">{result.success ? "执行完成" : "执行失败"}</div>
          {result.error ? <p className="mt-2 whitespace-pre-wrap">{result.error}</p> : null}
          {result.result ? (
            <dl className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>待处理：{result.result.pending_count}</div>
              <div>本次选中：{result.result.selected_count}</div>
              <div>成功：{result.result.success_count}</div>
              <div>失败：{result.result.failed_count}</div>
              <div>跳过：{result.result.skipped_count}</div>
              <div>学校：{result.result.school}</div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
