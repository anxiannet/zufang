import { appointAdmin, publishListing, rejectListing, unpublishListing, updateListingModeration, getAdminDashboard } from "@/actions/admin";
import { getCurrentProfile } from "@/lib/auth";
import { formatSingaporeDate } from "@/lib/dateTime";
import Link from "next/link";
import { AlertTriangle, Database, FileSearch, Gauge, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader
        eyebrow="Operations Console"
        title="维界运营后台"
        description="集中审核房源、管理采集与候选数据，并检查平台内容完整度。"
        actions={<Link href="/admin/listings/new" className="btn-primary">录入正式房源</Link>}
      />

      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-brand"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h2 className="font-bold text-ink">管理员权限</h2>
            <p className="text-sm text-muted">为已注册用户分配管理员角色。</p>
          </div>
        </div>
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

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-ink"><Database className="h-4 w-4 text-brand" /> 数据工作区</h2>
            <p className="mt-1 text-sm text-muted">查看抓取记录、筛选来源和区域、检查原始文本与联系方式。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/listings" className="btn-primary">正式房源管理</Link>
            <Link href="/admin/crawler" className="btn-secondary">采集任务</Link>
            <Link href="/admin/ingestion" className="btn-primary">管理采集数据</Link>
            <Link href="/admin/listing-imports" className="btn-primary">候选房源审核</Link>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-ink"><Gauge className="h-4 w-4 text-brand" /> 房源导入流程</h2>
            <p className="mt-1 text-sm text-muted">原始采集数据先进入候选层，人工审核后再导入正式 listings 草稿。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/ingestion" className="btn-secondary">采集层</Link>
            <Link href="/admin/listing-imports" className="btn-primary">候选审核层</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <AdminNavCard href="/admin/ingestion" title="原始采集层" description="查看 ingestion_listings 原始抓取数据。" icon={Database} />
        <AdminNavCard href="/admin/listing-imports" title="候选审核层" description="修正结构化字段、批准、拒绝或标记重复。" icon={FileSearch} />
        <AdminNavCard href="/admin/listings" title="正式房源" description="编辑房源详情、发布、下架、拒绝或标记已出租。" icon={ShieldCheck} />
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
                <Link href={`/admin/listings/${listing.id}`} className="btn-secondary">编辑详情</Link>
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
          {dashboard.pending.length === 0 ? <AdminEmpty icon={ShieldCheck} text="暂无待审核房源" /> : null}
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
          {dashboard.users.length === 0 ? <AdminEmpty icon={Users} text="暂无用户记录" /> : null}
        </Panel>

        <Panel title="咨询记录">
          {dashboard.enquiries.map((enquiry: any) => (
            <div key={enquiry.id} className="border-b border-line py-2 text-sm last:border-0">
              <div className="font-semibold">{enquiry.status} · {formatSingaporeDate(enquiry.created_at)}</div>
              <div className="line-clamp-2 text-muted">{enquiry.message}</div>
            </div>
          ))}
          {dashboard.enquiries.length === 0 ? <AdminEmpty icon={FileSearch} text="暂无咨询记录" /> : null}
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
          {dashboard.anomalies.length === 0 ? <AdminEmpty icon={AlertTriangle} text="当前没有异常房源" /> : null}
        </div>
      </section>
    </AdminShell>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="container-page space-y-5 py-8 sm:py-10">{children}</div>;
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

function AdminNavCard({ href, title, description, icon: Icon }: { href: string; title: string; description: string; icon: typeof Database }) {
  return (
    <Link href={href} className="card block p-5 transition hover:-translate-y-1 hover:border-teal-100 hover:shadow-lift">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-brand"><Icon className="h-4 w-4" /></span>
      <div className="mt-4 font-semibold text-ink">{title}</div>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </Link>
  );
}

function AdminEmpty({ icon: Icon, text }: { icon: typeof Database; text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-slate-50 p-5 text-sm text-muted">
      <Icon className="h-4 w-4 text-brand" /> {text}
    </div>
  );
}
