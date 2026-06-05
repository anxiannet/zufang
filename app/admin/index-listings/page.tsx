import Link from "next/link";
import { getIndexListings, IndexListingRow } from "@/actions/indexListings";
import { getCurrentProfile } from "@/lib/auth";

export default async function IndexListingsAdminPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <Shell>
        <AccessCard title="需要登录" message="索引房源审计仅管理员可访问。请先登录管理员账号。" actionHref="/auth/login?next=/admin/index-listings" actionText="登录" />
      </Shell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <Shell>
        <AccessCard title="无权限访问" message={`当前账号角色为 ${profile.role}，只有 admin 可以查看索引房源。`} actionHref="/rent" actionText="返回找房" />
      </Shell>
    );
  }

  const listings = await getIndexListings();

  return (
    <Shell>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-medium text-muted">
            <Link href="/admin" className="hover:text-ink">后台</Link>
            <span className="px-2">/</span>
            <Link href="/admin/ingestion" className="hover:text-ink">采集数据</Link>
            <span className="px-2">/</span>
            索引房源
          </div>
          <h1 className="mt-2 text-2xl font-bold text-ink">索引房源审计</h1>
          <p className="mt-2 text-sm text-muted">查看 listing_indexes 的最终搜索数据，重点检查 NTU 分数、匹配原因、学校标签和语义标签。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/clean-listings" className="btn-secondary">查看清洗层</Link>
          <Link href="/admin/ingestion" className="btn-secondary">返回采集管理</Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="索引总数" value={listings.length} />
        <Metric label="NTU匹配" value={countTag(listings, "NTU_MATCH")} />
        <Metric label="学生友好" value={listings.filter((item) => item.student_friendly).length} />
        <Metric label="普通房" value={countRoomType(listings, "common_room")} />
        <Metric label="可煮" value={listings.filter((item) => item.cooking_allowed === true).length} />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">Index 列表</h2>
          <p className="mt-1 text-sm text-muted">最多显示最近 200 条，按 indexed_at 倒序。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1500px] w-full border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">房源</th>
                <th className="px-4 py-3">价格/区域</th>
                <th className="px-4 py-3">房型</th>
                <th className="px-4 py-3">NTU</th>
                <th className="px-4 py-3">匹配原因</th>
                <th className="px-4 py-3">学校标签</th>
                <th className="px-4 py-3">语义标签</th>
                <th className="px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-t border-line align-top">
                  <td className="max-w-[420px] px-4 py-3">
                    <div className="font-semibold text-ink">{listing.title || "未命名房源"}</div>
                    {listing.summary ? <p className="mt-2 line-clamp-3 text-muted">{listing.summary}</p> : null}
                    <div className="mt-2 text-xs text-muted">{listing.source ?? "unknown"} · {listing.source_id ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{listing.price ? `$${listing.price}` : "价格未识别"}</div>
                    <div className="mt-1 text-muted">{listing.mrt_area ?? "区域未识别"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{listing.room_type ?? "-"}</div>
                    <div className="mt-1 text-xs font-semibold text-muted">{formatRoomType(listing.normalized_room_type)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-lg font-bold text-ink">{listing.ntu_score ?? 0}</div>
                    <div className="mt-1 text-xs text-muted">near_ntu: {formatBool(listing.near_ntu)}</div>
                    <div className="mt-1 text-xs text-muted">student: {formatBool(listing.student_friendly)}</div>
                  </td>
                  <td className="px-4 py-3"><TagList tags={listing.match_reasons ?? []} /></td>
                  <td className="px-4 py-3"><TagList tags={listing.school_fit_tags ?? []} /></td>
                  <td className="max-w-[300px] px-4 py-3"><TagList tags={listing.semantic_tags ?? []} /></td>
                  <td className="px-4 py-3"><StatusBadge status={listing.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {listings.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted">当前没有索引房源。</div> : null}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">{children}</div>;
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

function TagList({ tags }: { tags: string[] }) {
  const unique_tags = Array.from(new Set(tags));
  if (!unique_tags.length) return <span className="text-xs text-muted">无</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {unique_tags.map((tag) => (
        <span key={tag} className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
          {tag}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const value = status ?? "unknown";
  const className = value === "active"
    ? "bg-emerald-50 text-emerald-700"
    : value === "invalid"
      ? "bg-red-50 text-red-700"
      : "bg-gray-100 text-gray-700";
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${className}`}>{value}</span>;
}

function countTag(listings: IndexListingRow[], tag: string) {
  return listings.filter((listing) => (listing.semantic_tags ?? []).includes(tag) || (listing.school_fit_tags ?? []).includes(tag)).length;
}

function countRoomType(listings: IndexListingRow[], roomType: string) {
  return listings.filter((listing) => listing.normalized_room_type === roomType).length;
}

function formatRoomType(value: string | null) {
  if (value === "master_room") return "主人房";
  if (value === "common_room") return "普通房";
  if (value === "partition_room") return "单人间/隔间";
  if (value === "whole_unit") return "整套";
  return value ?? "unknown";
}

function formatBool(value: boolean | null) {
  if (value === true) return "是";
  if (value === false) return "否";
  return "未说明";
}
