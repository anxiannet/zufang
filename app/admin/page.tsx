import { appointAdmin, publishListing, rejectListing, unpublishListing, updateListingModeration, getAdminDashboard } from "@/actions/admin";
import { getCurrentProfile } from "@/lib/auth";
import { formatSingaporeDate } from "@/lib/dateTime";
import Link from "next/link";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getCurrentProfile();
  const params = await searchParams;

  if (!profile) {
    return (
      <AdminShell>
        <div className="card p-6 text-center">
          <h1 className="text-xl font-bold text-ink">需要登录</h1>
          <p className="mt-2 text-sm text-muted">后台管理仅管理员可访问。请先登录管理员账号。</p>
          <Link href="/auth/login?next=/admin" className="btn-primary mt-4">登录</Link>
        </div>
      </AdminShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <AdminShell>
        <div className="card p-6 text-center">
          <h1 className="text-xl font-bold text-ink">无权限访问后台</h1>
          <p className="mt-2 text-sm text-muted">当前账号角色为 {profile.role}，只有 admin 可以查看审核和管理数据。</p>
          <Link href="/rent" className="btn-secondary mt-4">返回找房</Link>
        </div>
      </AdminShell>
    );
  }

  const dashboard = await getAdminDashboard();

  return (
    <AdminShell>
      <div>
        <h1 className="text-2xl font-bold text-ink">后台管理</h1>
        <p className="mt-2 text-sm text-muted">审核房源、查看用户和咨询记录，并发现缺图片、价格异常、地址不完整的房源。</p>
      </div>

      <section className="card p-4">
        <h2 className="font-semibold text-ink">管理员权限</h2>
        <p className="mt-1 text-sm text-muted">输入已注册用户邮箱，将该用户设置为 admin。</p>
        {typeof params.admin_success === "string" ? (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            已将 {params.admin_success} 设置为管理员。
          </div>
        ) : null}
        {typeof params.admin_error === "string" ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {adminErrorMessage(params.admin_error)}
          </div>
        ) : null}
        <form action={appointAdmin} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input name="email" type="email" placeholder="user@example.com" required />
          <button className="btn-primary" type="submit">设为管理员</button>
        </form>
      </section>

      <section className="card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-ink">采集数据</h2>
            <p className="mt-1 text-sm text-muted">查看抓取记录、筛选来源和区域、检查原始文本与联系方式。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/crawler" className="btn-secondary">采集任务</Link>
            <Link href="/admin/ingestion" className="btn-primary">管理采集数据</Link>
            <Link href="/admin/geocoding" className="btn-primary">地理编码中心</Link>
            <Link href="/admin/geocoding/missing" className="btn-secondary">补全缺失邮编</Link>
            <Link href="/admin/commute" className="btn-primary">真实通勤调试</Link>
          </div>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-ink">租房 Pipeline 审计</h2>
            <p className="mt-1 text-sm text-muted">从采集、清洗、过滤、索引到搜索调试，完整排查房源为什么出现、消失或排序靠前。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/ingestion" className="btn-secondary">采集层</Link>
            <Link href="/admin/clean-listings" className="btn-secondary">清洗层</Link>
            <Link href="/admin/invalid-listings" className="btn-secondary">无效房源</Link>
            <Link href="/admin/index-listings" className="btn-secondary">索引层</Link>
            <Link href="/admin/search-debug" className="btn-primary">搜索调试</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-6">
        <AdminNavCard href="/admin/ingestion" title="采集层" description="查看 ingestion_listings 原始抓取数据，处理新房源，重建全部索引。" />
        <AdminNavCard href="/admin/clean-listings" title="清洗层" description="查看 listing_clean 的房型、三态字段、状态和结构化结果。" />
        <AdminNavCard href="/admin/invalid-listings" title="无效房源" description="审计床位、搭房、日租、小时房等被过滤记录。" />
        <AdminNavCard href="/admin/index-listings" title="索引层" description="查看 listing_indexes 的 summary、NTU 分、标签和匹配原因。" />
        <AdminNavCard href="/admin/commute" title="真实通勤" description="查看 OneMap 通勤缓存、队列状态、失败原因并手动跑批。" />
        <AdminNavCard href="/admin/search-debug" title="搜索调试" description="输入自然语言搜索词，查看命中结果、得分和排序原因。" />
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">待审核房源</h2>
        <div className="space-y-3">
          {dashboard.pending.map((listing: any) => (
            <div key={listing.id} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[1fr_auto]">
              <div>
                <div className="font-semibold">#{listing.listing_no} · {listing.title}</div>
                <div className="text-sm text-muted">${listing.rent_amount} · 邮编 {listing.postal_code} · 图片 {listing.listing_images?.length ?? 0} 张</div>
                <div className="mt-1 text-xs text-muted">
                  来源 {listing.source} · 认证 {listing.verification_status} ·
                  {listing.is_owner_direct ? " 屋主直租" : ""}{listing.is_agent ? " 中介" : ""}{listing.is_sublet ? " 转租" : ""}
                </div>
                <form action={updateListingModeration} className="mt-3 grid gap-2 md:grid-cols-3">
                  <input type="hidden" name="listing_id" value={listing.id} />
                  <select name="verification_status" defaultValue={listing.verification_status}>
                    <option value="unverified">未认证</option>
                    <option value="owner_verified">屋主已认证</option>
                    <option value="agent_verified">中介已认证</option>
                    <option value="suspicious">可疑</option>
                    <option value="rejected">拒绝</option>
                  </select>
                  <select name="contact_visibility" defaultValue={listing.contact_visibility}>
                    <option value="private">不公开</option>
                    <option value="login_only">登录后可见</option>
                    <option value="group_only">指定群体可见</option>
                    <option value="public">公开</option>
                  </select>
                  <input name="internal_note" defaultValue={listing.internal_note ?? ""} placeholder="内部备注（仅管理员）" />
                  <button className="btn-secondary md:col-span-3" type="submit">保存审核信息</button>
                </form>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={publishListing.bind(null, listing.id)}>
                  <button className="btn-primary" type="submit">审核通过</button>
                </form>
                <form action={rejectListing} className="flex gap-2">
                  <input type="hidden" name="listing_id" value={listing.id} />
                  <input name="rejection_reason" placeholder="驳回原因" />
                  <button className="btn-secondary" type="submit">驳回</button>
                </form>
                <form action={unpublishListing.bind(null, listing.id)}>
                  <button className="btn-secondary" type="submit">下架</button>
                </form>
              </div>
            </div>
          ))}
          {dashboard.pending.length === 0 ? <div className="text-sm text-muted">暂无待审核房源。</div> : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Panel title="所有用户">
          {dashboard.users.map((user: any) => (
            <div key={user.id} className="border-b border-line py-2 text-sm last:border-0">
              <div className="font-semibold">{user.display_name} <span className="text-muted">({user.role})</span></div>
              <div className="text-muted">{user.phone ?? "-"} · WhatsApp {user.whatsapp ?? "-"}</div>
            </div>
          ))}
        </Panel>

        <Panel title="咨询记录">
          {dashboard.enquiries.map((enquiry: any) => (
            <div key={enquiry.id} className="border-b border-line py-2 text-sm last:border-0">
              <div className="font-semibold">{enquiry.status} · {formatSingaporeDate(enquiry.created_at)}</div>
              <div className="line-clamp-2 text-muted">{enquiry.message}</div>
            </div>
          ))}
        </Panel>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">异常房源</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {dashboard.anomalies.map((listing: any) => (
            <div key={listing.id} className="rounded-md border border-line p-3 text-sm">
              <div className="font-semibold">#{listing.listing_no} · {listing.title}</div>
              <div className="text-muted">租金 ${listing.rent_amount} · 图片 {listing.listing_images?.length ?? 0} 张 · 邮编 {listing.postal_code ?? "不完整"}</div>
              <div className="text-xs text-muted">来源 {listing.source} · 认证 {listing.verification_status}</div>
            </div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">{children}</div>;
}

function adminErrorMessage(code: string) {
  const messages: Record<string, string> = {
    missing_email: "请输入用户邮箱。",
    auth_lookup_failed: "查询 Auth 用户失败，请稍后重试。",
    user_not_found: "未找到该邮箱对应的注册用户。",
    profile_update_failed: "更新用户角色失败，请稍后重试。"
  };

  return messages[code] ?? "设置管理员失败，请稍后重试。";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card max-h-[520px] overflow-auto p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function AdminNavCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="font-semibold text-ink">{title}</div>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </Link>
  );
}
