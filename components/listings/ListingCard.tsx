import Link from "next/link";
import {
  ArrowUpRight,
  Bath,
  BusFront,
  CalendarDays,
  Home,
  MapPin,
  Users
} from "lucide-react";
import type { ListingCard as ListingCardType } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { ListingImage } from "@/components/listings/ListingImage";

const roomLabels: Record<string, string> = {
  common_room: "普通房",
  master_room: "主人房",
  single_room: "单人间",
  partition_room: "隔间",
  maid_room: "佣人房",
  studio: "Studio 公寓"
};

export function ListingCard({ listing }: { listing: ListingCardType }) {
  const image = [...(listing.listing_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url;
  const isCandidate = listing.card_source === "candidate";
  const href = `/rent/${listing.id}`;
  const visibleNo = isCandidate
    ? listing.candidate_no ? `C${String(listing.candidate_no).padStart(4, "0")}` : "待核验"
    : listing.listing_no ? String(listing.listing_no).padStart(5, "0") : "待编号";
  const address = formatAddress(listing);
  const commute = formatCommute(listing);
  const badges = getBadges(listing);

  const content = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-teal-50 to-slate-100">
        <ListingImage
          src={image}
          alt={listing.title}
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          external={isCandidate}
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <Badge tone={isCandidate ? "warning" : "success"}>
            {isCandidate ? "网络信息待核验" : "平台房源"}
          </Badge>
          <span className="rounded-full bg-slate-950/75 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            #{visibleNo}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight text-ink">${listing.rent_amount.toLocaleString("en-SG")}</span>
              <span className="text-xs font-medium text-muted">SGD / 月</span>
            </div>
            <h2 className="mt-2 line-clamp-2 text-base font-bold leading-6 text-ink">{listing.title}</h2>
          </div>
          <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-brand" />
        </div>

        <div className="mt-3 flex items-start gap-2 text-sm text-muted">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span className="line-clamp-2">{address}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <InfoItem icon={Home} label="房型" value={listing.room_type ? roomLabels[listing.room_type] ?? listing.room_type : "整套"} />
          <InfoItem icon={CalendarDays} label="入住" value={listing.available_note || formatDate(listing.available_from)} />
          <InfoItem icon={Users} label="当前共住" value={countLabel(listing.current_occupants_count)} />
          <InfoItem icon={Bath} label="共用浴室" value={countLabel(listing.bathroom_shared_with_count)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
          {badges.length === 0 ? <Badge>更多条件待补充</Badge> : null}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-brand">
              <BusFront className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">NTU 通勤参考</div>
              <div className="text-sm font-bold text-ink">{commute}</div>
            </div>
          </div>
          <span className="text-xs font-semibold text-brand">查看详情</span>
        </div>
      </div>
    </>
  );

  const className = "group card flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:border-teal-100 hover:shadow-lift";
  return <Link href={href} className={className}>{content}</Link>;
}

function InfoItem({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Home;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function getBadges(listing: ListingCardType) {
  const values: { label: string; tone: "brand" | "success" | "neutral" }[] = [];
  if ((listing.ntu_commute?.ntu_bus_minutes ?? Infinity) <= 45) values.push({ label: "NTU 通勤友好", tone: "brand" });
  if (listing.registration_allowed) values.push({ label: "可报地址", tone: "success" });
  if (listing.cooking_policy === "full") values.push({ label: "可煮", tone: "success" });
  if (listing.cooking_policy === "light") values.push({ label: "可小煮", tone: "neutral" });
  if (listing.landlord_staying === false) values.push({ label: "无屋主同住", tone: "neutral" });
  if (listing.available_from && new Date(`${listing.available_from}T00:00:00`).getTime() <= Date.now()) values.push({ label: "可尽快入住", tone: "brand" });
  return values.slice(0, 4);
}

function formatAddress(listing: ListingCardType) {
  const parts = [
    listing.geocoding?.building,
    listing.geocoding?.block ? `Blk ${listing.geocoding.block}` : null,
    listing.geocoding?.road_name
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  return listing.postal_code ? `新加坡 ${listing.postal_code}` : "具体地点待补充";
}

function formatCommute(listing: ListingCardType) {
  if (listing.ntu_commute?.ntu_bus_minutes != null) return `公交约 ${listing.ntu_commute.ntu_bus_minutes} 分钟`;
  if (listing.ntu_commute?.ntu_drive_minutes != null) return `驾车约 ${listing.ntu_commute.ntu_drive_minutes} 分钟`;
  if (listing.ntu_commute?.ntu_straight_distance_km != null) {
    return `直线约 ${listing.ntu_commute.ntu_straight_distance_km.toFixed(1).replace(/\.0$/, "")} km`;
  }
  return "正在补充";
}

function countLabel(value: number | null) {
  return value == null ? "待补充" : `${value} 人`;
}

function formatDate(value: string | null) {
  if (!value) return "待补充";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "待补充";
  return new Intl.DateTimeFormat("zh-SG", { month: "short", day: "numeric" }).format(date);
}
