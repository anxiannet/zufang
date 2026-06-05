import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getCommuteDebugDashboard, runAdminCommuteTask } from "@/actions/admin";

export default async function AdminCommutePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  const params = await searchParams;

  if (!profile) {
    return (
      <AdminShell>
        <AuthCard title="需要登录" body="后台管理仅管理员可访问。请先登录管理员账号。" href="/auth/login?next=/admin/commute" button="登录" />
      </AdminShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <AdminShell>
        <AuthCard title="无权限访问后台" body={`当前账号角色为 ${profile.role}，只有 admin 可以运行通勤补齐任务。`} href="/rent" button="返回找房" />
      </AdminShell>
    );
  }

  const dashboard = await getCommuteDebugDashboard();

  return (
    <AdminShell>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-muted"><Link href="/admin" className="hover:text-ink">后台</Link> / 真实通勤调试</div>
          <h1 className="mt-1 text-2xl font-bold text-ink">真实通勤补齐</h1>
          <p className="mt-2 text-sm text-muted">通勤时间缓存在 listing_indexes 的 travel_time_bus_* 字段；队列状态记录在 commute_enrichment_jobs。</p>
        </div>
        <Link href="/admin" className="btn-secondary">返回后台</Link>
      </div>

      <TaskResult params={params} />

      {!dashboard.hasOneMapToken ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          服务器未配置 ONEMAP_API_TOKEN。可以查看缓存和队列，也可以扫描补漏；真实执行 OneMap 通勤补齐需要先配置 token。
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard title="Active 房源" value={dashboard.stats.total_active} />
        <StatCard title="已有坐标缓存" value={dashboard.stats.with_coordinates} tone="green" />
        <StatCard title="已有NTU通勤" value={dashboard.stats.with_ntu_commute} tone="green" />
        <StatCard title="四校通勤完整" value={dashboard.stats.with_all_school_commute} tone="green" />
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard title="Pending" value={dashboard.jobStatus.pending ?? 0} tone="amber" />
        <StatCard title="Retry" value={dashboard.jobStatus.retry ?? 0} tone="amber" />
        <StatCard title="Completed" value={dashboard.jobStatus.completed ?? 0} tone="green" />
        <StatCard title="Failed" value={dashboard.jobStatus.failed ?? 0} tone="red" />
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-semibold text-ink">任务调用</h2>
        <p className="mt-1 text-sm text-muted">新增索引会自动入队；这里用于历史数据补漏、重试和手动小批量调试。</p>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <TaskForm action="enqueue_missing" title="扫描补漏" description="扫描 active listing_indexes，为有邮编或地址但缺 job 的房源补建通勤任务。" button="扫描入队" limit={100} />
          <TaskForm action="dry_run" title="Dry-run" description="读取 pending/retry 并调用 OneMap，但不写入坐标、通勤或任务状态。" button="Dry-run" limit={3} showSchool />
          <TaskForm action="run" title="真实执行" description="小批量写入坐标、四校公交通勤、completed/failed/retry 状态。" button="执行补齐" limit={10} showSchool />
          <TaskForm action="retry_failed" title="重试失败" description="将 failed 任务重新置为 pending。适合修正地址或 OneMap 临时异常后使用。" button="重试 failed" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="失败 / 重试任务">
          <div className="space-y-3">
            {dashboard.failedJobs.map((job: any) => (
              <JobCard key={job.id} job={job} />
            ))}
            {dashboard.failedJobs.length === 0 ? <div className="text-sm text-muted">暂无失败或重试任务。</div> : null}
          </div>
        </Panel>

        <Panel title="最近队列">
          <div className="space-y-3">
            {dashboard.recentJobs.map((job: any) => (
              <JobCard key={job.id} job={job} />
            ))}
            {dashboard.recentJobs.length === 0 ? <div className="text-sm text-muted">暂无队列记录。</div> : null}
          </div>
        </Panel>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-lg font-semibold text-ink">最近真实通勤缓存</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-3 py-2">房源</th>
                <th className="px-3 py-2">价格</th>
                <th className="px-3 py-2">邮编</th>
                <th className="px-3 py-2">NTU</th>
                <th className="px-3 py-2">NUS</th>
                <th className="px-3 py-2">SMU</th>
                <th className="px-3 py-2">SUTD</th>
                <th className="px-3 py-2">来源</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.completedListings.map((listing: any) => (
                <tr key={listing.id} className="border-b border-line last:border-0">
                  <td className="max-w-[340px] px-3 py-3 font-medium text-ink">{listing.title}</td>
                  <td className="px-3 py-3">{listing.price ? `$${listing.price}` : "-"}</td>
                  <td className="px-3 py-3">{listing.postal_code ?? "-"}</td>
                  <td className="px-3 py-3">{formatMinutes(listing.travel_time_bus_ntu)}</td>
                  <td className="px-3 py-3">{formatMinutes(listing.travel_time_bus_nus)}</td>
                  <td className="px-3 py-3">{formatMinutes(listing.travel_time_bus_smu)}</td>
                  <td className="px-3 py-3">{formatMinutes(listing.travel_time_bus_sutd)}</td>
                  <td className="px-3 py-3">{listing.commute_source ?? "-"}</td>
                </tr>
              ))}
              {dashboard.completedListings.length === 0 ? (
                <tr><td className="px-3 py-4 text-muted" colSpan={8}>暂无已缓存通勤。</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}

function TaskResult({ params }: { params: Record<string, string | string[] | undefined> }) {
  if (typeof params.error === "string") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        任务 {params.task ?? ""} 执行失败：{params.error}
      </div>
    );
  }

  if (params.success === "1") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        任务 {params.task ?? ""} 执行成功
        {params.scanned ? ` · 扫描 ${params.scanned}` : ""}
        {params.enqueued ? ` · 入队 ${params.enqueued}` : ""}
        {params.selected ? ` · 选中 ${params.selected}` : ""}
        {params.processed ? ` · 成功 ${params.processed}` : ""}
        {params.failed ? ` · 失败 ${params.failed}` : ""}
        {params.skipped ? ` · 跳过 ${params.skipped}` : ""}
        {params.errors ? ` · 错误 ${params.errors}` : ""}
      </div>
    );
  }

  return null;
}

