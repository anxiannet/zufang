"use client";

import { BadgeCheck, Clock3, Heart, ThumbsDown } from "lucide-react";
import { useListingPreferences } from "@/components/listings/useListingPreferences";
import { resolve_listing_preference_stats } from "@/lib/listingPreferenceDisplay";
import type { ListingCard } from "@/lib/types";

const preference_items = [
  { status: "favorite", label: "收藏", icon: Heart, class_name: "text-rose-600" },
  { status: "contact_later", label: "稍后联系", icon: Clock3, class_name: "text-sky-600" },
  { status: "rented", label: "反馈已租", icon: BadgeCheck, class_name: "text-emerald-700" },
  { status: "disliked", label: "不喜欢", icon: ThumbsDown, class_name: "text-slate-600" }
] as const;

export function PublicListingPreferenceStats({
  listing,
  compact = false
}: {
  listing: ListingCard;
  compact?: boolean;
}) {
  const { get_listing_preference, is_hydrated } = useListingPreferences();
  const server_stats = listing.user_preference_stats;
  const local_status = is_hydrated ? get_listing_preference(listing)?.status ?? null : null;
  const { stats, is_local_fallback } = resolve_listing_preference_stats(server_stats, local_status);

  if (!stats || stats.total_users === 0) return null;

  if (compact) {
    const visible_items = preference_items.filter(({ status }) => stats.counts[status] > 0);
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-full bg-slate-950/75 px-2.5 py-1.5 text-xs text-white shadow-sm backdrop-blur"
        aria-label={`共 ${stats.total_users} 位用户标记过这套房源`}
      >
        {visible_items.map(({ status, label, icon: Icon, class_name }) => (
          <span
            key={status}
            className="inline-flex items-center gap-1 font-bold"
            title={`${label}：${stats.counts[status]} 人`}
            aria-label={`${label} ${stats.counts[status]} 人`}
          >
            <Icon className={`h-4 w-4 ${class_name}`} aria-hidden="true" />
            {stats.counts[status]}
          </span>
        ))}
      </div>
    );
  }

  return (
    <section className="card mt-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-ink">用户房源标记</h2>
        <span className="text-xs text-muted">{stats.total_users} 位用户参与 · 每人只计一次</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {preference_items.map(({ status, label, icon: Icon, class_name }) => (
          <div key={status} className="rounded-xl border border-line bg-slate-50 p-3">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${class_name}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </div>
            <div className="mt-2 text-lg font-bold text-ink">{stats.counts[status]} 人</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        图标依次表示收藏、准备稍后联系、用户反馈可能已租和不喜欢；这些是匿名用户反馈，不代表平台已经核实。
        {is_local_fallback ? " 当前数字来自本设备，后台统计同步后会自动使用汇总数据。" : ""}
      </p>
      {stats.counts.rented > 0 ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          已有 {stats.counts.rented} 位用户反馈可能已租，建议联系前先向发布者确认房源状态。
        </p>
      ) : null}
    </section>
  );
}
