import Link from "next/link";
import { deleteIngestionListing, getIngestionListingDetail } from "@/actions/admin";
import { getCurrentProfile } from "@/lib/auth";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function IngestionListingDetailPage({ params }: PageProps) {
  const profile = await getCurrentProfile();
  const { id } = await params;

  if (!profile) {
    return (
      <DetailShell>
        <AccessCard title="需要登录" message="采集数据详情仅管理员可访问。请先登录管理员账号。" actionHref={`/auth/login?next=/admin/ingestion/${id}`} actionText="登录" />
      </DetailShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <DetailShell>
        <AccessCard title="无权限访问" message={`当前账号角色为 ${profile.role}，只有 admin 可以查看采集数据。`} actionHref="/rent" actionText="返回找房" />
      </DetailShell>
    );
  }

  const listing = await getIngestionListingDetail(id);

  if (!listing) {
    return (
      <DetailShell>
        <div className="card p-6">
          <h1 className="text-xl font-bold text-ink">记录不存在</h1>
          <p className="mt-2 text-sm text-muted">这条采集记录可能已经被删除。</p>
          <Link href="/admin/ingestion" className="btn-secondary mt-4">返回采集数据</Link>
        </div>
      </DetailShell>
    );
  }

  return (
    <DetailShell>
      {(() => {
        const sourceUrl = listing.detail_url || listing.listing_url;
        const rawText = listing.list_raw_text;
        const rawHtml = listing.raw_detail_html || listing.list_raw_html;

        return (
          <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-medium text-muted">
            <Link href="/admin" className="hover:text-ink">后台</Link>
            <span className="px-2">/</span>
            <Link href="/admin/ingestion" className="hover:text-ink">采集数据</Link>
          </div>
          <h1 className="mt-2 max-w-3xl text-2xl font-bold text-ink">{listing.list_title || "未命名抓取记录"}</h1>
          <p className="mt-2 text-sm text-muted">{listing.source ?? "unknown"} · {listing.source_id ?? "-"}</p>
          {sourceUrl ? (
            <a className="mt-2 block break-all text-sm font-medium text-brand hover:underline" href={sourceUrl}>
              {sourceUrl}
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {sourceUrl ? (
            <a className="btn-primary" href={sourceUrl}>
              打开原帖
            </a>
          ) : null}
          <Link href="/admin/ingestion" className="btn-secondary">返回列表</Link>
          <form action={deleteIngestionListing.bind(null, String(listing.id))}>
            <button className="btn-secondary text-red-700" type="submit">删除</button>
          </form>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard label="列表价格" value={listing.list_price ? `$${listing.list_price}` : "未识别"} />
        <InfoCard label="详情 HTML" value={listing.raw_detail_html ? "已保存" : "缺失"} />
        <InfoCard label="列表 HTML" value={listing.list_raw_html ? "已保存" : "缺失"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="card p-4">
          <h2 className="font-semibold text-ink">采集字段</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <Field label="列表联系" value={listing.list_contact} />
            <Field label="置顶" value={listing.is_top ? "是" : "否"} />
            <Field label="列表发布" value={listing.list_posted_text} />
            <Field label="抓取时间" value={formatDate(listing.scraped_at)} />
            <Field label="入库时间" value={formatDate(listing.created_at)} />
          </dl>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold text-ink">列表原始文本</h2>
          <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-gray-50 p-3 text-sm leading-6 text-ink">
            {rawText || "没有原始文本。"}
          </pre>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold text-ink">原始 HTML</h2>
        <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-gray-50 p-3 text-xs leading-5 text-muted">
          {rawHtml || "没有原始 HTML。"}
        </pre>
      </section>
          </>
        );
      })()}
    </DetailShell>
  );
}

function DetailShell({ children }: { children: React.ReactNode }) {
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold text-ink">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value || "-"}</dd>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-SG", { dateStyle: "medium", timeStyle: "short" });
}
