import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import CommuteActionPanel from "./CommuteActionPanel";

export default async function AdminCommutePage() {
  const profile = await getCurrentProfile();

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
          <p className="mt-2 text-sm text-muted">轻量操作页：点击按钮后会立即显示执行状态。</p>
        </div>
        <Link href="/admin" className="btn-secondary">返回后台</Link>
      </div>

      <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        建议日常顺序：先点“扫描补漏”，再点“真实执行”。OneMap 会优先使用 ONEMAP_API_TOKEN；没有固定 token 时，会用 ONEMAP_EMAIL + ONEMAP_PASSWORD 自动获取。
      </section>

      <CommuteActionPanel />
    </AdminShell>
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
