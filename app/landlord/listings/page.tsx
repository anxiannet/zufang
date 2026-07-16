import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyListings } from "@/actions/listings";
import { getCurrentProfile } from "@/lib/auth";
import { CalendarDays, MapPin, Plus, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { getListingHref } from "@/lib/listingUrl";

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
    <div className="container-page max-w-6xl space-y-5 py-8 sm:py-10">
      <PageHeader
        eyebrow="Landlord Workspace"
        title="我的房源"
        description="查看已提交房源、平台整理进度和当前发布状态。"
        actions={<Link href="/landlord/listings/new" className="btn-primary"><Plus className="h-4 w-4" /> 发布新房源</Link>}
      />

      {listings.length > 0 ? (
        <div className="grid gap-3">
          {listings.map((listing) => (
            <article key={listing.id} className="card flex flex-col gap-4 p-5 transition hover:border-teal-100 hover:shadow-lift sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-ink">{listing.title}</h2>
                  <Badge tone={listing.status === "published" ? "success" : listing.status === "rejected" ? "warning" : "brand"}>{statusLabels[listing.status] ?? listing.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
                  <span className="font-bold text-ink">${listing.rent_amount.toLocaleString("en-SG")} / 月</span>
                  <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {listing.postal_code || "邮编待补充"}</span>
                  <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" /> {formatDate(listing.available_from)}</span>
                </div>
              </div>
              <Link href={getListingHref(listing)} className="btn-secondary shrink-0">查看房源详情</Link>
            </article>
          ))}
        </div>
      ) : (
        <section className="card p-10 text-center">
          <SearchX className="mx-auto h-9 w-9 text-brand" />
          <h2 className="mt-4 text-lg font-bold text-ink">还没有发布房源</h2>
          <p className="mt-2 text-sm text-muted">填写核心信息后，平台会帮你整理展示内容。</p>
          <Link href="/landlord/listings/new" className="btn-primary mt-5">发布第一套房源</Link>
        </section>
      )}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "入住日期待补充";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "入住日期待补充"
    : `${new Intl.DateTimeFormat("zh-SG", { year: "numeric", month: "short", day: "numeric" }).format(date)} 可入住`;
}
