import type { Metadata } from "next";
import Link from "next/link";
import { Check, ClipboardCheck, Eye, ShieldCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getListingDetail } from "@/actions/listings";
import { getCurrentProfile } from "@/lib/auth";

export const metadata: Metadata = {
  title: "房源已提交"
};

const statusItems = [
  {
    title: "已收到房源信息",
    description: "你填写的房源资料和照片已安全提交。",
    icon: ClipboardCheck,
    active: true
  },
  {
    title: "待平台整理展示内容",
    description: "平台会检查真实性，并整理成租客更容易了解的房源页。",
    icon: ShieldCheck,
    active: false
  },
  {
    title: "通过后发布给租客",
    description: "整理完成后，房源会进入租客可查看的房源列表。",
    icon: Eye,
    active: false
  }
];

export default async function ListingSubmittedPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect(`/auth/login?next=/landlord/listings/${id}/submitted`);
  }

  if (!["landlord", "agent", "admin"].includes(profile.role)) {
    redirect("/");
  }

  const listing = await getListingDetail(id);
  if (!listing || (profile.role !== "admin" && listing.owner_id !== profile.id)) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <section className="card overflow-hidden">
        <div className="border-b border-line bg-gradient-to-br from-teal-50 via-white to-emerald-50 px-5 py-8 text-center sm:px-8 sm:py-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-md">
            <Check className="h-7 w-7" strokeWidth={3} />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink sm:text-3xl">房源已提交</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            平台已收到你的房源信息，会先检查真实性和展示效果，通过后发布给租客查看。
          </p>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <div className="grid gap-3 md:grid-cols-3">
            {statusItems.map((item, index) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className={`rounded-2xl border p-4 ${
                    item.active ? "border-teal-200 bg-teal-50/70" : "border-line bg-slate-50/70"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      item.active ? "bg-brand text-white" : "bg-white text-muted ring-1 ring-line"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-bold text-muted">步骤 {index + 1}</span>
                  </div>
                  <h2 className="mt-4 font-bold text-ink">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            联系方式默认不公开，平台会按你选择的可见范围展示。
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:flex-wrap">
            <Link href={`/rent/${listing.id}`} className="btn-primary">
              查看房源详情
            </Link>
            <Link href="/landlord/listings" className="btn-secondary">
              返回我的房源
            </Link>
            <Link href="/landlord/listings/new" className="btn-secondary">
              继续发布另一套
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
