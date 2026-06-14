import { Bath, CalendarDays, MapPin, Users } from "lucide-react";
import type { ListingDetail } from "@/lib/types";
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

export function ListingDetailHero({ listing }: { listing: ListingDetail }) {
  const images = [...(listing.listing_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const address = [
    listing.geocoding?.building,
    listing.geocoding?.block ? `Blk ${listing.geocoding.block}` : null,
    listing.geocoding?.road_name,
    listing.postal_code
  ].filter(Boolean).join(" · ");

  return (
    <section>
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <ImageFrame image={images[0]} title={listing.title} priority className="aspect-[16/10] lg:aspect-[16/9]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <ImageFrame image={images[1]} title={listing.title} className="aspect-square lg:aspect-auto" />
          <ImageFrame image={images[2]} title={listing.title} className="aspect-square lg:aspect-auto" />
        </div>
      </div>

      <div className="card relative mx-2 -mt-5 grid gap-6 p-5 sm:mx-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">平台房源</Badge>
            {listing.is_owner_direct ? <Badge tone="brand">屋主直租</Badge> : null}
            <Badge>房源 #{listing.listing_no ? String(listing.listing_no).padStart(5, "0") : "待编号"}</Badge>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{listing.title}</h1>
          <div className="mt-3 flex items-start gap-2 text-sm text-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>{address || "具体地点待补充"}</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryItem icon={CalendarDays} label="可入住" value={listing.available_note || formatDate(listing.available_from)} />
            <SummaryItem icon={Users} label="当前共住" value={countLabel(listing.current_occupants_count)} />
            <SummaryItem icon={Bath} label="共用浴室" value={countLabel(listing.bathroom_shared_with_count)} />
            <SummaryItem icon={Users} label="最多入住" value={`${listing.max_occupants} 人`} />
          </div>
        </div>
        <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white lg:min-w-56">
          <div className="text-xs font-semibold uppercase tracking-wider text-teal-300">每月租金</div>
          <div className="mt-1 text-3xl font-bold">${listing.rent_amount.toLocaleString("en-SG")}</div>
          <div className="mt-1 text-xs text-slate-400">SGD / 月 · {listing.room_type ? roomLabels[listing.room_type] ?? listing.room_type : "整套房源"}</div>
        </div>
      </div>
    </section>
  );
}

function ImageFrame({
  image,
  title,
  priority = false,
  className
}: {
  image?: { image_url: string; caption: string | null };
  title: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`subtle-grid relative min-h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-teal-50 to-slate-100 ${className ?? ""}`}>
      <ListingImage
        src={image?.image_url}
        alt={image?.caption || title}
        priority={priority}
        sizes="(max-width: 1024px) 100vw, 66vw"
      />
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-1 text-sm font-bold text-ink">{value}</div>
    </div>
  );
}

function countLabel(value: number | null) {
  return value == null ? "待补充" : `${value} 人`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "待补充";
  return new Intl.DateTimeFormat("zh-SG", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
