import Image from "next/image";
import Link from "next/link";
import type { ListingCard as ListingCardType } from "@/lib/types";

const roomLabels: Record<string, string> = {
  common_room: "普通房",
  master_room: "主人房",
  single_room: "单人间",
  partition_room: "单人间",
  studio: "Studio公寓"
};

export function ListingCard({ listing }: { listing: ListingCardType }) {
  const image = listing.listing_images?.sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url;
  const address = [listing.geocoding?.building, listing.geocoding?.block ? `Blk ${listing.geocoding.block}` : null, listing.geocoding?.road_name]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/rent/${listing.id}`} className="card block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-sm">
      <div className="relative aspect-[4/3] bg-gray-100">
        {image ? (
          <Image src={image} alt={listing.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">暂无图片</div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-brand">房源编号 #{listing.listing_no}</div>
            <h3 className="line-clamp-2 font-semibold text-ink">{listing.title}</h3>
            <p className="mt-1 text-sm text-muted">
              {address || `邮编 ${listing.postal_code}`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-brand">${listing.rent_amount}</div>
            <div className="text-xs text-muted">/月</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-ink">
          <span className="rounded bg-gray-50 px-2 py-1">{roomLabels[listing.room_type] ?? listing.room_type}</span>
          <span className="rounded bg-gray-50 px-2 py-1">{listing.available_from} 可住</span>
          <span className="rounded bg-gray-50 px-2 py-1">共浴 {listing.bathroom_shared_with_count ?? 0} 人</span>
          <span className="rounded bg-gray-50 px-2 py-1">已住 {listing.current_occupants_count ?? 0} 人</span>
          <span className="rounded bg-gray-50 px-2 py-1">{listing.cooking_policy === "full" ? "可大煮" : listing.cooking_policy === "light" ? "可小煮" : listing.cooking_policy === "no" ? "不可煮" : "煮饭未说明"}</span>
          <span className="rounded bg-gray-50 px-2 py-1">{listing.landlord_staying ? "屋主同住" : "无屋主同住"}</span>
        </div>
      </div>
    </Link>
  );
}
