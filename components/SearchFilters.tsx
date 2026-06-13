import { facilities, facilityLabels } from "@/lib/types";

export function SearchFilters({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const value = (key: string) => String(searchParams[key] ?? "");
  const selectedFacilities = Array.isArray(searchParams.facility)
    ? searchParams.facility.map(String)
    : searchParams.facility
      ? [String(searchParams.facility)]
      : [];

  return (
    <form className="card space-y-4 p-4" action="/rent">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="q">关键词</label>
          <input id="q" name="q" defaultValue={value("q")} placeholder="房源编号、地区、MRT、标题或描述" />
        </div>
        <button className="btn-primary sm:min-w-28" type="submit">搜索房源</button>
      </div>

      <details className="border-t border-line pt-3">
        <summary className="cursor-pointer select-none text-sm font-semibold text-ink">更多筛选</summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label htmlFor="location">地址 / 邮编</label>
              <input id="location" name="location" defaultValue={value("location")} placeholder="Tampines / 520123" />
            </div>
            <div>
              <label htmlFor="sort">排序</label>
              <select id="sort" name="sort" defaultValue={value("sort") || "latest"}>
                <option value="latest">最新</option>
                <option value="price_asc">租金低到高</option>
                <option value="available_soon">可入住日期近</option>
                <option value="ntu_commute">NTU 通勤优先</option>
              </select>
            </div>
            <input name="min_price" defaultValue={value("min_price")} placeholder="最低价" />
            <input name="max_price" defaultValue={value("max_price")} placeholder="最高价" />
            <select name="room_type" defaultValue={value("room_type")}>
              <option value="">全部房型</option>
              <option value="common_room">普通房</option>
              <option value="master_room">主人房</option>
              <option value="single_room">单人间</option>
              <option value="studio">Studio公寓</option>
            </select>
            <input type="date" name="available_from" defaultValue={value("available_from")} />
            <input name="min_lease_months" defaultValue={value("min_lease_months")} placeholder="最长接受租期" />
            <select name="gender_preference" defaultValue={value("gender_preference")}>
              <option value="">性别不限</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <input name="max_bathroom_shared" defaultValue={value("max_bathroom_shared")} placeholder="共用浴室人数上限" />
            <input name="max_current_occupants" defaultValue={value("max_current_occupants")} placeholder="当前共住人数上限" />
            <label className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
              <input className="w-auto" type="checkbox" name="cooking_allowed" defaultChecked={value("cooking_allowed") === "on"} /> 可煮
            </label>
            <label className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
              <input className="w-auto" type="checkbox" name="registration_allowed" defaultChecked={value("registration_allowed") === "on"} /> 可报地址
            </label>
            <label className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
              <input className="w-auto" type="checkbox" name="no_landlord" defaultChecked={value("no_landlord") === "on"} /> 无屋主同住
            </label>
          </div>

          <div>
            <div className="text-sm font-semibold text-ink">设施</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {facilities.map((facility) => (
                <label key={facility} className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-sm">
                  <input
                    className="w-auto"
                    type="checkbox"
                    name="facility"
                    value={facility}
                    defaultChecked={selectedFacilities.includes(facility)}
                  />
                  {facilityLabels[facility]}
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>
    </form>
  );
}
