import Link from "next/link";
import { getInvalidListings, InvalidListingRow } from "@/actions/invalidListings";
import { getCurrentProfile } from "@/lib/auth";

type InvalidReason = string;

export default async function InvalidListingsAdminPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <Shell>
        <AccessCard title="需要登录" message="无效房源审计仅管理员可访问。请先登录管理员账号。" actionHref="/auth/login?next=/admin/invalid-listings" actionText="登录" />
      </Shell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <Shell>
        <AccessCard title="无权限访问" message={`当前账号角色为 ${profile.role}，只有 admin 可以查看无效房源。`} actionHref="/rent" actionText="返回找房" />
      </Shell>
    );
  }

  const listings = await getInvalidListings();

  return (
    <Shell>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-medium text-muted">
            <Link href="/admin" className="hover:text-ink">后台</Link>
            <span className="px-2">/</span>
            <Link href="/admin/ingestion" className="hover:text-ink">采集数据</Link>
            <span className="px-2">/</span>
            无效房源
          </div>
          <h1 className="mt-2 text-2xl font-bold text-ink">无效房源审计</h1>
          <p className="mt-2 text-sm text-muted">查看被 Pipeline 标记为 invalid 的房源，用于排查床位、搭房、日租、小时房等误杀或漏杀。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/ingestion" className="btn-secondary">返回采集管理</Link>
          <Link href="/admin" className="btn-secondary">返回后台</Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="无效房源" value={listings.length} />
        <Metric label="床位/搭房" value={countByReason(listings, "bedspace_or_shared_bed")} />
        <Metric label="日租/小时房" value={countByReason(listings, "daily_or_hourly_rental")} />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">Invalid 列表</h2>
          <p className="mt-1 text-sm text-muted">最多显示最近 200 条，按 listing_clean 创建时间倒序。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">房源</th>
                <th className="px-4 py-3">价格/区域</th>
                <th className="px-4 py-3">房型</th>
                <th className="px-4 py-3">Invalid 原因</th>
                <th className="px-4 py-3">来源</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-t border-line align-top">
                  <td className="max-w-[360px] px-4 py-3">
                    <div className="font-semibold text-ink">{listing.title || "未命名房源"}</div>
                    <div className="mt-1 text-xs text-muted">{listing.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{listing.price ? `$${listing.price}` : "价格未识别"}</div>
                    <div className="mt-1 text-muted">{listing.mrt_area ?? "区域未识别"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{listing.room_type ?? "-"}</div>
                    <div className="mt-1 text-xs text-muted">{listing.normalized_room_type ?? "unknown"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <ReasonBadges reasons={getInvalidReasons(listing)} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div>{listing.source ?? "unknown"}</div>
                    <div className="mt-1 text-xs">{listing.source_id ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(listing.detail_url || listing.listing_url) ? (
                      <a className="btn-secondary px-3 py-1.5" href={listing.detail_url || listing.listing_url || "#"} target="_blank" rel="noreferrer">
                        原帖
                      </a>
                    ) : (
                      <span className="text-xs text-muted">无链接</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {listings.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted">当前没有 invalid 房源。</div> : null}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

function ReasonBadges({ reasons }: { reasons: InvalidReason[] }) {
  if (!reasons.length) return <span className="text-xs text-muted">未记录原因</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <span key={reason} className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
          {formatReason(reason)}
        </span>
      ))}
    </div>
  );
}

function getInvalidReasons(listing: InvalidListingRow): InvalidReason[] {
  const value = listing.raw_snapshot?.invalid_reasons;
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function countByReason(listings: InvalidListingRow[], reason: string) {
  return listings.filter((listing) => getInvalidReasons(listing).includes(reason)).length;
}

function formatReason(reason: string) {
  if (reason === "bedspace_or_shared_bed") return "床位/搭房";
  if (reason === "daily_or_hourly_rental") return "日租/小时房";
  return reason;
}
