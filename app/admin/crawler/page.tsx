import Link from "next/link";
import { getCrawlJobs } from "@/actions/admin";
import { getCurrentProfile } from "@/lib/auth";
import { formatSingaporeShortDateTime } from "@/lib/dateTime";

type CrawlJobRow = {
  id: number;
  job_name: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  summary: {
    inserted?: number;
    targetInserted?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
    stoppedReason?: string;
  } | null;
  error: string | null;
};

export default async function CrawlerAdminPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <CrawlerShell>
        <AccessCard title="需要登录" message="采集任务状态仅管理员可访问。请先登录管理员账号。" actionHref="/auth/login?next=/admin/crawler" actionText="登录" />
      </CrawlerShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <CrawlerShell>
        <AccessCard title="无权限访问" message={`当前账号角色为 ${profile.role}，只有 admin 可以查看采集任务。`} actionHref="/rent" actionText="返回找房" />
      </CrawlerShell>
    );
  }

  const jobs = (await getCrawlJobs()) as CrawlJobRow[];

  return (
    <CrawlerShell>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-medium text-muted">
            <Link href="/admin" className="hover:text-ink">后台</Link>
            <span className="px-2">/</span>
            采集任务
          </div>
          <h1 className="mt-2 text-2xl font-bold text-ink">Zufang 采集任务</h1>
          <p className="mt-2 text-sm text-muted">最近 20 次 Vercel Cron / 手动 API 采集结果。采集任务只写入原始采集库；索引、清理和地理编码由服务端后续任务处理。</p>
        </div>
        <Link href="/admin" className="btn-secondary">返回后台</Link>
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">开始时间</th>
                <th className="px-4 py-3">结束时间</th>
                <th className="px-4 py-3">Inserted</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Skipped</th>
                <th className="px-4 py-3">Errors</th>
                <th className="px-4 py-3">停止原因</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <span className={statusClass(job.status)}>{job.status ?? "-"}</span>
                    <div className="mt-1 text-xs text-muted">{job.job_name ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatSingaporeShortDateTime(job.started_at)}</td>
                  <td className="px-4 py-3 text-muted">{formatSingaporeShortDateTime(job.finished_at)}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{job.summary?.inserted ?? 0}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{job.summary?.targetInserted ?? 50}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{job.summary?.updated ?? 0}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{job.summary?.skipped ?? 0}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{job.summary?.errors ?? 0}</td>
                  <td className="max-w-[300px] px-4 py-3 text-muted">
                    {job.error ?? job.summary?.stoppedReason ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {jobs.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted">暂无采集任务记录。</div> : null}
      </section>
    </CrawlerShell>
  );
}

function CrawlerShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">{children}</div>;
}

function AccessCard({ title, message, actionHref, actionText }: { title: string; message: string; actionHref: string; actionText: string }) {
  return (
    <div className="card p-6 text-center">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <Link href={actionHref} className="btn-primary mt-4">{actionText}</Link>
    </div>
  );
}

function statusClass(status: string | null) {
  const base = "inline-flex rounded px-2 py-0.5 text-xs font-semibold";
  if (status === "success") return `${base} bg-emerald-100 text-emerald-800`;
  if (status === "failed") return `${base} bg-red-100 text-red-700`;
  if (status === "running") return `${base} bg-amber-100 text-amber-800`;
  return `${base} bg-gray-100 text-gray-700`;
}
