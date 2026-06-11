import { redirect } from "next/navigation";
import { findListingId, searchListings } from "@/actions/listings";
import { ListingCard } from "@/components/ListingCard";
import { SearchFilters } from "@/components/SearchFilters";

export default async function RentPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const keyword = typeof params.q === "string" ? params.q.trim() : "";
  if (keyword) {
    const listingId = await findListingId(keyword);
    if (listingId) redirect(`/rent/${listingId}`);
  }

  const listings = await searchListings(params);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">屋主 / 管理员发布房源</h1>
        <p className="mt-2 text-sm text-muted">搜索结构化手动房源；地址来自邮编地理编码，通勤与最近 MRT 为独立计算数据。</p>
      </div>
      <SearchFilters searchParams={params} />
      <div className="text-sm text-muted">找到 {listings.length} 套房源</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
      </div>
      {listings.length === 0 ? <div className="card p-8 text-center text-muted">暂无符合条件的手动发布房源。</div> : null}
    </div>
  );
}
