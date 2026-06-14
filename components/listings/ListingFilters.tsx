"use client";

import Link from "next/link";
import { ChevronDown, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { facilities, facilityLabels } from "@/lib/types";

export function ListingFilters({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const value = (key: string) => String(searchParams[key] ?? "");
  const selectedFacilities = Array.isArray(searchParams.facility)
    ? searchParams.facility.map(String)
    : searchParams.facility
      ? [String(searchParams.facility)]
      : [];
  const activeCount = Object.entries(searchParams).filter(([key, val]) => key !== "sort" && val && (Array.isArray(val) ? val.length > 0 : true)).length;
  const [expanded, setExpanded] = useState(activeCount > 0);

  return (
    <form className="card relative z-10 p-4 sm:p-5" action="/rent">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto]">
        <div>
          <label className="sr-only" htmlFor="q">搜索房源</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="q" name="q" defaultValue={value("q")} className="pl-10" placeholder="搜索房源编号、地区、MRT 或关键词" />
          </div>
        </div>
        <div>
          <label className="sr-only" htmlFor="location">地址或邮编</label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="location" name="location" defaultValue={value("location")} className="pl-10" placeholder="地址 / 邮编，例如 Jurong West" />
          </div>
        </div>
        <button className="btn-primary px-6" type="submit"><Search className="h-4 w-4" /> 搜索房源</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-ink hover:bg-slate-50"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <SlidersHorizontal className="h-4 w-4 text-brand" />
          更多筛选
          {activeCount > 0 ? <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{activeCount}</span> : null}
          <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-xs text-muted">排序</label>
          <select id="sort" name="sort" defaultValue={value("sort") || "latest"} className="min-h-10 w-auto py-2 text-xs">
            <option value="latest">最新更新</option>
            <option value="price_asc">租金低到高</option>
            <option value="available_soon">最早可入住</option>
            <option value="ntu_commute">NTU 通勤优先</option>
          </select>
          {activeCount > 0 ? (
            <Link href="/rent" className="inline-flex min-h-10 items-center gap-1 px-2 text-xs font-semibold text-muted hover:text-ink">
              <X className="h-3.5 w-3.5" /> 清除
            </Link>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-5 border-t border-line pt-5">
          <div>
            <div className="mb-3 text-sm font-bold text-ink">预算与入住</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="number" min="0" name="min_price" defaultValue={value("min_price")} placeholder="最低月租 SGD" />
              <input type="number" min="0" name="max_price" defaultValue={value("max_price")} placeholder="最高月租 SGD" />
              <select name="room_type" defaultValue={value("room_type")}>
                <option value="">全部房型</option>
                <option value="common_room">普通房</option>
                <option value="master_room">主人房</option>
                <option value="single_room">单人间</option>
                <option value="studio">Studio 公寓</option>
              </select>
              <input type="date" name="available_from" defaultValue={value("available_from")} aria-label="最晚入住日期" />
              <input type="number" min="1" name="min_lease_months" defaultValue={value("min_lease_months")} placeholder="可接受最短租期（月）" />
              <select name="gender_preference" defaultValue={value("gender_preference")}>
                <option value="">性别不限</option>
                <option value="male">适合男性</option>
                <option value="female">适合女性</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold text-ink">居住条件</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="number" min="0" name="max_bathroom_shared" defaultValue={value("max_bathroom_shared")} placeholder="共用浴室人数上限" />
              <input type="number" min="0" name="max_current_occupants" defaultValue={value("max_current_occupants")} placeholder="当前共住人数上限" />
              <FilterCheckbox name="cooking_allowed" checked={value("cooking_allowed") === "on"} label="可煮饭" />
              <FilterCheckbox name="registration_allowed" checked={value("registration_allowed") === "on"} label="可报地址" />
              <FilterCheckbox name="no_landlord" checked={value("no_landlord") === "on"} label="无屋主同住" />
            </div>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold text-ink">设施</div>
            <div className="flex flex-wrap gap-2">
              {facilities.map((facility) => (
                <label key={facility} className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-teal-200 has-[:checked]:border-brand has-[:checked]:bg-teal-50 has-[:checked]:text-brand">
                  <input type="checkbox" name="facility" value={facility} defaultChecked={selectedFacilities.includes(facility)} />
                  {facilityLabels[facility]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary w-full sm:w-auto" type="submit">应用筛选</button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function FilterCheckbox({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-slate-600 transition hover:border-teal-200 has-[:checked]:border-brand has-[:checked]:bg-teal-50 has-[:checked]:text-brand">
      <input type="checkbox" name={name} defaultChecked={checked} /> {label}
    </label>
  );
}