function TaskForm({
  action,
  title,
  description,
  button,
  limit,
  showSchool = false
}: {
  action: string;
  title: string;
  description: string;
  button: string;
  limit?: number;
  showSchool?: boolean;
}) {
  return (
    <form action={runAdminCommuteTask} className="rounded-lg border border-line p-4">
      <input type="hidden" name="action" value={action} />
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1 min-h-[60px] text-sm text-muted">{description}</p>
      {typeof limit === "number" ? (
        <div className="mt-3">
          <label htmlFor={`${action}-limit`}>数量</label>
          <input id={`${action}-limit`} className="mt-1" name="limit" type="number" min="1" max="100" defaultValue={limit} />
        </div>
      ) : null}
      {showSchool ? (
        <div className="mt-3">
          <label htmlFor={`${action}-school`}>学校</label>
          <select id={`${action}-school`} name="school" className="mt-1">
            <option value="">全部</option>
            <option value="NTU">NTU</option>
            <option value="NUS">NUS</option>
            <option value="SMU">SMU</option>
            <option value="SUTD">SUTD</option>
          </select>
        </div>
      ) : null}
      <button type="submit" className="btn-primary mt-3 w-full">{button}</button>
    </form>
  );
}

function JobCard({ job }: { job: any }) {
  return (
    <div className="rounded-md border border-line p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 font-semibold text-ink">
          <div className="truncate">{job.title ?? job.listing_index_id}</div>
          <div className="mt-1 text-xs font-normal text-muted">{job.postal_code ?? job.address_text ?? "-"}</div>
        </div>
        <StatusBadge status={job.status} />
      </div>
      <div className="mt-2 text-muted">{job.last_error ?? "无错误信息"}</div>
      <div className="mt-1 text-xs text-muted">retry_count: {job.retry_count ?? 0}</div>
    </div>
  );
}

function StatCard({ title, value, tone = "default" }: { title: string; value: number; tone?: "default" | "amber" | "green" | "red" }) {
  const toneClass = {
    default: "text-ink",
    amber: "text-amber-700",
    green: "text-emerald-700",
    red: "text-red-700"
  }[tone];

  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{title}</div>
      <div className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "pending" || status === "retry"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";

  return <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
}

function formatMinutes(value: number | null) {
  return typeof value === "number" ? `${value}分钟` : "-";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card max-h-[520px] overflow-auto p-4">
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function AuthCard({ title, body, href, button }: { title: string; body: string; href: string; button: string }) {
  return (
    <div className="card p-6 text-center">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <Link href={href} className="btn-primary mt-4">{button}</Link>
    </div>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">{children}</div>;
}
