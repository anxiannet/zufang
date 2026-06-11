import Link from "next/link";
import { deleteIngestionListing, getIngestionListings } from "@/actions/admin";
import { getCurrentProfile } from "@/lib/auth";
import { formatSingaporeShortDateTime } from "@/lib/dateTime";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type IngestionListingRow = {
  id: number;
  source: string | null;
  source_id: string | null;
  listing_url: string | null;
  detail_url: string | null;
  list_title: string | null;
  list_price: number | null;
  list_contact: string | null;
  list_raw_html: string | null;
  list_raw_text: string | null;
  raw_detail_html: string | null;
  scraped_at: string | null;
  is_top: boolean | null;
};

export default async function IngestionAdminPage({ searchParams }: PageProps) {
  const profile = await getCurrentProfile();
  const params = (await searchParams) ?? {};

  if (!profile) {
    return <AccessCard title="需要登录" message="采集数据管理仅管理员可访问。" actionHref="/auth/login?next=/admin/ingestion" actionText="登录" />;
  }
  if (profile.role !== "admin") {
    return <AccessCard title="无权限访问" message="只有 admin 可以查看采集数据。" actionHref="/rent" actionText="返回找房" />;
  }

  const data = await getIngestionListings(params);
  const listings = data.listings as IngestionListingRow[];
  const q = field(params.q);
  const selected_source = field(params.source);
  const is_top = field(params.is_top);

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted"><Link href="/admin">后台</Link> / 原始采集层</div>
          <h1 className="mt-2 text-2xl font-bold text-ink">采集房源管理</h1>
          <p className="mt-2 text-sm text-muted">这里只保存原始抓取数据。结构化解析和审核统一进入候选房源层。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/listing-imports" className="btn-primary">候选房源审核</Link>
          <Link href="/admin" className="btn-secondary">返回后台</Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="抓取总数" value={data.stats.total} />
        <Metric label="有详情 HTML" value={data.stats.with_detail_html} />
        <Metric label="有列表 HTML" value={data.stats.with_list_html} />
        <Metric label="置顶帖" value={data.stats.top} />
      </section>

      <section className="card p-4">
        <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto_auto]" action="/admin/ingestion">
          <input name="q" defaultValue={q} placeholder="标题、文本、联系方式、source_id" />
          <select name="source" defaultValue={selected_source}>
            <option value="">全部来源</option>
            {data.sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
          <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
            <input className="w-auto" type="checkbox" name="is_top" value="true" defaultChecked={is_top === "true"} />
            只看置顶
          </label>
          <button className="btn-primary" type="submit">筛选</button>
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="bg-gray-50 text-muted">
              <tr>
                <th className="px-4 py-3">房源</th>
                <th className="px-4 py-3">列表信息</th>
                <th className="px-4 py-3">原始数据</th>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-t border-line align-top">
                  <td className="max-w-[360px] px-4 py-3">
                    <div className="font-semibold text-ink">{listing.list_title || "未命名抓取记录"}</div>
                    <div className="mt-1 text-xs text-muted">{listing.source ?? "unknown"} · {listing.source_id ?? "-"}</div>
                    {listing.list_raw_text ? <p className="mt-2 line-clamp-2 text-muted">{listing.list_raw_text}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div>{listing.list_price ? `$${listing.list_price}` : "价格未识别"}</div>
                    <div className="mt-1 text-muted">{listing.list_contact ?? "联系方式未识别"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>详情 HTML：{listing.raw_detail_html ? "有" : "无"}</div>
                    <div>列表 HTML：{listing.list_raw_html ? "有" : "无"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatSingaporeShortDateTime(listing.scraped_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {(listing.detail_url || listing.listing_url) ? (
                        <a className="btn-secondary px-3 py-1.5" href={listing.detail_url || listing.listing_url || "#"} target="_blank" rel="noreferrer">原帖</a>
                      ) : null}
                      <Link className="btn-secondary px-3 py-1.5" href={`/admin/ingestion/${listing.id}`}>详情</Link>
                      <form action={deleteIngestionListing.bind(null, String(listing.id))}>
                        <button className="btn-secondary px-3 py-1.5 text-red-700" type="submit">删除</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {listings.length === 0 ? <div className="p-8 text-center text-sm text-muted">没有匹配的采集记录。</div> : null}
      </section>
    </main>
  );
}

function AccessCard({ title, message, actionHref, actionText }: { title: string; message: string; actionHref: string; actionText: string }) {
  return (
    <main className="container-page py-12">
      <div className="card p-6 text-center">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <Link href={actionHref} className="btn-primary mt-4">{actionText}</Link>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-sm text-muted">{label}</div><div className="mt-1 text-2xl font-bold text-ink">{value}</div></div>;
}

function field(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}
