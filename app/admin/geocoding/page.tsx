import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getGeocodingDashboard, runAdminGeocodingTask } from "@/actions/admin";

export default async function AdminGeocodingPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  const params = await searchParams;

  if (!profile) {
    return (
      <AdminShell>
        <div className="card p-6 text-center">
          <h1 className="text-xl font-bold text-ink">需要登录</h1>
          <p className="mt-2 text-sm text-muted">后台管理仅管理员可访问。请先登录管理员账号。</p>
          <Link href="/auth/login?next=/admin/geocoding" className="btn-primary mt-4">登录</Link>
        </div>
      </AdminShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <AdminShell>
        <div className="card p-6 text-center">
          <h1 className="text-xl font-bold text-ink">无权限访问后台</h1>
          <p className="mt-2 text-sm text-muted">当前账号角色为 {profile.role}，只有 admin 可以运行地理编码任务。</p>
          <Link href="/rent" className="btn-secondary mt-4">返回找房</Link>
        </div>
      </AdminShell>
    );
  }

  const dashboard = await getGeocodingDashboard();

  return (
    <AdminShell>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-muted"><Link href="/admin" className="hover:text-ink">后台</Link> / 地理编码</div>
          <h1 className="mt-1 text-2xl font-bold text-ink">地理编码与学校通勤</h1>
          <p className="mt-2 text-sm text-muted">将房源邮编解析为坐标，并自动生成 NTU/NUS/SMU/SUTD 距离和通勤估算。</p>
        </div>
        <Link href="/admin" className="btn-secondary">返回后台</Link>
      </div>

      <TaskResult params={params} />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard title="Active 房源" value={dashboard.stats.total_active} />
        <StatCard title="已识别邮编" value={dashboard.stats.with_postal_code} />
        <StatCard title="已解析坐标" value={dashboard.stats.with_coordinates} />
        <StatCard title="已生成NTU距离" value={dashboard.stats.with_ntu_distance} />
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard title="待解析" value={dashboard.cacheStatus.pending} tone="amber" />
        <StatCard title="解析成功" value={dashboard.cacheStatus.success} tone="green" />
        <StatCard title="解析失败" value={dashboard.cacheStatus.failed} tone="red" />
        <StatCard title="未找到" value={dashboard.cacheStatus.not_found} tone="gray" />
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-semibold text-ink">任务操作</h2>
        <p className="mt-1 text-sm text-muted">建议顺序：扫描邮编 → 执行地理编码 → 同步刷新。执行地理编码会自动同步和刷新距离。</p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <TaskForm action="enqueue" title="扫描邮编" description="从 listing_indexes 扫描有效邮编，加入 geocoding_cache 待处理队列。" button="扫描邮编" />
          <TaskForm action="run" title="执行地理编码" description="调用 OneMap Search，将 pending 邮编解析成坐标。默认小批量慢速处理，避免 OneMap 429。" button="执行地理编码" showLimit />
          <TaskForm action="sync" title="同步刷新" description="将缓存坐标同步回房源索引，并刷新学校距离和通勤估算。" button="同步刷新" />
        </div>

        <form action={runAdminGeocodingTask} className="mt-4 rounded-lg border border-line bg-amber-50 p-4">
          <input type="hidden" name="action" value="retry_failed" />
          <h3 className="font-semibold text-ink">重试解析失败邮编</h3>
          <p className="mt-1 text-sm text-muted">将 failed 邮编重新放回待处理队列。适合 OneMap HTTP 429 后隔一段时间再跑。</p>
          <button type="submit" className="btn-secondary mt-3">重试失败邮编</button>
        </form>

        <form action={runAdminGeocodingTask} className="mt-4 rounded-lg border border-line bg-gray-50 p-4">
          <input type="hidden" name="action" value="run" />
          <label htmlFor="postal_code">单个邮编测试</label>
          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
            <input id="postal_code" name="postal_code" placeholder="例如 648364" pattern="[0-9]{6}" />
            <button type="submit" className="btn-primary">测试邮编</button>
          </div>
          <p className="mt-2 text-xs text-muted">用于快速验证某个邮编是否能被 OneMap 正确解析。</p>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="待处理邮编">
          <div className="space-y-3">
            {dashboard.pendingJobs.map((job: any) => (
              <div key={job.postal_code} className="rounded-md border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-ink">{job.postal_code}</div>
                  <div className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{job.listing_count} 条房源</div>
                </div>
                <div className="mt-2 line-clamp-2 text-muted">{job.sample_title}</div>
              </div>
            ))}
            {dashboard.pendingJobs.length === 0 ? <div className="text-sm text-muted">暂无待处理邮编。</div> : null}
          </div>
        </Panel>

        <Panel title="失败 / 未找到">
          <div className="space-y-3">
            {dashboard.failedJobs.map((job: any) => (
              <div key={job.postal_code} className="rounded-md border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-ink">{job.postal_code}</div>
                  <div className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{job.status}</div>
                </div>
                <div className="mt-2 text-muted">{job.error_message ?? "无错误信息"}</div>
              </div>
            ))}
            {dashboard.failedJobs.length === 0 ? <div className="text-sm text-muted">暂无失败记录。</div> : null}
          </div>
        </Panel>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-lg font-semibold text-ink">NTU推荐结果预览</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-3 py-2">房源</th>
                <th className="px-3 py-2">价格</th>
                <th className="px-3 py-2">邮编</th>
                <th className="px-3 py-2">区域</th>
                <th className="px-3 py-2">距NTU</th>
                <th className="px-3 py-2">公交估算</th>
                <th className="px-3 py-2">规则估算</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recommended.map((listing: any) => (
                <tr key={listing.id} className="border-b border-line last:border-0">
                  <td className="max-w-[360px] px-3 py-3 font-medium text-ink">{listing.title}</td>
                  <td className="px-3 py-3">{listing.price ? `$${listing.price}` : "-"}</td>
                  <td className="px-3 py-3">{listing.postal_code ?? "-"}</td>
                  <td className="px-3 py-3">{listing.mrt_area ?? "-"}</td>
                  <td className="px-3 py-3">{listing.distance_to_ntu_km ? `${listing.distance_to_ntu_km}km` : "-"}</td>
                  <td className="px-3 py-3">{listing.estimated_bus_to_ntu ? `${listing.estimated_bus_to_ntu}分钟` : "-"}</td>
                  <td className="px-3 py-3">{listing.travel_time_to_ntu ? `${listing.travel_time_to_ntu}分钟` : "-"}</td>
                </tr>
              ))}
              {dashboard.recommended.length === 0 ? (
                <tr><td className="px-3 py-4 text-muted" colSpan={7}>暂无推荐结果。</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-lg font-semibold text-ink">最近地理编码缓存</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {dashboard.recentCache.slice(0, 20).map((row: any) => (
            <div key={row.postal_code} className="rounded-md border border-line p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-ink">{row.postal_code}</div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-1 text-muted">{row.address ?? row.error_message ?? "-"}</div>
              <div className="mt-1 text-xs text-muted">{row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : "暂无坐标"}</div>
            </div>
          ))}
          {dashboard.recentCache.length === 0 ? <div className="text-sm text-muted">暂无缓存记录。</div> : null}
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
        {params.enqueued ? ` · 入队 ${params.enqueued}` : ""}
        {params.processed ? ` · 处理 ${params.processed}` : ""}
        {params.synced ? ` · 同步 ${params.synced}` : ""}
        {params.refreshed ? ` · 刷新 ${params.refreshed}` : ""}
        {params.rate_limited ? " · OneMap 限流，已暂停批量并保留为待处理" : ""}
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
  showLimit = false
}: {
  action: string;
  title: string;
  description: string;
  button: string;
  showLimit?: boolean;
}) {
  return (
    <form action={runAdminGeocodingTask} className="rounded-lg border border-line p-4">
      <input type="hidden" name="action" value={action} />
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1 min-h-[40px] text-sm text-muted">{description}</p>
      {showLimit ? (
        <div className="mt-3">
          <label htmlFor={`${action}-limit`}>处理数量</label>
          <input id={`${action}-limit`} className="mt-1" name="limit" type="number" min="1" max="20" defaultValue="10" />
        </div>
      ) : null}
      <button type="submit" className="btn-primary mt-3 w-full">{button}</button>
    </form>
  );
}

function StatCard({ title, value, tone = "default" }: { title: string; value: number; tone?: "default" | "amber" | "green" | "red" | "gray" }) {
  const toneClass: Record<string, string> = {
    default: "text-ink",
    amber: "text-amber-700",
    green: "text-emerald-700",
    red: "text-red-700",
    gray: "text-muted"
  };

  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{title}</div>
      <div className={`mt-2 text-3xl font-bold ${toneClass[tone]}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "success"
      ? "bg-emerald-50 text-emerald-700"
      : status === "pending"
        ? "bg-amber-50 text-amber-700"
        : status === "not_found"
          ? "bg-gray-100 text-gray-700"
          : "bg-red-50 text-red-700";

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card max-h-[520px] overflow-auto p-4">
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">{children}</div>;
}
