import Link from "next/link";
import {
  generateListingImportCandidates,
  getListingImportCandidates,
  importListingCandidate,
  setListingImportCandidateStatus
} from "@/actions/listingImports";
import { getCurrentProfile } from "@/lib/auth";

const statuses = ["needs_review", "parsed", "duplicate", "rejected", "imported", "failed"];

function formatCandidateNo(value: number | null | undefined) {
  return value ? `#C${String(value).padStart(4, "0")}` : "#C----";
}

export default async function ListingImportsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "needs_review";

  if (!profile) {
    return <AccessCard title="需要登录" message="候选房源审核仅管理员可访问。" actionHref="/auth/login?next=/admin/listing-imports" actionText="登录" />;
  }
  if (profile.role !== "admin") {
    return <AccessCard title="无权限访问" message="只有 admin 可以审核爬虫候选房源。" actionHref="/rent" actionText="返回找房" />;
  }

  const { candidates, owners, status: safe_status } = await getListingImportCandidates(status);

  return (
    <main className="container-page space-y-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted"><Link href="/admin">后台</Link> / 候选房源审核</div>
          <h1 className="mt-1 text-2xl font-bold text-ink">爬虫候选房源</h1>
          <p className="mt-1 text-sm text-muted">发布后进入前台候选列表；联系屋主授权后可导入正式房源草稿。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={generateListingImportCandidates} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-2 shadow-sm">
            <select name="limit" defaultValue="50" className="rounded-xl border border-line px-3 py-2 text-sm">
              <option value="20">20 条</option>
              <option value="50">50 条</option>
              <option value="100">100 条</option>
              <option value="200">200 条</option>
            </select>
            <input name="source" placeholder="来源，如 shichengbbs.com" className="w-48 rounded-xl border border-line px-3 py-2 text-sm" />
            <button className="btn-primary" type="submit">从原始采集生成候选</button>
          </form>
          <Link href="/admin/ingestion" className="btn-secondary">查看原始采集</Link>
        </div>
      </div>

      {typeof params.error === "string" ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</div> : null}
      {params.imported === "1" ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">候选已导入正式房源草稿，并已标记正式房源来源。</div> : null}
      {params.generated === "1" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          已从原始采集生成候选：读取 {params.fetched ?? "0"} 条，新增 {params.created ?? "0"} 条，
          needs_review {params.review ?? "0"} 条，parsed {params.parsed ?? "0"} 条，
          rejected {params.rejected ?? "0"} 条，duplicate {params.duplicate ?? "0"} 条，failed {params.failed ?? "0"} 条。
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-2">
        {statuses.map((item) => (
          <Link key={item} href={`/admin/listing-imports?status=${item}`} className={item === safe_status ? "btn-primary" : "btn-secondary"}>{item}</Link>
        ))}
      </nav>

      <section className="space-y-3">
        {candidates.map((candidate) => (
          <article key={candidate.id} className="card p-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="mb-1 text-xs font-semibold text-brand">候选编号 {formatCandidateNo(candidate.candidate_no)}</div>
                <div className="font-semibold text-ink">{candidate.parsed_title ?? "无标题"}</div>
                <div className="mt-1 text-sm text-muted">
                  ${candidate.parsed_rent_amount ?? "-"} · 邮编 {candidate.parsed_postal_code ?? "缺失"} ·
                  {candidate.parsed_area ?? candidate.parsed_mrt ?? "地区未知"} · {candidate.parsed_room_type ?? "房型未知"}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {candidate.source} / {candidate.source_id ?? "-"} · 联系 {candidate.parsed_phone ?? candidate.parsed_wechat ?? "缺失"} · 置信度 {candidate.parse_confidence ?? 0}
                </div>
                {candidate.parse_warnings?.length ? <div className="mt-2 text-sm text-amber-700">{candidate.parse_warnings.join("；")}</div> : null}
                {candidate.source_url ? <a href={candidate.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">查看来源</a> : null}
              </div>

              <div className="flex flex-wrap items-start gap-2">
                <Link href={`/admin/listing-imports/${candidate.id}`} className="btn-secondary">详情编辑</Link>
                {candidate.import_status !== "imported" ? (
                  <>
                    {candidate.import_status !== "parsed" ? <StatusButton candidateId={candidate.id} status="parsed" label="发布" /> : null}
                    <StatusButton candidateId={candidate.id} status="rejected" label="拒绝" />
                    <StatusButton candidateId={candidate.id} status="duplicate" label="标记重复" />
                  </>
                ) : null}
              </div>
            </div>

            {candidate.import_status !== "imported" && !["rejected", "duplicate", "failed"].includes(candidate.import_status) ? (
              <form action={importListingCandidate} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <input type="hidden" name="candidate_id" value={candidate.id} />
                <input type="hidden" name="status" value={safe_status} />
                <select name="system_owner_id" required defaultValue="">
                  <option value="" disabled>选择系统归属账号</option>
                  {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.display_name} ({owner.role})</option>)}
                </select>
                <button className="btn-primary" type="submit">导入为正式草稿</button>
              </form>
            ) : null}
          </article>
        ))}
        {candidates.length === 0 ? (
          <div className="card p-6 text-center text-sm text-muted">
            当前状态暂无候选房源。<br />如果原始采集表已有数据，请点击上方「从原始采集生成候选」。
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StatusButton({ candidateId, status, label }: { candidateId: string; status: string; label: string }) {
  return (
    <form action={setListingImportCandidateStatus}>
      <input type="hidden" name="candidate_id" value={candidateId} />
      <input type="hidden" name="status" value={status} />
      <button className={status === "parsed" ? "btn-primary" : "btn-secondary"} type="submit">{label}</button>
    </form>
  );
}

function AccessCard({ title, message, actionHref, actionText }: { title: string; message: string; actionHref: string; actionText: string }) {
  return (
    <main className="container-page py-12">
      <div className="card mx-auto max-w-lg p-6 text-center">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <Link href={actionHref} className="btn-primary mt-4">{actionText}</Link>
      </div>
    </main>
  );
}
