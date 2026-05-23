import { publishListing, rejectListing, unpublishListing, getAdminDashboard } from "@/actions/admin";
import { getCurrentProfile } from "@/lib/auth";
import Link from "next/link";

export default async function AdminPage() {
  const profile = await getCurrentProfile();

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
        <h2 className="mb-3 font-semibold">待审核房源</h2>
        <div className="space-y-3">
          {dashboard.pending.map((listing: any) => (
            <div key={listing.id} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[1fr_auto]">
              <div>
                <div className="font-semibold">{listing.title}</div>
                <div className="text-sm text-muted">${listing.rent_amount} · {listing.street_name ?? listing.postal_code} · 图片 {listing.listing_images?.length ?? 0} 张</div>
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
              <div className="font-semibold">{enquiry.status} · {new Date(enquiry.created_at).toLocaleDateString("zh-SG")}</div>
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
              <div className="font-semibold">{listing.title}</div>
              <div className="text-muted">租金 ${listing.rent_amount} · 图片 {listing.listing_images?.length ?? 0} 张 · 地址 {listing.street_name ?? "不完整"}</div>
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card max-h-[520px] overflow-auto p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
