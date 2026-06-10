import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { runAdminGeocodingTask } from "@/actions/admin";

export default async function MissingGeocodingPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <AdminShell>
        <div className="card p-6 text-center">
          <h1 className="text-xl font-bold text-ink">需要登录</h1>
          <p className="mt-2 text-sm text-muted">后台管理仅管理员可访问。请先登录管理员账号。</p>
          <Link href="/auth/login?next=/admin/geocoding/missing" className="btn-primary mt-4">登录</Link>
        </div>
      </AdminShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <AdminShell>
        <div className="card p-6 text-center">
          <h1 className="text-xl font-bold text-ink">无权限访问后台</h1>
          <p className="mt-2 text-sm text-muted">当前账号角色为 {profile.role}，只有 admin 可以执行地理编码任务。</p>
          <Link href="/admin/geocoding" className="btn-secondary mt-4">返回地理编码中心</Link>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div>
        <div className="text-sm text-muted">
          <Link href="/admin" className="hover:text-ink">后台</Link> / <Link href="/admin/geocoding" className="hover:text-ink">地理编码</Link> / 缺失地址补全
        </div>
        <h1 className="mt-1 text-2xl font-bold text-ink">补全缺失地址邮编</h1>
        <p className="mt-2 text-sm text-muted">
          自动扫描 active 房源中缺少 geocoding_cache、缓存不是 success、或 address/block/road/building 全为空的邮编，然后调用 OneMap 重新解析。
        </p>
      </div>

      <section className="card p-4">
        <form action={runAdminGeocodingTask} className="space-y-4">
          <input type="hidden" name="action" value="rerun_missing" />
          <div>
            <label htmlFor="limit">本次处理数量</label>
            <input id="limit" className="mt-1" name="limit" type="number" min="1" max="20" defaultValue="10" />
            <p className="mt-2 text-xs text-muted">建议每次 10 条，避免 OneMap 429 限流。处理后会自动同步刷新房源索引与学校距离。</p>
          </div>
          <button type="submit" className="btn-primary">使用 OneMap 补全缺失邮编</button>
        </form>
      </section>

      <Link href="/admin/geocoding" className="btn-secondary inline-flex">返回地理编码中心</Link>
    </AdminShell>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">{children}</div>;
}
