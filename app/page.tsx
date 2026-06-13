import Link from "next/link";
import { getHomeListings } from "@/actions/listings";
import { ListingCard } from "@/components/ListingCard";

export default async function HomePage() {
  const { officialListings, candidateListings } = await getHomeListings();

  return (
    <main className="container-page space-y-10 py-12">
      <section className="card mx-auto max-w-3xl p-8 text-center md:p-12">
        <p className="text-sm font-semibold text-brand">Singapore Rental Platform</p>
        <h1 className="mt-3 text-3xl font-bold text-ink md:text-4xl">NTU租房数据库</h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted">
          重点比较租金、地点、入住时间、共住人数、共用浴室人数、屋主是否同住和生活规则。
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/rent" className="btn-primary">浏览正式房源</Link>
          <Link href="/landlord/listings/new" className="btn-secondary">发布房源</Link>
        </div>
      </section>

      <HomeListingSection
        title="已发布正式房源"
        description="平台已发布、可直接查看完整资料的房源。"
        listings={officialListings}
        emptyText="暂时还没有已发布的正式房源。"
      />

      <HomeListingSection
        title="候选房源"
        description="从公开网络来源整理的候选信息。"
        listings={candidateListings}
        emptyText="暂时还没有可展示的候选房源。"
      />
    </main>
  );
}

function HomeListingSection({
  title,
  description,
  listings,
  emptyText
}: {
  title: string;
  description: string;
  listings: Awaited<ReturnType<typeof getHomeListings>>["officialListings"];
  emptyText: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <Link href="/rent" className="text-sm font-semibold text-brand hover:underline">查看全部</Link>
      </div>
      {listings.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
        </div>
      ) : (
        <div className="card p-8 text-center text-sm text-muted">{emptyText}</div>
      )}
    </section>
  );
}
