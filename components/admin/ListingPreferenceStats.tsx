import type { ListingPreferenceStats as ListingPreferenceStatsValue } from "@/lib/listingPreferenceStats";

const status_labels = {
  favorite: "收藏",
  contact_later: "稍后联系",
  rented: "用户标记已租",
  disliked: "不喜欢"
} as const;

export function ListingPreferenceStats({ stats }: { stats: ListingPreferenceStatsValue }) {
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink">用户标记</h2>
        <div className="text-sm text-muted">共 {stats.total_users} 位匿名用户</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(status_labels).map(([status, label]) => (
          <div key={status} className="rounded-md border border-line bg-gray-50 px-3 py-2">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-1 text-xl font-bold text-ink">
              {stats.counts[status as keyof typeof status_labels]}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">同一匿名用户对同一房源只统计当前状态一次。</p>
    </section>
  );
}
