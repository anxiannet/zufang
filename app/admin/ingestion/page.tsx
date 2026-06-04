import Link from "next/link";
import { deleteIngestionListing, getIngestionListings, processNewIngestionListings } from "@/actions/admin";
import { getListingPipelineStats, rebuildListingPipeline } from "@/actions/rebuildListingPipeline";
import { getCurrentProfile } from "@/lib/auth";

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
  list_posted_text: string | null;
  list_price: number | null;
  list_contact: string | null;
  list_raw_html: string | null;
  list_raw_text: string | null;
  raw_detail_html: string | null;
  scraped_at: string | null;
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

  const [data, pipelineStats] = await Promise.all([
    getIngestionListings(params),
    getListingPipelineStats()
  ]);
  const listings = data.listings as IngestionListingRow[];
  const q = field(params.q);
  const selectedSource = field(params.source);
  const isTop = field(params.is_top);
  const processResult = getProcessResult(params);
  const rebuildResult = getRebuildResult(params);
  const processError = field(params.process_error);
  const rebuildError = field(params.rebuild_error);

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
          <p className="mt-2 text-sm text-muted">检查原始抓取质量、原帖链接和详情页 HTML。清洗与索引统一通过 Pipeline 处理。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={processNewIngestionListings}>
            <button className="btn-primary" type="submit">处理新房源</button>
          </form>
          <form action={rebuildListingPipeline}>
            <button className="btn-secondary border-red-200 bg-red-50 text-red-700 hover:bg-red-100" type="submit">
              重建全部索引
            </button>
          </form>
          <Link href="/admin" className="btn-secondary">返回后台</Link>
        </div>
      </div>

      {processResult ? (
        <section className="card border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="font-semibold text-emerald-900">新房源处理完成</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Metric label="发现" value={processResult.found} />
            <Metric label="成功清洗" value={processResult.cleaned} />
            <Metric label="成功索引" value={processResult.indexed} />
            <Metric label="错误" value={processResult.errors} />
          </div>
        </section>
      ) : null}

      {rebuildResult ? (
        <section className="card border border-blue-200 bg-blue-50 p-4">
          <h2 className="font-semibold text-blue-900">全部索引重建完成</h2>
          <p className="mt-1 text-sm text-blue-800">已从 ingestion_listings 重新生成 listing_clean 与 listing_indexes。</p>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <Metric label="发现" value={rebuildResult.found} />
            <Metric label="成功清洗" value={rebuildResult.cleaned} />
            <Metric label="成功索引" value={rebuildResult.indexed} />
            <Metric label="无效房源" value={rebuildResult.invalid} />
            <Metric label="错误" value={rebuildResult.errors} />
          </div>
        </section>
      ) : null}

      {processError ? (
        <section className="card border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-900">处理失败</h2>
          <p className="mt-2 text-sm text-red-800">{processError}</p>
        </section>
      ) : null}

      {rebuildError ? (
        <section className="card border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-900">重建失败</h2>
          <p className="mt-2 text-sm text-red-800">{rebuildError}</p>
        </section>
      ) : null}

      <section className="card p-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-ink">Pipeline 健康状态</h2>
            <p className="mt-1 text-sm text-muted">listing_indexes 应只来自 active 的 listing_clean；Diff 和 Orphan 应保持 0。</p>
          </div>
          <div className={pipelineStats.diff === 0 && pipelineStats.orphanIndexes === 0 ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-red-700"}>
            {pipelineStats.diff === 0 && pipelineStats.orphanIndexes === 0 ? "健康" : "需要检查"}
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-7">
          <Metric label="Clean" value={pipelineStats.clean} />
          <Metric label="Index" value={pipelineStats.indexes} />
          <Metric label="Active" value={pipelineStats.active} />
          <Metric label="Invalid" value={pipelineStats.invalid} />
          <Metric label="Removed" value={pipelineStats.removed} />
          <Metric label="Orphan" value={pipelineStats.orphanIndexes} />
          <Metric label="Diff" value={pipelineStats.diff} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="抓取总数" value={data.stats.total} />
        <Metric label="有详情 HTML" value={data.stats.with_detail_html} />
        <Metric label="有列表 HTML" value={data.stats.with_list_html} />
        <Metric label="置顶帖" value={data.stats.top} />
      </section>

      <section className="card p-4">
        <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto_auto]" action="/admin/ingestion">
          <div>
            <label htmlFor="q">关键词</label>
            <input id="q" name="q" defaultValue={q} placeholder="列表标题、列表文本、联系方式、source_id" />
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
                <th className="px-4 py-3">列表信息</th>
                <th className="px-4 py-3">HTML</th>
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
                      <span className="font-semibold text-ink">{listing.list_title || "未命名抓取记录"}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">{listing.source ?? "unknown"} · {listing.source_id ?? "-"}</div>
                    {listing.list_raw_text ? <p className="mt-2 line-clamp-2 text-muted">{listing.list_raw_text}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{listing.list_price ? `$${listing.list_price}` : "价格未识别"}</div>
                    <div className="mt-1 text-muted">{listing.list_contact ?? "联系方式未识别"}</div>
                    <div className="mt-1 text-xs text-muted">列表发布时间：{listing.list_posted_text ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>详情：{listing.raw_detail_html ? "已保存" : "缺失"}</div>
                    <div className="mt-1">列表：{listing.list_raw_html ? "已保存" : "缺失"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div>列表：{listing.list_posted_text ?? "-"}</div>
                    <div className="mt-1">抓取：{formatDate(listing.scraped_at)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {(listing.detail_url || listing.listing_url) ? (
                        <a className="btn-secondary px-3 py-1.5" href={listing.detail_url || listing.listing_url || "#"} target="_blank" rel="noreferrer">
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

function numberField(value: string | string[] | undefined) {
  const parsed = Number(field(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getProcessResult(params: Record<string, string | string[] | undefined>) {
  if (field(params.processed) !== "1") return null;
  return {
    found: numberField(params.found),
    cleaned: numberField(params.cleaned),
    indexed: numberField(params.indexed),
    errors: numberField(params.errors)
  };
}

function getRebuildResult(params: Record<string, string | string[] | undefined>) {
  if (field(params.rebuilt) !== "1") return null;
  return {
    found: numberField(params.found),
    cleaned: numberField(params.cleaned),
    indexed: numberField(params.indexed),
    invalid: numberField(params.invalid),
    errors: numberField(params.errors)
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-SG", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
