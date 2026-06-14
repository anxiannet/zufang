import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyListings } from "@/actions/listings";
import { getCurrentProfile } from "@/lib/auth";

export const metadata: Metadata = {
  title: "我的房源"
};

const statusLabels: Record<string, string> = {
  draft: "草稿",
  pending_review: "待平台整理",
  published: "已发布",
  rejected: "需修改",
  rented: "已出租"
};

export default async function LandlordListingsPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/login?next=/landlord/listings");
  }

  if (!["landlord", "agent", "admin"].includes(profile.role)) {
    redirect("/");
  }

  const listings = await getMyListings();

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">我的房源</h1>
          <p className="mt-2 text-sm text-muted">查看你提交的房源和当前处理状态。</p>
        </div>
        <Link href="/landlord/listings/new" className="btn-primary">发布新房源</Link>
      </div>

      {listings.length > 0 ? (
        <div className="grid gap-3">
          {listings.map((listing) => (
            <article key={listing.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-ink">{listing.title}</h2>
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-brand">
                    {statusLabels[listing.status] ?? listing.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {listing.listing_no ? `房源编号 ${listing.listing_no} · ` : ""}
                  邮编 {listing.postal_code} · ${listing.rent_amount}/月 · {listing.available_from} 可入住
                </p>
              </div>
              <Link href={`/rent/${listing.id}`} className="btn-secondary shrink-0">查看房源详情</Link>
            </article>
          ))}
        </div>
      ) : (
        <section className="card p-8 text-center">
          <h2 className="text-lg font-bold text-ink">还没有发布房源</h2>
          <p className="mt-2 text-sm text-muted">填写核心信息后，平台会帮你整理展示内容。</p>
          <Link href="/landlord/listings/new" className="btn-primary mt-5">发布第一套房源</Link>
        </section>
      )}
    </div>
  );
}
