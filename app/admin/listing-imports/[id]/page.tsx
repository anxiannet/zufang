import Link from "next/link";
import {
  getListingImportCandidateDetail,
  updateListingImportCandidate
} from "@/actions/listingImports";
import { Badge } from "@/components/ui/Badge";
import { getCurrentProfile } from "@/lib/auth";
import { formatSingaporeMediumDateTime } from "@/lib/dateTime";
import { ListingPreferenceStats } from "@/components/admin/ListingPreferenceStats";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const listing_type_options = [
  ["room", "单间"],
  ["whole_unit", "整套"],
  ["student_apartment", "学生公寓"],
  ["bedspace", "床位"]
];
const room_type_options = [
  ["common_room", "普通房"],
  ["master_room", "主人房"],
  ["studio", "Studio"],
  ["partition_room", "隔间"],
  ["maid_room", "佣人房"],
  ["whole_unit", "整套"]
];

export default async function ListingImportCandidateDetailPage({ params, searchParams }: PageProps) {
  const profile = await getCurrentProfile();
  const { id } = await params;
  const query = await searchParams;

  if (!profile) {
    return <AccessCard title="需要登录" message="候选房源详情仅管理员可访问。" actionHref={`/auth/login?next=/admin/listing-imports/${id}`} actionText="登录" />;
  }
  if (profile.role !== "admin") {
    return <AccessCard title="无权限访问" message="只有 admin 可以编辑爬虫候选房源。" actionHref="/rent" actionText="返回找房" />;
  }

  const detail = await getListingImportCandidateDetail(id);
  if (!detail) {
    return <AccessCard title="候选不存在" message="这条候选房源可能已被删除。" actionHref="/admin/listing-imports" actionText="返回候选列表" />;
  }

  const { candidate, ingestion, preference_stats } = detail;
  const is_read_only = candidate.import_status === "imported";
  const candidate_label = candidate.candidate_no
    ? `C${String(candidate.candidate_no).padStart(4, "0")}`
    : candidate.id;
  const source_url = candidate.source_url || ingestion?.detail_url || ingestion?.listing_url;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted">
            <Link href="/admin">后台</Link> / <Link href="/admin/listing-imports">候选房源</Link> / {candidate_label}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{candidate.parsed_title || "无标题候选房源"}</h1>
            {candidate.import_status === "parsed" ? <Badge tone="success">已发布</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {candidate.source} / {candidate.source_id || "-"} · 状态 {candidate.import_status} · 解析置信度 {candidate.parse_confidence ?? "-"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {source_url ? <a href={source_url} target="_blank" rel="noreferrer" className="btn-primary">打开来源</a> : null}
          <Link href="/admin/listing-imports" className="btn-secondary">返回列表</Link>
        </div>
      </div>

      {query.saved === "1" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">保存成功。</div>
      ) : null}
      {typeof query.error === "string" ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</div>
      ) : null}
      {is_read_only ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">该候选已导入，当前详情为只读。</div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <form action={updateListingImportCandidate.bind(null, candidate.id)} className="card space-y-5 p-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Candidate 结构化字段</h2>
            <p className="mt-1 text-sm text-muted">人工修正只更新候选记录，不会自动发布或导入正式房源。</p>
          </div>

          <fieldset disabled={is_read_only} className="space-y-5 disabled:opacity-70">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField name="parsed_title" label="标题" value={candidate.parsed_title} className="md:col-span-2" />
              <NumberField name="parsed_rent_amount" label="租金" value={candidate.parsed_rent_amount} min={0} />
              <TextField name="parsed_postal_code" label="邮编" value={candidate.parsed_postal_code} inputMode="numeric" />
              <SelectField name="parsed_listing_type" label="房源类型" value={candidate.parsed_listing_type} options={listing_type_options} />
              <SelectField name="parsed_room_type" label="房间类型" value={candidate.parsed_room_type} options={room_type_options} />
              <TextField name="parsed_available_from" label="可入住日期" value={candidate.parsed_available_from} type="date" />
              <NumberField name="parsed_min_lease_months" label="最短租期（月）" value={candidate.parsed_min_lease_months} min={0} />
              <NumberField name="parsed_max_occupants" label="最大入住人数" value={candidate.parsed_max_occupants} min={0} />
              <TextField name="parsed_phone" label="电话" value={candidate.parsed_phone} />
              <TextField name="parsed_wechat" label="微信" value={candidate.parsed_wechat} />
              <BooleanField name="parsed_registration_allowed" label="允许报地址" value={candidate.parsed_registration_allowed} />
              <BooleanField name="parsed_landlord_staying" label="屋主同住" value={candidate.parsed_landlord_staying} />
            </div>

            <div>
              <h3 className="mb-3 font-semibold text-ink">Policy 字段</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField name="parsed_utilities_policy" label="水电政策" value={candidate.parsed_utilities_policy} options={[
                  ["included", "包含"], ["shared", "均摊"], ["excluded", "不包含"], ["capped", "限额包含"]
                ]} />
                <SelectField name="parsed_aircon_policy" label="空调政策" value={candidate.parsed_aircon_policy} options={[
                  ["included", "包含"], ["extra_charge", "额外收费"], ["limited_hours", "限时使用"], ["not_available", "无空调"]
                ]} />
                <SelectField name="parsed_cooking_policy" label="煮饭政策" value={candidate.parsed_cooking_policy} options={[
                  ["full", "可大煮"], ["light", "可小煮"], ["no", "不可煮"]
                ]} />
                <SelectField name="parsed_visitors_policy" label="访客政策" value={candidate.parsed_visitors_policy} options={[
                  ["allowed", "允许"], ["limited", "有限制"], ["not_allowed", "不允许"]
                ]} />
                <SelectField name="parsed_smoking_policy" label="吸烟政策" value={candidate.parsed_smoking_policy} options={[
                  ["allowed", "允许"], ["not_allowed", "不允许"]
                ]} />
                <SelectField name="parsed_pets_policy" label="宠物政策" value={candidate.parsed_pets_policy} options={[
                  ["allowed", "允许"], ["not_allowed", "不允许"]
                ]} />
              </div>
            </div>

            {!is_read_only ? <button type="submit" className="btn-primary">保存候选修改</button> : null}
          </fieldset>
        </form>

        <div className="space-y-4">
          <ListingPreferenceStats stats={preference_stats} />

          <section className="card p-5">
            <h2 className="font-semibold text-ink">Candidate 信息</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <InfoRow label="ID" value={candidate.id} />
              <InfoRow label="候选编号" value={candidate_label} />
              <InfoRow label="采集 ID" value={String(candidate.ingestion_listing_id)} />
              <InfoRow label="状态" value={candidate.import_status} />
              <InfoRow label="Parser" value={candidate.parser_version} />
              <InfoRow label="创建时间" value={formatSingaporeMediumDateTime(candidate.created_at)} />
              <InfoRow label="更新时间" value={formatSingaporeMediumDateTime(candidate.updated_at)} />
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold text-ink">Parse warnings</h2>
            {candidate.parse_warnings?.length ? (
              <ul className="mt-3 space-y-2 text-sm text-amber-800">
                {candidate.parse_warnings.map((warning: string) => <li key={warning}>• {warning}</li>)}
              </ul>
            ) : <p className="mt-3 text-sm text-muted">没有解析警告。</p>}
          </section>

          <section className="card p-5">
            <h2 className="font-semibold text-ink">Source URL</h2>
            {source_url ? (
              <a href={source_url} target="_blank" rel="noreferrer" className="mt-3 block break-all text-sm text-brand hover:underline">{source_url}</a>
            ) : <p className="mt-3 text-sm text-muted">没有来源链接。</p>}
          </section>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TextPanel title="Clean description" value={candidate.parsed_description_clean} />
        <TextPanel title="Candidate description" value={candidate.parsed_description} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <TextPanel title="list_raw_text" value={ingestion?.list_raw_text} tall />
        <div className="card p-5">
          <h2 className="font-semibold text-ink">原始 ingestion listing</h2>
          {ingestion ? (
            <dl className="mt-3 space-y-3 text-sm">
              <InfoRow label="ID" value={String(ingestion.id)} />
              <InfoRow label="来源" value={ingestion.source} />
              <InfoRow label="来源编号" value={ingestion.source_id} />
              <InfoRow label="列表标题" value={ingestion.list_title} />
              <InfoRow label="列表价格" value={ingestion.list_price === null ? null : `$${ingestion.list_price}`} />
              <InfoRow label="列表联系" value={ingestion.list_contact} />
              <InfoRow label="详情 URL" value={ingestion.detail_url} />
              <InfoRow label="列表 URL" value={ingestion.listing_url} />
              <InfoRow label="抓取时间" value={formatSingaporeMediumDateTime(ingestion.scraped_at)} />
              <InfoRow label="入库时间" value={formatSingaporeMediumDateTime(ingestion.created_at)} />
            </dl>
          ) : <p className="mt-3 text-sm text-muted">关联的原始采集记录不存在。</p>}
        </div>
      </section>
    </main>
  );
}

