import { redirect } from "next/navigation";
import { findListingId, searchListings } from "@/actions/listings";
import { ListingCard } from "@/components/ListingCard";
import { SearchFilters } from "@/components/SearchFilters";
import { EmptyState } from "@/components/ui/EmptyState";
import { BusFront, Database, Home, RefreshCw, ShieldCheck } from "lucide-react";

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
    <>
      <section className="relative overflow-hidden border-b border-line bg-white">
        <div className="subtle-grid absolute inset-0 opacity-70" />
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-teal-200/25 blur-3xl" />
        <div className="container-page relative py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <div className="eyebrow">Singapore · NTU Rental</div>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.035em] text-ink sm:text-5xl lg:text-6xl">
              新加坡 NTU 周边
              <span className="block text-brand">真实房源数据库</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              按通勤、价格、房型、入住条件快速筛选，帮学生和屋主更高效匹配。
            </p>
          </div>
          <div className="mt-8 max-w-5xl">
            <SearchFilters searchParams={params} />
          </div>
          <div className="mt-6 grid max-w-5xl grid-cols-2 gap-3 lg:grid-cols-4">
            <TrustItem icon={Database} title="房源结构化整理" />
            <TrustItem icon={BusFront} title="NTU 通勤参考" />
            <TrustItem icon={Home} title="屋主直租优先" />
            <TrustItem icon={RefreshCw} title="房源持续更新" />
          </div>
        </div>
      </section>

      <div className="container-page py-8 sm:py-10">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow">Available Listings</div>
            <h2 className="section-title mt-1">当前可查看房源</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <ShieldCheck className="h-4 w-4 text-brand" />
            共找到 <span className="font-bold text-ink">{listings.length}</span> 套
          </div>
        </div>
        {listings.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
          </div>
        ) : <EmptyState />}
      </div>
    </>
  );
}

function TrustItem({ icon: Icon, title }: { icon: typeof Database; title: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/80 bg-white/75 px-3 py-3 text-xs font-semibold text-ink shadow-sm backdrop-blur sm:text-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-brand">
        <Icon className="h-4 w-4" />
      </span>
      {title}
    </div>
  );
}
