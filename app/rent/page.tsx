import { ListingCard } from "@/components/ListingCard";
import { SearchFilters } from "@/components/SearchFilters";
import { searchListings } from "@/actions/listings";

export default async function RentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const listings = await searchListings(params);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">新加坡华人租房</h1>
        <p className="max-w-2xl text-sm text-muted">优先看租金、位置、入住日期、共用浴室人数和是否屋主同住。未登录用户可浏览已发布房源。</p>
      </section>
      <SearchFilters searchParams={params} />
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">搜索结果</h2>
        <span className="text-sm text-muted">{listings.length} 套房源</span>
      </div>
      {listings.length === 0 ? (
        <div className="card p-8 text-center text-muted">暂时没有匹配房源，试试放宽价格或地区条件。</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
