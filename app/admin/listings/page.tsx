import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminListings, setAdminListingStatus } from "@/actions/admin";
import { getCurrentProfile } from "@/lib/auth";

const statusLabels: Record<string, string> = {
  draft: "草稿 / 已下架",
  pending_review: "待审核",
  published: "已发布",
  rejected: "已拒绝",
  rented: "已出租"
};

export default async function AdminListingsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login?next=/admin/listings");
  if (profile.role !== "admin") redirect("/");

  const params = await searchParams;
  const { listings, counts, filters } = await getAdminListings(params);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">正式房源管理</h1>
          <p className="mt-2 text-sm text-muted">编辑 listings 结构化详情，发布、下架、拒绝或标记已出租。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/listings/new" className="btn-primary">发布房源</Link>
          <Link href="/admin" className="btn-secondary">返回后台</Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(statusLabels).map(([status, label]) => (
          <Link
            key={status}
            href={`/admin/listings?status=${status}`}
            className={`card p-3 ${filters.status === status ? "ring-2 ring-teal-500" : ""}`}
          >
            <div className="text-sm text-muted">{label}</div>
            <div className="mt-1 text-2xl font-bold text-ink">{counts[status] ?? 0}</div>
          </Link>
        ))}
      </section>

      <form className="card grid gap-3 p-4 md:grid-cols-[1fr_220px_auto]" action="/admin/listings">
        <input name="q" defaultValue={filters.q} placeholder="房源编号、标题或邮编" />
        <select name="status" defaultValue={filters.status}>
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="btn-primary" type="submit">筛选</button>
      </form>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-line bg-gray-50 text-muted">
              <tr>
                <th className="p-3">房源</th>
                <th className="p-3">状态</th>
                <th className="p-3">租金 / 邮编</th>
                <th className="p-3">来源 / 发布者</th>
                <th className="p-3">更新时间</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <Link href={`/admin/listings/${listing.id}`} className="font-semibold text-ink hover:text-brand">
                      #{listing.listing_no} · {listing.title}
                    </Link>
                    <div className="mt-1 text-xs text-muted">{listing.room_type ?? "整套"}</div>
                  </td>
                  <td className="p-3">{statusLabels[listing.status] ?? listing.status}</td>
                  <td className="p-3">${listing.rent_amount} · {listing.postal_code}</td>
                  <td className="p-3">
                    <div>{listing.source}</div>
                    <div className="text-xs text-muted">{listing.owner?.display_name ?? "未知"} · {listing.owner?.role ?? "-"}</div>
                  </td>
                  <td className="p-3 text-muted">{new Date(listing.updated_at).toLocaleString("zh-SG")}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/listings/${listing.id}`} className="btn-secondary">编辑</Link>
                      {listing.status === "published" ? (
                        <StatusForm listingId={listing.id} status="draft" label="下架" />
                      ) : (
                        <StatusForm listingId={listing.id} status="published" label="发布" primary />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {listings.length === 0 ? <div className="p-8 text-center text-muted">没有符合条件的正式房源。</div> : null}
      </section>
    </div>
  );
}

function StatusForm({
  listingId,
  status,
  label,
  primary = false
}: {
  listingId: string;
  status: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={setAdminListingStatus}>
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="status" value={status} />
      <button className={primary ? "btn-primary" : "btn-secondary"} type="submit">{label}</button>
    </form>
  );
}