function TextField({
  name,
  label,
  value,
  className = "",
  type = "text",
  inputMode
}: {
  name: string;
  label: string;
  value: string | null;
  className?: string;
  type?: string;
  inputMode?: "numeric";
}) {
  return <label className={className}>{label}<input className="mt-1" name={name} defaultValue={value ?? ""} type={type} inputMode={inputMode} /></label>;
}

function NumberField({ name, label, value, min }: { name: string; label: string; value: number | null; min: number }) {
  return <label>{label}<input className="mt-1" name={name} defaultValue={value ?? ""} type="number" min={min} step="1" /></label>;
}

function SelectField({
  name,
  label,
  value,
  options
}: {
  name: string;
  label: string;
  value: string | null;
  options: string[][];
}) {
  return (
    <label>{label}
      <select className="mt-1" name={name} defaultValue={value ?? ""}>
        <option value="">未识别 / 未说明</option>
        {options.map(([option_value, option_label]) => <option key={option_value} value={option_value}>{option_label}</option>)}
      </select>
    </label>
  );
}

function BooleanField({ name, label, value }: { name: string; label: string; value: boolean | null }) {
  return (
    <label>{label}
      <select className="mt-1" name={name} defaultValue={value === null ? "" : String(value)}>
        <option value="">未识别</option>
        <option value="true">是</option>
        <option value="false">否</option>
      </select>
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="break-all font-medium text-ink">{value || "-"}</dd>
    </div>
  );
}

function TextPanel({ title, value, tall = false }: { title: string; value: string | null | undefined; tall?: boolean }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-ink">{title}</h2>
      <pre className={`${tall ? "max-h-[640px]" : "max-h-[420px]"} mt-3 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-gray-50 p-3 text-sm leading-6 text-ink`}>
        {value || "没有内容。"}
      </pre>
    </section>
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
