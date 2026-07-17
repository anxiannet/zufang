"use client";

import { BadgeCheck, Clock3, Heart, ThumbsDown } from "lucide-react";
import clsx from "clsx";
import type { ListingCard } from "@/lib/types";
import type { ListingPreferenceStatus } from "@/lib/listingPreferences";
import { useListingPreferences } from "@/components/listings/useListingPreferences";

const actions: Array<{
  status: ListingPreferenceStatus;
  label: string;
  icon: typeof Heart;
  active_class: string;
}> = [
  { status: "favorite", label: "收藏", icon: Heart, active_class: "border-rose-200 bg-rose-50 text-rose-700" },
  { status: "contact_later", label: "稍后联系", icon: Clock3, active_class: "border-sky-200 bg-sky-50 text-sky-700" },
  { status: "rented", label: "已租", icon: BadgeCheck, active_class: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { status: "disliked", label: "不喜欢", icon: ThumbsDown, active_class: "border-slate-300 bg-slate-100 text-slate-800" }
];

export function ListingPreferenceActions({
  listing,
  compact = false
}: {
  listing: ListingCard;
  compact?: boolean;
}) {
  const { get_listing_preference, set_listing_status, is_hydrated } = useListingPreferences();
  const active_status = get_listing_preference(listing)?.status ?? null;

  return (
    <div className={clsx("grid grid-cols-2 gap-2 sm:grid-cols-4", compact ? "border-t border-line p-3" : "card mt-4 p-3 sm:p-4")}>
      {actions.map(({ status, label, icon: Icon, active_class }) => {
        const active = active_status === status;
        return (
          <button
            key={status}
            type="button"
            disabled={!is_hydrated}
            aria-pressed={active}
            onClick={() => set_listing_status(listing, active ? null : status)}
            className={clsx(
              "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition sm:text-sm",
              active ? active_class : "border-line bg-white text-slate-600 hover:border-teal-200 hover:text-brand",
              !is_hydrated && "cursor-wait opacity-60"
            )}
          >
            <Icon className={clsx("h-4 w-4", active && status === "favorite" && "fill-current")} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
