import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getAdminListingDetail,
  setAdminListingStatus,
  updateAdminListing
} from "@/actions/admin";
import { facilities, facilityLabels } from "@/lib/types";
import { getCurrentProfile } from "@/lib/auth";
import { getListingHref } from "@/lib/listingUrl";

const tenantTypes = [["student", "学生"], ["professional", "上班族"], ["couple", "情侣"], ["family", "家庭"], ["single", "单人"]];

export default async function AdminListingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/auth/login?next=/admin/listings/${id}`);
  if (profile.role !== "admin") redirect("/");

  const query = await searchParams;
  const detail = await getAdminListingDetail(id);
  if (!detail) notFound();
  const { listing, owner, images } = detail;
  const facilityByName = new Map(detail.facilities.map((item) => [item.facility_name, item]));

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-brand">正式房源 #{listing.listing_no}</div>
          <h1 className="mt-1 text-2xl font-bold text-ink">{listing.title}</h1>
          <p className="mt-2 text-sm text-muted">
            状态：{listing.status} · 发布者：{owner?.display_name ?? "未知"}（{owner?.role ?? "-"}）
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/listings" className="btn-secondary">返回列表</Link>
          {listing.status === "published" ? <Link href={getListingHref(listing)} className="btn-secondary">查看公开页</Link> : null}
        </div>
      </div>

      {query.saved === "1" ? <Notice text="房源详情已保存。" /> : null}
      {typeof query.status_updated === "string" ? <Notice text={`房源状态已更新为 ${query.status_updated}。`} /> : null}
      {typeof query.error === "string" ? <ErrorNotice text={query.error} /> : null}

      <section className="card p-4">
        <h2 className="font-semibold text-ink">状态管理</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusButton id={listing.id} status="published" label="发布" primary />
          <StatusButton id={listing.id} status="draft" label="下架为草稿" />
          <StatusButton id={listing.id} status="pending_review" label="转待审核" />
          <StatusButton id={listing.id} status="rented" label="标记已出租" />
          <form action={setAdminListingStatus} className="flex flex-wrap gap-2">
            <input type="hidden" name="listing_id" value={listing.id} />
            <input type="hidden" name="status" value="rejected" />
            <input name="rejection_reason" defaultValue={listing.rejection_reason ?? ""} placeholder="拒绝原因" />
            <button className="btn-secondary" type="submit">拒绝</button>
          </form>
        </div>
      </section>

      <form action={updateAdminListing.bind(null, listing.id)} className="space-y-5">
        <Section title="核心信息">
          <div className="grid gap-4 md:grid-cols-2">
            <Field name="title" label="标题" defaultValue={listing.title} required />
            <Select name="listing_type" label="房源类型" defaultValue={listing.listing_type} options={[["room", "单间"], ["whole_unit", "整套"], ["student_apartment", "学生公寓"], ["bedspace", "床位"]]} />
            <Select name="room_type" label="房间类型（整套可留空）" defaultValue={listing.room_type ?? ""} emptyLabel="整套不适用" options={[["master_room", "主人房"], ["common_room", "普通房"], ["partition_room", "隔间"], ["maid_room", "佣人房"], ["studio", "Studio公寓"]]} />
            <Field name="rent_amount" label="租金 SGD/月" type="number" defaultValue={listing.rent_amount} required />
            <Field name="deposit_amount" label="押金 SGD" type="number" defaultValue={listing.deposit_amount} />
            <Field name="postal_code" label="邮编" defaultValue={listing.postal_code} required />
            <Field name="unit_hidden_address" label="隐藏门牌/单元地址" defaultValue={listing.unit_hidden_address} />
            <Field name="available_from" label="可入住日期" type="date" defaultValue={listing.available_from} required />
            <Field name="available_note" label="入住备注" defaultValue={listing.available_note} />
            <Field name="min_lease_months" label="最短租期（月）" type="number" defaultValue={listing.min_lease_months} required />
            <Field name="max_occupants" label="最多入住人数" type="number" defaultValue={listing.max_occupants} required />
            <Select name="gender_preference" label="性别偏好" defaultValue={listing.gender_preference} options={[["any", "不限"], ["male", "男"], ["female", "女"]]} />
          </div>
        </Section>

        <Section title="居住质量与身份">
          <div className="grid gap-4 md:grid-cols-2">
            <Field name="total_bedrooms" label="整套房间数" type="number" defaultValue={listing.total_bedrooms} />
            <Field name="total_bathrooms" label="整套浴室数" type="number" defaultValue={listing.total_bathrooms} />
            <Field name="current_occupants_count" label="当前住户人数" type="number" defaultValue={listing.current_occupants_count} />
            <Field name="bathroom_shared_with_count" label="共用浴室人数" type="number" defaultValue={listing.bathroom_shared_with_count} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Check name="registration_allowed" label="可报地址" checked={listing.registration_allowed} />
            <Check name="landlord_staying" label="屋主同住" checked={listing.landlord_staying} />
            <Check name="is_owner_direct" label="屋主直租" checked={listing.is_owner_direct} />
            <Check name="is_agent" label="中介房源" checked={listing.is_agent} />
            <Check name="is_sublet" label="转租" checked={listing.is_sublet} />
          </div>
        </Section>

        <Section title="规则与偏好">
          <div className="grid gap-4 md:grid-cols-3">
            <Select name="utilities_policy" label="水电政策" defaultValue={listing.utilities_policy ?? ""} emptyLabel="未说明" options={[["included", "包含"], ["shared", "均摊"], ["excluded", "不包含"], ["capped", "限额包含"]]} />
            <Select name="aircon_policy" label="空调政策" defaultValue={listing.aircon_policy ?? ""} emptyLabel="未说明" options={[["included", "包含"], ["extra_charge", "额外收费"], ["limited_hours", "限时使用"], ["not_available", "无空调"]]} />
            <Select name="cooking_policy" label="煮饭政策" defaultValue={listing.cooking_policy ?? ""} emptyLabel="未说明" options={[["full", "可大煮"], ["light", "可小煮"], ["no", "不可煮"]]} />
            <Select name="visitors_policy" label="访客政策" defaultValue={listing.visitors_policy ?? ""} emptyLabel="未说明" options={[["allowed", "允许"], ["limited", "有限制"], ["not_allowed", "不允许"]]} />
            <Select name="smoking_policy" label="吸烟政策" defaultValue={listing.smoking_policy ?? ""} emptyLabel="未说明" options={[["allowed", "允许"], ["not_allowed", "不允许"]]} />
            <Select name="pets_policy" label="宠物政策" defaultValue={listing.pets_policy ?? ""} emptyLabel="未说明" options={[["allowed", "允许"], ["not_allowed", "不允许"]]} />
          </div>
          <div className="mt-4">
            <div className="text-sm font-medium">租客类型偏好</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {tenantTypes.map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                  <input className="w-auto" type="checkbox" name="tenant_type_preference" value={value} defaultChecked={(listing.tenant_type_preference ?? []).includes(value)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </Section>

        <Section title="联系方式与审核">
          <div className="grid gap-4 md:grid-cols-2">
            <Select name="source" label="来源" defaultValue={listing.source} options={[["owner_submit", "屋主提交"], ["wechat_group", "微信群"], ["zufang", "狮城论坛"], ["xiaohongshu", "小红书"], ["manual", "管理员录入"]]} />
            <Select name="contact_visibility" label="联系方式可见范围" defaultValue={listing.contact_visibility} options={[["private", "不公开"], ["login_only", "登录后可见"], ["group_only", "指定群体可见"], ["public", "公开"]]} />
            <Field name="wechat" label="微信" defaultValue={listing.wechat} />
            <Field name="phone" label="电话" defaultValue={listing.phone} />
            <Select name="verification_status" label="认证状态" defaultValue={listing.verification_status} options={[["unverified", "未认证"], ["owner_verified", "屋主已认证"], ["agent_verified", "中介已认证"], ["suspicious", "可疑"], ["rejected", "拒绝"]]} />
            <Field name="rejection_reason" label="拒绝原因" defaultValue={listing.rejection_reason} />
          </div>
          <TextArea name="description" label="原始描述" value={listing.description} />
          <TextArea name="description_clean" label="公开描述" value={listing.description_clean} />
          <TextArea name="internal_note" label="内部备注（不公开）" value={listing.internal_note} />
        </Section>

        <Section title="设施">
          <div className="space-y-3">
            {facilities.map((facility) => {
              const current = facilityByName.get(facility);
              return (
                <div key={facility} className="grid gap-2 rounded-md border border-line p-3 md:grid-cols-[160px_180px_1fr]">
                  <input type="hidden" name="facility_name" value={facility} />
                  <div className="font-medium">{facilityLabels[facility]}</div>
                  <select name={`facility_${facility}`} defaultValue={current?.availability ?? "not_available"}>
                    <option value="available">可使用</option>
                    <option value="restricted">限制使用</option>
                    <option value="not_available">不可使用</option>
                  </select>
                  <input name={`facility_note_${facility}`} defaultValue={current?.note ?? ""} placeholder="设施备注" />
                </div>
              );
            })}
          </div>
        </Section>

        <button className="btn-primary w-full md:w-auto" type="submit">保存房源详情</button>
      </form>

      <Section title={`图片（${images.length}）`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <a key={image.id} href={image.image_url} target="_blank" rel="noreferrer" className="rounded-md border border-line p-3 text-sm hover:border-brand">
              <div className="truncate font-medium text-ink">{image.caption || "未命名图片"}</div>
              <div className="mt-1 truncate text-muted">排序 {image.sort_order} · {image.image_url}</div>
            </a>
          ))}
        </div>
        {images.length === 0 ? <div className="text-sm text-muted">暂无图片。</div> : null}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card p-4"><h2 className="mb-4 font-semibold text-ink">{title}</h2>{children}</section>;
}

function Field({ name, label, type = "text", defaultValue, required = false }: { name: string; label: string; type?: string; defaultValue: unknown; required?: boolean }) {
  return <div><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={defaultValue == null ? "" : String(defaultValue)} required={required} /></div>;
}

function Select({ name, label, defaultValue, options, emptyLabel }: { name: string; label: string; defaultValue: string; options: [string, string][]; emptyLabel?: string }) {
  return <div><label htmlFor={name}>{label}</label><select id={name} name={name} defaultValue={defaultValue}>{emptyLabel ? <option value="">{emptyLabel}</option> : null}{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>;
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2"><input className="w-auto" type="checkbox" name={name} defaultChecked={checked} />{label}</label>;
}

function TextArea({ name, label, value }: { name: string; label: string; value: string | null }) {
  return <div className="mt-4"><label htmlFor={name}>{label}</label><textarea id={name} name={name} rows={4} defaultValue={value ?? ""} /></div>;
}

function StatusButton({ id, status, label, primary = false }: { id: string; status: string; label: string; primary?: boolean }) {
  return <form action={setAdminListingStatus}><input type="hidden" name="listing_id" value={id} /><input type="hidden" name="status" value={status} /><button className={primary ? "btn-primary" : "btn-secondary"} type="submit">{label}</button></form>;
}

function Notice({ text }: { text: string }) {
  return <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{text}</div>;
}

function ErrorNotice({ text }: { text: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{text}</div>;
}
