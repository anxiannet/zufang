import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Bath,
  BusFront,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  CookingPot,
  Home,
  Info,
  MapPinned,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { createEnquiry } from "@/actions/enquiries";
import { getListingDetail } from "@/actions/listings";
import { ListingDetailHero } from "@/components/listings/ListingDetailHero";
import { Badge } from "@/components/ui/Badge";
import { getCurrentProfile } from "@/lib/auth";
import { facilityLabels } from "@/lib/types";
import { getListingHref, getListingPublicId } from "@/lib/listingUrl";

const policyLabels: Record<string, string> = {
  included: "包含在租金内",
  shared: "按住户均摊",
  excluded: "不包含",
  capped: "限额包含",
  extra_charge: "需要额外付费",
  limited_hours: "限制使用时段",
  not_available: "不可使用",
  full: "可正常煮饭",
  light: "仅可简单烹饪",
  no: "不可煮饭",
  allowed: "允许",
  limited: "有限制",
  not_allowed: "不允许"
};

const tenantLabels: Record<string, string> = {
  student: "学生",
  professional: "上班族",
  couple: "情侣",
  family: "家庭",
  single: "单人"
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
  const returnHref = safeRentReturnHref(query.return_to);
  const publicId = getListingPublicId(listing);
  if (id !== publicId) redirect(getListingHref(listing, returnHref));
  const listingHref = getListingHref(listing, returnHref);
  const profile = await getCurrentProfile();
  const isCandidate = listing.detail_source === "candidate";
  const facilities = listing.listing_facilities ?? [];
  const tenantPreferences = Array.isArray(listing.tenant_type_preference) ? listing.tenant_type_preference : [];
  const availableFacilities = facilities.filter((item) => item.availability === "available");
  const restrictedFacilities = facilities.filter((item) => item.availability === "restricted");
  const unavailableFacilities = facilities.filter((item) => item.availability === "not_available");
  const canShowContact = !isCandidate && (listing.contact_visibility === "public" || (listing.contact_visibility === "login_only" && Boolean(profile)));
  const polishedDescription = listing.description_clean;
  const canShowNearby = Boolean(listing.postal_code);
  const nearbyGroups = groupNearbyPlaces(listing.nearby_places_cache ?? []);

  return (
    <div className="container-page py-6 sm:py-10">
      <Link href={returnHref} className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted transition hover:text-brand">
        <ChevronLeft className="h-4 w-4" /> 返回房源列表
      </Link>

      <ListingDetailHero listing={listing} />

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel icon={Sparkles} eyebrow="Listing Summary" title="房源简介">
            <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
              {polishedDescription || "房源简介正在整理中，可先查看下方结构化信息。"}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {getReasons(listing).map((reason) => <Badge key={reason} tone="brand">{reason}</Badge>)}
            </div>
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel icon={Home} eyebrow="Living Quality" title="居住质量">
              <DataRow label="整套房间数" value={numberValue(listing.total_bedrooms, "间")} />
              <DataRow label="整套浴室数" value={numberValue(listing.total_bathrooms, "间")} />
              <DataRow label="当前住户" value={numberValue(listing.current_occupants_count, "人")} />
              <DataRow label="共用浴室人数" value={numberValue(listing.bathroom_shared_with_count, "人")} />
              <DataRow label="屋主同住" value={booleanLabel(listing.landlord_staying)} />
              <DataRow label="最多入住" value={numberValue(listing.max_occupants, "人")} />
            </Panel>
            <Panel icon={CircleDollarSign} eyebrow="Costs" title="费用说明">
              <DataRow label="每月租金" value={`$${listing.rent_amount.toLocaleString("en-SG")}`} strong />
              <DataRow label="押金" value={listing.deposit_amount == null ? "待补充" : `$${listing.deposit_amount.toLocaleString("en-SG")}`} />
              <DataRow label="水电费用" value={policyLabel(listing.utilities_policy)} />
              <DataRow label="空调费用" value={policyLabel(listing.aircon_policy)} />
              <DataRow label="最短租期" value={numberValue(listing.min_lease_months, "个月")} />
              <DataRow label="中介属性" value={listing.is_agent === true ? "中介房源" : listing.is_owner_direct === true ? "屋主直租" : listing.is_agent === false && listing.is_owner_direct === false ? "非中介 / 非直租" : "待补充"} />
            </Panel>
          </div>

          <Panel icon={BusFront} eyebrow="NTU Commute" title="交通与通勤">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric icon={BusFront} label={listing.ntu_commute?.is_estimated ? "公共交通到 NTU（估算）" : "公交到 NTU"} value={minutesValue(listing.ntu_commute?.ntu_bus_minutes)} />
              <Metric icon={Clock3} label={listing.ntu_commute?.is_estimated ? "驾车到 NTU（估算）" : "驾车到 NTU"} value={minutesValue(listing.ntu_commute?.ntu_drive_minutes)} />
              <Metric icon={MapPinned} label="距 NTU 直线" value={distanceValue(listing.ntu_commute?.ntu_straight_distance_km)} />
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {listing.ntu_commute?.is_estimated
                ? `通勤路线缓存尚未完成，暂以 ${listing.ntu_commute.estimate_basis ?? "附近 MRT"} 作为起点估算时间；实际时间会受房源到地铁站距离、换乘和高峰交通影响。`
                : "通勤时间基于邮编与路线缓存估算，实际时间会受出发点、换乘和高峰交通影响。"}
            </p>
          </Panel>

          <Panel icon={ShieldCheck} eyebrow="House Rules" title="居住规则">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <DataRow label="煮饭" value={policyLabel(listing.cooking_policy)} />
              <DataRow label="可报地址" value={booleanLabel(listing.registration_allowed, "可以", "不可以")} />
              <DataRow label="访客" value={policyLabel(listing.visitors_policy)} />
              <DataRow label="吸烟" value={policyLabel(listing.smoking_policy)} />
              <DataRow label="宠物" value={policyLabel(listing.pets_policy)} />
              <DataRow label="性别偏好" value={genderLabel(listing.gender_preference)} />
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted">适合人群</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tenantPreferences.length > 0
                  ? tenantPreferences.map((item) => <Badge key={item}>{tenantLabels[item] ?? item}</Badge>)
                  : <Badge>待补充</Badge>}
              </div>
            </div>
          </Panel>

          <Panel icon={CookingPot} eyebrow="Facilities" title="设施使用">
            <FacilityGroup title="可使用" items={availableFacilities} icon={Check} tone="success" />
            <FacilityGroup title="限制使用" items={restrictedFacilities} icon={Info} tone="warning" />
            <FacilityGroup title="不可使用" items={unavailableFacilities} icon={X} tone="neutral" />
            {facilities.length === 0 ? <p className="text-sm text-muted">设施信息待补充。</p> : null}
          </Panel>

          {canShowNearby ? (
            <Panel icon={MapPinned} eyebrow="Nearby" title="周边生活">
              {nearbyGroups.length > 0 ? (
                <div className="space-y-5">
                  {nearbyGroups.map((group) => (
                    <div key={group.place_type}>
                      <div className="mb-2 text-xs font-bold text-muted">{nearbyPlaceLabels[group.place_type] ?? group.place_type}</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.places.map((place) => (
                          <div key={`${place.place_type}-${place.name}`} className="rounded-xl border border-line bg-slate-50/70 p-3.5">
                            <div className="font-semibold text-ink">{place.name}</div>
                            <div className="mt-1 text-xs text-muted">{place.display_note ?? `${place.distance_meters}m · 步行约 ${place.walking_minutes} 分钟`}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted">周边餐饮、超市与交通信息正在补充。</p>}
            </Panel>
          ) : null}

        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <section className="card overflow-hidden">
            <div className="bg-slate-950 px-5 py-5 text-white">
              <div className="flex items-center gap-2 text-sm font-bold"><MessageCircle className="h-4 w-4 text-teal-300" /> 联系方式 / 获取看房信息</div>
              <p className="mt-2 text-xs leading-5 text-slate-400">建议说明入住人数、学校或职业、入住日期与预计租期。</p>
            </div>
            <div className="p-5">
              {query.error === "enquiry_role" ? (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  当前账号不是租客角色，暂时不能发送站内咨询。
                </div>
              ) : null}
              {isCandidate ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                    这是维界整理的网络候选信息，尚未完成屋主身份与房源真实性核验。请勿在核验前支付订金。
                  </div>
                  {listing.source_url ? (
                    <a className="btn-primary w-full" href={listing.source_url} target="_blank" rel="noreferrer">
                      查看原始来源
                    </a>
                  ) : (
                    <div className="rounded-xl bg-slate-50 p-4 text-sm text-muted">原始来源链接暂不可用。</div>
                  )}
                </div>
              ) : profile ? (
                <form action={createEnquiry} className="space-y-3">
                  <input type="hidden" name="listing_id" value={listing.id} />
                  <input type="hidden" name="listing_path" value={listingHref} />
                  <textarea name="message" rows={4} required placeholder="你好，我是 NTU 学生，计划两人入住，希望预约看房……" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" name="move_in_date" aria-label="计划入住日期" />
                    <input type="number" min="1" name="lease_duration_months" placeholder="租期（月）" />
                  </div>
                  <input type="number" min="1" name="occupants_count" placeholder="入住人数" defaultValue={1} />
                  <button className="btn-primary w-full" type="submit">发送站内咨询</button>
                </form>
              ) : (
                <div className="rounded-xl border border-line bg-slate-50 p-4 text-sm leading-6 text-muted">
                  登录后可以发送咨询，并根据房源设置获取联系方式或租房群对接。
                  <Link className="btn-primary mt-4 w-full" href={`/auth/login?next=${listingHref}&reason=enquiry`}>
                    登录后咨询
                  </Link>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {canShowContact && listing.phone ? <a className="btn-secondary w-full" href={`tel:${listing.phone}`}>电话联系：{listing.phone}</a> : null}
                {canShowContact && listing.wechat ? <div className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">微信：<span className="font-bold">{listing.wechat}</span></div> : null}
                {!isCandidate && !canShowContact ? <p className="text-xs leading-5 text-muted">联系方式受隐私设置保护，请通过站内咨询完成初步核验。</p> : null}
              </div>
              <div className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">
                信息仅供参考。看房、签约或付款前，请核验屋主身份、房屋状况与完整租约。
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function safeRentReturnHref(value: string | string[] | undefined) {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/rent";

  try {
    const url = new URL(raw, "https://weijie.local");
    return url.origin === "https://weijie.local" && url.pathname === "/rent"
      ? `${url.pathname}${url.search}`
      : "/rent";
  } catch {
    return "/rent";
  }
}

function Panel({
  icon: Icon,
  eyebrow,
  title,
  children
}: {
  icon: typeof Home;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-brand"><Icon className="h-5 w-5" /></span>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{eyebrow}</div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function DataRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className={strong ? "font-bold text-brand" : "text-right font-semibold text-ink"}>{value}</span>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BusFront; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4">
      <Icon className="h-5 w-5 text-brand" />
      <div className="mt-3 text-xs text-muted">{label}</div>
      <div className="mt-1 font-bold text-ink">{value}</div>
    </div>
  );
}

function FacilityGroup({
  title,
  items,
  icon: Icon,
  tone
}: {
  title: string;
  items: { facility_name: string; note: string | null }[];
  icon: typeof Check;
  tone: "success" | "warning" | "neutral";
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 text-xs font-bold text-muted">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.facility_name} tone={tone}>
            <Icon className="mr-1 h-3 w-3" />
            {facilityLabels[item.facility_name as keyof typeof facilityLabels] ?? item.facility_name}
            {item.note ? ` · ${item.note}` : ""}
          </Badge>
        ))}
      </div>
    </div>
  );
}

const nearbyPlaceLabels: Record<string, string> = {
  mrt: "MRT",
  bus_stop: "巴士站",
  bus_terminal: "巴士总站",
  food_court: "熟食中心",
  supermarket: "超市",
  mall: "商场",
  school: "学校",
  park: "公园"
};

const nearbyPlaceOrder = ["mrt", "bus_stop", "bus_terminal", "food_court", "supermarket", "mall", "school", "park"];

function groupNearbyPlaces(
  places: { place_type: string; name: string; distance_meters: number; walking_minutes: number; display_note?: string }[]
) {
  const grouped = new Map<string, typeof places>();
  for (const place of places) {
    const group = grouped.get(place.place_type) ?? [];
    group.push(place);
    grouped.set(place.place_type, group);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => nearbyPlaceSortRank(left) - nearbyPlaceSortRank(right))
    .map(([place_type, group]) => ({
      place_type,
      places: [...group].sort((left, right) => left.distance_meters - right.distance_meters)
    }));
}

function nearbyPlaceSortRank(place_type: string) {
  const index = nearbyPlaceOrder.indexOf(place_type);
  return index >= 0 ? index : nearbyPlaceOrder.length;
}

function getReasons(listing: NonNullable<Awaited<ReturnType<typeof getListingDetail>>>) {
  const reasons: string[] = [];
  if ((listing.ntu_commute?.ntu_bus_minutes ?? Infinity) <= 45) reasons.push("NTU 通勤友好");
  if (listing.registration_allowed) reasons.push("支持报地址");
  if (listing.landlord_staying === false) reasons.push("无屋主同住");
  if (listing.cooking_policy === "full" || listing.cooking_policy === "light") reasons.push("支持煮饭");
  if (listing.bathroom_shared_with_count != null && listing.bathroom_shared_with_count <= 2) reasons.push("共浴人数较少");
  return reasons.length > 0 ? reasons : ["结构化信息持续补充"];
}

function policyLabel(value: string | null) {
  return value ? policyLabels[value] ?? value : "待补充";
}

function numberValue(value: number | null | undefined, unit: string) {
  return value == null ? "待补充" : `${value} ${unit}`;
}

function minutesValue(value: number | null | undefined) {
  return value == null ? "待计算" : `约 ${value} 分钟`;
}

function distanceValue(value: number | null | undefined) {
  return value == null ? "待计算" : `约 ${value.toFixed(1).replace(/\.0$/, "")} km`;
}

function genderLabel(value: string | null) {
  if (value === "any") return "不限";
  if (value === "male") return "男性";
  if (value === "female") return "女性";
  return value || "待补充";
}

function booleanLabel(value: boolean | null | undefined, trueLabel = "是", falseLabel = "否") {
  if (value == null) return "待补充";
  return value ? trueLabel : falseLabel;
}
