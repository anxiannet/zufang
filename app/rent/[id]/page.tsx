import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createEnquiry } from "@/actions/enquiries";
import { getListingDetail } from "@/actions/listings";
import { getCurrentProfile } from "@/lib/auth";
import { facilityLabels } from "@/lib/types";

const roomLabels: Record<string, string> = {
  common_room: "普通房",
  master_room: "主人房",
  studio: "Studio",
  whole_unit: "整套"
};

export default async function ListingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const listing = await getListingDetail(id);
  if (!listing) notFound();
  const profile = await getCurrentProfile();

  const images = listing.listing_images?.sort((a, b) => a.sort_order - b.sort_order) ?? [];
  const facilities = listing.listing_facilities ?? [];
  const byAvailability = (availability: string) => facilities.filter((item) => item.availability === availability);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 md:col-span-2">
          {images[0] ? <Image src={images[0].image_url} alt={listing.title} fill className="object-cover" priority /> : <div className="flex h-full items-center justify-center text-muted">暂无图片</div>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          {images.slice(1, 3).map((image) => (
            <div key={image.image_url} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
              <Image src={image.image_url} alt={image.caption ?? listing.title} fill className="object-cover" />
            </div>
          ))}
        </div>
      </div>

      <section className="card grid gap-4 p-4 md:grid-cols-[1fr_280px]">
        <div>
          <h1 className="text-2xl font-bold text-ink">{listing.title}</h1>
          <p className="mt-2 text-muted">{listing.street_name ?? listing.postal_code} · 最近 MRT：{listing.nearest_mrt ?? "待补充"}</p>
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-ink">{listing.description}</p>
        </div>
        <div className="rounded-lg bg-teal-50 p-4">
          <div className="text-3xl font-bold text-brand">${listing.rent_amount}</div>
          <div className="text-sm text-muted">{listing.currency}/月 · 押金 ${listing.deposit_amount ?? 0}</div>
          <dl className="mt-4 grid gap-2 text-sm">
            <Row label="可入住" value={listing.available_from} />
            <Row label="房型" value={roomLabels[listing.room_type] ?? listing.room_type} />
            <Row label="最短租期" value={`${listing.min_lease_months} 个月`} />
          </dl>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Panel title="居住质量">
          <Row label="整套房间" value={`${listing.total_bedrooms ?? 0} 个`} />
          <Row label="浴室" value={`${listing.total_bathrooms ?? 0} 个`} />
          <Row label="当前住户" value={`${listing.current_occupants_count ?? 0} 人`} />
          <Row label="共用浴室人数" value={`${listing.bathroom_shared_with_count ?? 0} 人`} />
          <Row label="屋主同住" value={listing.landlord_staying ? "是" : "否"} />
        </Panel>
        <Panel title="规则">
          <Row label="可煮" value={listing.cooking_allowed ? "是" : "否"} />
          <Row label="可报地址" value={listing.registration_allowed ? "是" : "否"} />
          <Row label="禁烟" value={listing.smoking_allowed ? "允许吸烟" : "禁烟"} />
          <Row label="访客" value={listing.visitors_allowed ? "允许" : "不允许"} />
          <Row label="宠物" value={listing.pets_allowed ? "允许" : "不允许"} />
          <Row label="性别偏好" value={listing.gender_preference === "any" ? "不限" : listing.gender_preference} />
          {listing.house_rules ? <p className="mt-3 whitespace-pre-line text-sm text-muted">{listing.house_rules}</p> : null}
        </Panel>
      </section>

      <Panel title="设施">
        <FacilityGroup title="可使用" items={byAvailability("available")} />
        <FacilityGroup title="限制使用" items={byAvailability("restricted")} />
        <FacilityGroup title="不可使用" items={byAvailability("not_available")} muted />
      </Panel>

      <section className="grid gap-4 md:grid-cols-[1fr_360px]">
        <Panel title="周边信息">
          <div className="grid gap-2 sm:grid-cols-2">
            {(listing.nearby_places_cache ?? []).map((place) => (
              <div key={`${place.place_type}-${place.name}`} className="rounded-md border border-line p-3 text-sm">
                <div className="font-semibold text-ink">{place.name}</div>
                <div className="text-muted">{place.place_type} · {place.distance_meters}m · 步行 {place.walking_minutes} 分钟</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="联系 / 咨询">
          {query.error === "enquiry_role" ? (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              当前账号不是租客角色，不能发送咨询。
            </div>
          ) : null}
          {profile ? (
            <form action={createEnquiry} className="space-y-3">
              <input type="hidden" name="listing_id" value={listing.id} />
              <textarea name="message" rows={4} required placeholder="介绍入住人数、职业/学校、期望看房时间" />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" name="move_in_date" />
                <input type="number" name="lease_duration_months" placeholder="租期（月）" />
              </div>
              <input type="number" name="occupants_count" placeholder="入住人数" defaultValue={1} />
              <button className="btn-primary w-full" type="submit">发送 enquiry</button>
            </form>
          ) : (
            <div className="rounded-md border border-line bg-gray-50 p-4 text-sm text-muted">
              登录后可以向房东发送咨询，未登录用户仍可查看房源和联系方式。
              <Link className="btn-primary mt-3 w-full" href={`/auth/login?next=/rent/${listing.id}&reason=enquiry`}>
                登录后咨询
              </Link>
            </div>
          )}
          <div className="mt-4 space-y-2 text-sm text-muted">
            {listing.users_profile?.whatsapp ? <a className="btn-secondary w-full" href={`https://wa.me/${listing.users_profile.whatsapp}`} target="_blank">WhatsApp 联系</a> : null}
            {listing.users_profile?.wechat ? <div>微信：<span className="font-semibold text-ink">{listing.users_profile.wechat}</span></div> : null}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function FacilityGroup({ title, items, muted = false }: { title: string; items: { facility_name: string; note: string | null }[]; muted?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item.facility_name} className={`rounded-full border px-3 py-1 text-sm ${muted ? "border-gray-200 bg-gray-50 text-muted" : "border-teal-100 bg-teal-50 text-ink"}`}>
            {facilityLabels[item.facility_name as keyof typeof facilityLabels] ?? item.facility_name}
            {item.note ? `：${item.note}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
