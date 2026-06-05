import Link from "next/link";
import { CleanListingRow, deleteCleanListing, deleteMissingRoomTypeCleanListings, getCleanListings, updateCleanListingRoomType } from "@/actions/cleanListings";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { FormSubmitButton } from "@/components/admin/FormSubmitButton";
import { getCurrentProfile } from "@/lib/auth";

export default async function CleanListingsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const room_type_filter = params.room_type === "missing" ? "missing" : undefined;
  const is_missing_room_type_filter = room_type_filter === "missing";
  const current_path = is_missing_room_type_filter ? "/admin/clean-listings?room_type=missing" : "/admin/clean-listings";

  if (!profile) {
    return (
      <Shell>
        <AccessCard title="需要登录" message="清洗房源审计仅管理员可访问。请先登录管理员账号。" actionHref="/auth/login?next=/admin/clean-listings" actionText="登录" />
      </Shell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <Shell>
        <AccessCard title="无权限访问" message={`当前账号角色为 ${profile.role}，只有 admin 可以查看清洗房源。`} actionHref="/rent" actionText="返回找房" />
      </Shell>
    );
  }

  const listings = await getCleanListings({ room_type: room_type_filter });

  return (
    <Shell>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-medium text-muted">
            <Link href="/admin" className="hover:text-ink">后台</Link>
            <span className="px-2">/</span>
            <Link href="/admin/ingestion" className="hover:text-ink">采集数据</Link>
            <span className="px-2">/</span>
            清洗房源
          </div>
          <h1 className="mt-2 text-2xl font-bold text-ink">清洗房源审计</h1>
          <p className="mt-2 text-sm text-muted">查看 listing_clean 的结构化结果，重点检查房型、三态字段和状态。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/clean-listings" className={is_missing_room_type_filter ? "btn-secondary" : "btn-primary"}>全部房源</Link>
          <Link href="/admin/clean-listings?room_type=missing" className={is_missing_room_type_filter ? "btn-primary" : "btn-secondary"}>缺房型</Link>
          {is_missing_room_type_filter && listings.length > 0 ? (
            <form action={deleteMissingRoomTypeCleanListings}>
              <input type="hidden" name="redirect_to" value={current_path} />
              <ConfirmSubmitButton
                className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                confirmMessage={`确定删除全部 ${listings.length} 条缺房型房源吗？会同步删除 AI 分析、索引层、清洗层和原始采集记录。`}
                pendingText="删除中..."
              >
                删除全部缺房型
              </ConfirmSubmitButton>
            </form>
          ) : null}
          <Link href="/admin/invalid-listings" className="btn-secondary">查看无效房源</Link>
          <Link href="/admin/ingestion" className="btn-secondary">返回采集管理</Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label={is_missing_room_type_filter ? "缺房型总数" : "总数"} value={listings.length} />
        <Metric label="Active" value={countStatus(listings, "active")} />
        <Metric label="Invalid" value={countStatus(listings, "invalid")} />
        {is_missing_room_type_filter ? (
          <Metric label="原始房型为空" value={listings.filter((item) => isBlank(item.room_type)).length} />
        ) : (
          <Metric label="缺房型" value={countMissingRoomType(listings)} />
        )}
        <Metric label="主人房" value={countRoomType(listings, "master_room")} />
      </section>

      {typeof params.updated === "string" ? (
        <Notice tone="success" message="已补充房源类型，并同步更新索引层。" />
      ) : null}
      {typeof params.deleted === "string" ? (
        <Notice tone="success" message="已删除该房源，并同步删除 AI 分析、索引层、清洗层和原始采集记录。" />
      ) : null}
      {typeof params.bulk_deleted === "string" ? (
        <Notice tone="success" message={`已批量删除 ${params.bulk_deleted} 条缺房型房源，并同步删除 AI 分析、索引层、清洗层和原始采集记录。`} />
      ) : null}
      {typeof params.update_error === "string" ? (
        <Notice tone="error" message="房源类型保存失败，请重新选择后再试。" />
      ) : null}
      {typeof params.delete_error === "string" ? (
        <Notice tone="error" message="删除失败，请刷新后重试。" />
      ) : null}

      <section className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">Clean 列表</h2>
          <p className="mt-1 text-sm text-muted">
            {is_missing_room_type_filter ? "当前显示全部 room_type 或 normalized_room_type 为空的清洗房源，按 listing_clean 创建时间倒序。" : "最多显示最近 200 条，按 listing_clean 创建时间倒序。"}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1400px] w-full border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">房源</th>
                <th className="px-4 py-3">价格/区域</th>
                <th className="px-4 py-3">房型</th>
                <th className="px-4 py-3">三态字段</th>
                <th className="px-4 py-3">限制</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-t border-line align-top">
                  <td className="max-w-[360px] px-4 py-3">
                    <div className="font-semibold text-ink">{listing.title || "未命名房源"}</div>
                    <div className="mt-1 text-xs text-muted">{listing.source ?? "unknown"} · {listing.source_id ?? "-"}</div>
                    <div className="mt-1 text-xs text-muted">{listing.clean_version ?? "no clean version"}</div>
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
                    <TriState label="可煮" value={listing.cooking_allowed} />
                    <TriState label="可报地址" value={listing.can_register_address} />
                    <TriState label="屋主同住" value={listing.landlord_stay} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {listing.gender_preference ? formatGender(listing.gender_preference) : "未说明"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={listing.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-2">
                      <form action={updateCleanListingRoomType} className="flex flex-wrap justify-end gap-2">
                        <input type="hidden" name="clean_listing_id" value={listing.id} />
                        <input type="hidden" name="redirect_to" value={current_path} />
                        <select name="normalized_room_type" defaultValue={listing.normalized_room_type ?? ""} className="min-w-[120px] py-1.5 text-xs">
                          <option value="" disabled>选择房型</option>
                          <option value="master_room">主人房</option>
                          <option value="common_room">普通房</option>
                          <option value="single_room">单人间</option>
                          <option value="studio">Studio</option>
                        </select>
                        <FormSubmitButton className="btn-primary px-3 py-1.5 text-xs" pendingText="保存中...">保存</FormSubmitButton>
                      </form>
                      <div className="flex flex-wrap justify-end gap-2">
                        {(listing.detail_url || listing.listing_url) ? (
                          <a className="btn-secondary px-3 py-1.5 text-xs" href={listing.detail_url || listing.listing_url || "#"} target="_blank" rel="noreferrer">
                            原帖
                          </a>
                        ) : (
                          <span className="px-3 py-1.5 text-xs text-muted">无链接</span>
                        )}
                        <form action={deleteCleanListing}>
                          <input type="hidden" name="clean_listing_id" value={listing.id} />
                          <input type="hidden" name="redirect_to" value={current_path} />
                          <ConfirmSubmitButton
                            className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                            confirmMessage="确定删除这条房源吗？会同步删除 AI 分析、索引层、清洗层和原始采集记录。"
                            pendingText="删除中..."
                          >
                            删除
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {listings.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted">{is_missing_room_type_filter ? "当前没有缺房型的清洗房源。" : "当前没有清洗房源。"}</div> : null}
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

function Notice({ tone, message }: { tone: "success" | "error"; message: string }) {
  const className = tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-red-200 bg-red-50 text-red-700";

  return <div className={`rounded-md border p-3 text-sm ${className}`}>{message}</div>;
}

function TriState({ label, value }: { label: string; value: boolean | null }) {
  const text = value === true ? "是" : value === false ? "否" : "未说明";
  const className = value === true
    ? "text-emerald-700"
    : value === false
      ? "text-red-700"
      : "text-muted";

  return (
    <div className="mb-1 text-sm">
      <span className="text-muted">{label}：</span>
      <span className={`font-semibold ${className}`}>{text}</span>
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

function countStatus(listings: CleanListingRow[], status: string) {
  return listings.filter((listing) => listing.status === status).length;
}

function countRoomType(listings: CleanListingRow[], roomType: string) {
  return listings.filter((listing) => listing.normalized_room_type === roomType).length;
}

function countMissingRoomType(listings: CleanListingRow[]) {
  return listings.filter((listing) => isBlank(listing.room_type) || isBlank(listing.normalized_room_type)).length;
}

function isBlank(value: string | null) {
  return value === null || value.trim() === "";
}

function formatRoomType(value: string | null) {
  if (value === "master_room") return "主人房";
  if (value === "common_room") return "普通房";
  if (value === "single_room" || value === "partition_room") return "单人间";
  if (value === "studio") return "Studio公寓";
  return value ?? "unknown";
}

function formatGender(value: string) {
  if (value === "female_only") return "限女生";
  if (value === "male_only") return "限男生";
  if (value === "couple_allowed") return "可情侣/夫妻";
  if (value === "single_only") return "限单人";
  return value;
}
