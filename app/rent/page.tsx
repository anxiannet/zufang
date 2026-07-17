import { redirect } from "next/navigation";
import Link from "next/link";
import { rejectHomepageListing } from "@/actions/admin";
import { findListingId, searchListings } from "@/actions/listings";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { ListingCard } from "@/components/ListingCard";
import { ListingPreferenceVisibility } from "@/components/listings/ListingPreferenceVisibility";
import { SearchFilters } from "@/components/SearchFilters";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentProfile } from "@/lib/auth";
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

  const [searchResult, profile] = await Promise.all([
    searchListings(params),
    getCurrentProfile()
  ]);
  const { listings, total, page, page_size, total_pages } = searchResult;
  const isAdmin = profile?.role === "admin";
  const currentListHref = paginationHref(params, page);

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
            <p className="mt-1 text-sm text-muted">仅展示最近 1 个月内发布或更新的房源</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <ShieldCheck className="h-4 w-4 text-brand" />
            共找到 <span className="font-bold text-ink">{total}</span> 套
            {total_pages > 1 ? <span>· 第 {page}/{total_pages} 页</span> : null}
          </div>
        </div>
        {listings.length > 0 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingPreferenceVisibility key={listing.id} listing={listing}>
                  <div className="flex min-w-0 flex-col gap-2">
                    <ListingCard listing={listing} return_to={currentListHref} />
                    {isAdmin ? (
                      <form action={rejectHomepageListing} className="flex">
                        <input type="hidden" name="listing_id" value={listing.id} />
                        <input type="hidden" name="card_source" value={listing.card_source ?? "official"} />
                        <ConfirmSubmitButton
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100"
                          confirmMessage={`确认拒绝房源「${listing.title}」？拒绝后将立即从首页移除。`}
                          pendingText="正在拒绝..."
                        >
                          拒绝此房源
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </ListingPreferenceVisibility>
              ))}
            </div>
            <Pagination
              page={page}
              page_size={page_size}
              total={total}
              total_pages={total_pages}
              search_params={params}
            />
          </>
        ) : <EmptyState />}
      </div>
    </>
  );
}

function Pagination({
  page,
  page_size,
  total,
  total_pages,
  search_params
}: {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  search_params: Record<string, string | string[] | undefined>;
}) {
  if (total_pages <= 1) return null;

  const start = (page - 1) * page_size + 1;
  const end = Math.min(page * page_size, total);

  return (
    <nav className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-line bg-white p-4 sm:flex-row" aria-label="房源分页">
      <div className="text-sm text-muted">显示第 {start}–{end} 套，共 {total} 套</div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <PaginationLink disabled={page === 1} href={paginationHref(search_params, page - 1)} label="上一页" />
        {paginationItems(page, total_pages).map((item) => typeof item === "number" ? (
          <Link
            key={item}
            href={paginationHref(search_params, item)}
            aria-current={item === page ? "page" : undefined}
            className={item === page
              ? "flex h-10 min-w-10 items-center justify-center rounded-xl bg-brand px-3 text-sm font-bold text-white"
              : "flex h-10 min-w-10 items-center justify-center rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-brand hover:text-brand"}
          >
            {item}
          </Link>
        ) : <span key={item} className="px-1 text-muted">…</span>)}
        <PaginationLink disabled={page === total_pages} href={paginationHref(search_params, page + 1)} label="下一页" />
      </div>
    </nav>
  );
}

function PaginationLink({ disabled, href, label }: { disabled: boolean; href: string; label: string }) {
  if (disabled) {
    return <span className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-300">{label}</span>;
  }
  return <Link href={href} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand">{label}</Link>;
}

function paginationHref(search_params: Record<string, string | string[] | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search_params)) {
    if (key === "page" || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/rent?${query}` : "/rent";
}

function paginationItems(page: number, total_pages: number): Array<number | string> {
  const pages = [...new Set([1, page - 1, page, page + 1, total_pages])]
    .filter((item) => item >= 1 && item <= total_pages)
    .sort((left, right) => left - right);
  const items: Array<number | string> = [];
  for (const current of pages) {
    const previous = items.at(-1);
    if (typeof previous === "number" && current - previous > 1) items.push(`ellipsis-${previous}`);
    items.push(current);
  }
  return items;
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
