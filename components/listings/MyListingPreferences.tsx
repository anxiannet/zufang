"use client";

import Link from "next/link";
import { Bookmark, Clock3, Heart, Home, ThumbsDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ListingCard } from "@/components/listings/ListingCard";
import { useListingPreferences } from "@/components/listings/useListingPreferences";
import type { ListingCard as ListingCardValue } from "@/lib/types";
import {
  apply_cloud_listing_preferences,
  read_listing_preference_store,
  submit_listing_preference_silently,
  write_listing_preference_store,
  type CloudListingPreference,
  type ListingPreferenceStatus
} from "@/lib/listingPreferences";

type PreferenceTab = ListingPreferenceStatus;

const tabs: Array<{ value: PreferenceTab; label: string }> = [
  { value: "favorite", label: "收藏" },
  { value: "contact_later", label: "稍后联系" },
  { value: "rented", label: "已租" },
  { value: "disliked", label: "不喜欢" }
];

export function MyListingPreferences() {
  const [active_tab, set_active_tab] = useState<PreferenceTab>("favorite");
  const [stats_by_key, set_stats_by_key] = useState<Record<string, NonNullable<ListingCardValue["user_preference_stats"]>>>({});
  const cloud_sync_started = useRef(false);
  const { preferences, is_hydrated } = useListingPreferences();
  const preference_keys = useMemo(() => preferences.map(([key]) => key), [preferences]);
  const preference_key_signature = preference_keys.join("\n");
  const visible_preferences = preferences.filter(([, preference]) => preference.status === active_tab);
  const count_for = (tab: PreferenceTab) => preferences.filter(([, preference]) => preference.status === tab).length;

  useEffect(() => {
    if (!is_hydrated || cloud_sync_started.current) return;
    cloud_sync_started.current = true;
    const controller = new AbortController();

    void fetch("/api/listing-preferences/mine", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    })
      .then(async (response) => response.ok
        ? response.json() as Promise<{ preferences?: CloudListingPreference[] }>
        : null)
      .then((payload) => {
        if (!Array.isArray(payload?.preferences)) return;
        const local_store = read_listing_preference_store();
        const merged_store = apply_cloud_listing_preferences(local_store, payload.preferences);
        if (JSON.stringify(merged_store) !== JSON.stringify(local_store)) {
          write_listing_preference_store(merged_store);
        }
        for (const preference of Object.values(merged_store.items)) {
          submit_listing_preference_silently(
            preference.listing,
            preference.status,
            preference.updated_at
          );
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [is_hydrated]);

  useEffect(() => {
    if (!is_hydrated || preference_keys.length === 0) {
      set_stats_by_key({});
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    preference_keys.forEach((key) => params.append("listing_key", key));
    void fetch(`/api/listing-preferences?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => response.ok
        ? response.json() as Promise<{ stats?: Record<string, NonNullable<ListingCardValue["user_preference_stats"]>> }>
        : null)
      .then((payload) => {
        if (payload?.stats) set_stats_by_key(payload.stats);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [is_hydrated, preference_key_signature]);

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="rounded-3xl border border-line bg-gradient-to-br from-white to-teal-50/60 p-6 sm:p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
          <Bookmark className="h-5 w-5" />
        </div>
        <div className="eyebrow mt-5">Saved listings</div>
        <h1 className="section-title mt-2">我的房源列表</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          匿名使用时状态保存在当前浏览器；登录后自动同步，可跨设备查看。不喜欢的房源不会再出现在首页推荐中，只会保留在“不喜欢”列表。
        </p>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="房源状态">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active_tab === tab.value}
            onClick={() => set_active_tab(tab.value)}
            className={active_tab === tab.value
              ? "shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white"
              : "shrink-0 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-brand hover:text-brand"}
          >
            {tab.label} <span className="ml-1 opacity-75">{count_for(tab.value)}</span>
          </button>
        ))}
      </div>

      {!is_hydrated ? (
        <div className="mt-8 rounded-2xl border border-line bg-white p-8 text-center text-sm text-muted">正在读取本地列表…</div>
      ) : visible_preferences.length > 0 ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible_preferences.map(([key, preference]) => (
            <ListingCard
              key={key}
              listing={{ ...preference.listing, user_preference_stats: stats_by_key[key] }}
              return_to="/my-listings"
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <EmptyIcon tab={active_tab} />
          <h2 className="mt-4 text-lg font-bold text-ink">这个列表还是空的</h2>
          <p className="mt-2 text-sm text-muted">浏览房源时可随时标记，匿名使用也会保存在当前设备。</p>
          <Link href="/rent" className="btn-primary mt-5">浏览房源</Link>
        </div>
      )}
    </div>
  );
}

function EmptyIcon({ tab }: { tab: PreferenceTab }) {
  const Icon = tab === "favorite"
    ? Heart
    : tab === "contact_later"
      ? Clock3
      : tab === "disliked"
        ? ThumbsDown
        : Home;
  return <Icon className="mx-auto h-8 w-8 text-slate-300" />;
}
