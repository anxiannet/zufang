import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { runAdminCommuteTask } from "@/actions/admin";

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

  return (
    <AdminShell>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-muted"><Link href="/admin" className="hover:text-ink">后台</Link> / 真实通勤补齐</div>
          <h1 className="mt-1 text-2xl font-bold text-ink">真实通勤补齐</h1>
          <p className="mt-2 text-sm text-muted">轻量操作页：不加载统计面板，只执行通勤任务，避免后台查询失败影响操作。</p>
        </div>
        <Link href="/admin" className="btn-secondary">返回后台</Link>
      </div>

      <TaskResult params={params} />

      <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        当前页面已改为轻量版。建议日常顺序：先点“扫描补漏”，再点“真实执行”。OneMap 会优先使用 ONEMAP_API_TOKEN；没有固定 token 时，会用 ONEMAP_EMAIL + ONEMAP_PASSWORD 自动获取。
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-semibold text-ink">任务调用</h2>
        <p className="mt-1 text-sm text-muted">用于历史数据补漏、Dry-run 测试、真实执行和失败任务重试。</p>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <TaskForm action="enqueue_missing" title="扫描补漏" description="扫描 active listing_indexes，为有邮编或地址但缺 job 的房源补建通勤任务。" button="扫描入队" limit={100} />
          <TaskForm action="dry_run" title="Dry-run" description="读取 pending/retry 并调用 OneMap，但不写入坐标、通勤或任务状态。" button="Dry-run" limit={3} showSchool />
          <TaskForm action="run" title="真实执行" description="小批量写入坐标、四校公交通勤、completed/failed/retry 状态。" button="执行补齐" limit={10} showSchool />
          <TaskForm action="retry_failed" title="重试失败" description="将 failed 任务重新置为 pending。适合修正地址或 OneMap 临时异常后使用。" button="重试 failed" />
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
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>;
}
