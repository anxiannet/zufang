import Link from "next/link";
import { deleteIngestionListing, getIngestionListings } from "@/actions/admin";
import { getCurrentProfile } from "@/lib/auth";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type IngestionListingRow = {
  id: number;
  source: string | null;
  source_id: string | null;
  title: string | null;
  listing_url: string | null;
  category: string | null;
  mrt_area: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  tags: string[] | null;
  posted_at: string | null;
  scraped_at: string | null;
  raw_text: string | null;
  is_top: boolean | null;
  created_at: string | null;
};

export default async function IngestionAdminPage({ searchParams }: PageProps) {
  const profile = await getCurrentProfile();
  const params = (await searchParams) ?? {};

  if (!profile) {
    return (
      <IngestionShell>
        <AccessCard title="需要登录" message="采集数据管理仅管理员可访问。请先登录管理员账号。" actionHref="/auth/login?next=/admin/ingestion" actionText="登录" />
      </IngestionShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <IngestionShell>
        <AccessCard title="无权限访问" message={`当前账号角色为 ${profile.role}，只有 admin 可以查看采集数据。`} actionHref="/rent" actionText="返回找房" />
      </IngestionShell>
    );
  }

  const data = await getIngestionListings(params);
  const listings = data.listings as IngestionListingRow[];
  const q = field(params.q);
  const selectedSource = field(params.source);
  const selectedCategory = field(params.category);
  const mrtArea = field(params.mrt_area);
  const isTop = field(params.is_top);

  return (
    <IngestionShell>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-medium text-muted">
            <Link href="/admin" className="hover:text-ink">后台</Link>
            <span className="px-2">/</span>
            采集数据
          </div>
          <h1 className="mt-2 text-2xl font-bold text-ink">采集房源管理</h1>
          <p className="mt-2 text-sm text-muted">检查抓取质量、联系方式、原帖链接和待清洗文本，筛出可转成标准房源的数据。</p>
        </div>
        <Link href="/admin" className="btn-secondary">返回后台</Link>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="抓取总数" value={data.stats.total} />
        <Metric label="有价格" value={data.stats.with_price} />
        <Metric label="有联系方式" value={data.stats.with_contact} />
        <Metric label="置顶帖" value={data.stats.top} />
      </section>

      <section className="card p-4">
        <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto_auto]" action="/admin/ingestion">
          <div>
            <label htmlFor="q">关键词</label>
            <input id="q" name="q" defaultValue={q} placeholder="标题、原文、电话、微信、source_id" />
          </div>
          <div>
            <label htmlFor="source">来源</label>
            <select id="source" name="source" defaultValue={selectedSource}>
              <option value="">全部来源</option>
              {data.sourceOptions.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="category">分类</label>
            <select id="category" name="category" defaultValue={selectedCategory}>
              <option value="">全部分类</option>
              {data.categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mrt_area">MRT / 区域</label>
            <input id="mrt_area" name="mrt_area" defaultValue={mrtArea} placeholder="Jurong / Tampines" />
          </div>
          <label className="flex items-center gap-2 self-end rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
            <input className="h-4 w-4" type="checkbox" name="is_top" value="true" defaultChecked={isTop === "true"} />
            只看置顶
          </label>
          <button className="btn-primary self-end" type="submit">筛选</button>
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">抓取记录</h2>
          <p className="mt-1 text-sm text-muted">最多显示最近 100 条，按抓取时间倒序。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">房源</th>
                <th className="px-4 py-3">价格 / 区域</th>
                <th className="px-4 py-3">联系方式</th>
                <th className="px-4 py-3">标签</th>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-t border-line align-top">
                  <td className="max-w-[360px] px-4 py-3">
                    <div className="flex items-center gap-2">
                      {listing.is_top ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">TOP</span> : null}
                      <span className="font-semibold text-ink">{listing.title || "未命名抓取记录"}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">{listing.source ?? "unknown"} · {listing.source_id ?? "-"}</div>
                    {listing.raw_text ? <p className="mt-2 line-clamp-2 text-muted">{listing.raw_text}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{listing.price ? `$${listing.price}` : "价格缺失"}</div>
                    <div className="mt-1 text-muted">{listing.mrt_area ?? "区域缺失"}</div>
                    <div className="mt-1 text-xs text-muted">{listing.category ?? "未分类"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>电话：{listing.phone ?? "-"}</div>
                    <div className="mt-1">微信：{listing.wechat ?? "-"}</div>
                  </td>
                  <td className="max-w-[180px] px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(listing.tags ?? []).slice(0, 5).map((tag) => (
                        <span key={tag} className="rounded border border-line px-2 py-0.5 text-xs text-muted">{tag}</span>
                      ))}
                      {(listing.tags?.length ?? 0) > 5 ? <span className="text-xs text-muted">+{(listing.tags?.length ?? 0) - 5}</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div>发布：{formatDate(listing.posted_at)}</div>
                    <div className="mt-1">抓取：{formatDate(listing.scraped_at)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {listing.listing_url ? (
                        <a className="btn-secondary px-3 py-1.5" href={listing.listing_url} target="_blank" rel="noreferrer">
                          原帖
                        </a>
                      ) : null}
                      <Link className="btn-secondary px-3 py-1.5" href={`/admin/ingestion/${listing.id}`}>
                        详情
                      </Link>
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
        {listings.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted">没有匹配的采集记录。</div> : null}
      </section>
    </IngestionShell>
  );
}

function IngestionShell({ children }: { children: React.ReactNode }) {
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

function field(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-SG", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
