import { createClient } from "@/lib/supabase/server";

type NtuListing = {
  id: string;
  price: number | null;
  mrt_area: string | null;
  postal_code: string | null;
  room_type: string | null;
  normalized_room_type: string | null;
  available_from: string | null;
  cooking_allowed: boolean | null;
  can_register_address: boolean | null;
  gender_preference: string | null;
  summary: string | null;
};

type CleanListingRow = Omit<NtuListing, "summary">;

const ntuAreas = ["Boon Lay", "Pioneer", "Lakeside", "Jurong East", "Chinese Garden", "Clementi"];

const roomTypeLabels: Record<string, string> = {
  common_room: "普通房",
  master_room: "主人房",
  single_room: "单人间",
  small_common_room: "小普通房",
  partition_room: "隔间",
  bedspace: "床位",
  studio: "Studio"
};

function labelRoomType(listing: NtuListing | CleanListingRow) {
  const raw = listing.normalized_room_type || listing.room_type || "房间";
  return roomTypeLabels[raw] ?? raw;
}

function labelBoolean(value: boolean | null, positive: string, negative: string, unknown = "待确认") {
  if (value === true) return positive;
  if (value === false) return negative;
  return unknown;
}

function labelArea(area: string | null) {
  if (!area) return "NTU西部区域";
  return `${area.split(",")[0].trim()} 区域`;
}

function labelGender(value: string | null) {
  if (!value || value === "any" || value === "不限") return "不限";
  if (value.toLowerCase().includes("female") || value.includes("女")) return "限女生";
  if (value.toLowerCase().includes("male") || value.includes("男")) return "限男生";
  return value;
}

function fallbackSummary(listing: NtuListing) {
  return `位于${labelArea(listing.mrt_area)}的${labelRoomType(listing)}，邮编${listing.postal_code ?? "待确认"}，可作为了解 NTU 西部通勤圈房源的参考信息。`;
}

async function getNtuListings() {
  const supabase = await createClient();
  const orFilter = ntuAreas.map((area) => `mrt_area.ilike.%${area}%`).join(",");

  const { data, error } = await supabase
    .from("listing_clean")
    .select("id,price,mrt_area,postal_code,room_type,normalized_room_type,available_from,cooking_allowed,can_register_address,gender_preference")
    .not("postal_code", "is", null)
    .neq("postal_code", "")
    .or(orFilter)
    .order("price", { ascending: true, nullsFirst: false })
    .limit(32);

  if (error) {
    console.error("Failed to load NTU listings", error.message);
    return [];
  }

  const cleanRows = (data ?? []) as CleanListingRow[];
  const cleanIds = cleanRows.map((listing) => listing.id);
  if (cleanIds.length === 0) return [];

  const { data: indexRows } = await supabase
    .from("listing_indexes")
    .select("id,clean_listing_id")
    .in("clean_listing_id", cleanIds);

  const indexByCleanId = new Map<string, string>();
  for (const row of indexRows ?? []) {
    indexByCleanId.set(row.clean_listing_id, row.id);
  }

  const indexIds = [...indexByCleanId.values()];
  const summaryByIndexId = new Map<string, string>();

  if (indexIds.length > 0) {
    const { data: aiRows } = await supabase
      .from("listing_ai_analysis")
      .select("listing_index_id,public_summary")
      .in("listing_index_id", indexIds);

    for (const row of aiRows ?? []) {
      if (row.public_summary) summaryByIndexId.set(row.listing_index_id, row.public_summary);
    }
  }

  return cleanRows.map((listing) => {
    const indexId = indexByCleanId.get(listing.id);
    return {
      ...listing,
      summary: indexId ? summaryByIndexId.get(indexId) ?? null : null
    };
  }) as NtuListing[];
}

export default async function HomePage() {
  const listings = await getNtuListings();
  const pricedListings = listings.filter((listing) => typeof listing.price === "number" && listing.price > 0);
  const averagePrice = pricedListings.length > 0 ? Math.round(pricedListings.reduce((sum, listing) => sum + (listing.price ?? 0), 0) / pricedListings.length) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <section className="overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-sm md:p-8">
        <div className="grid gap-6 md:grid-cols-[1.4fr_0.6fr] md:items-end">
          <div className="space-y-4">
            <div className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-brand">ntu.weijie.sg</div>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-ink md:text-5xl">NTU精选房源</h1>
              <p className="max-w-3xl text-base leading-7 text-muted md:text-lg">
                为中国来新加坡 NTU 留学生整理的西部真实房源，优先展示有邮编、靠近文礼 / 先驱 / 湖畔 / 裕廊区域的房间。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-ink">
              {ntuAreas.map((area) => (
                <span key={area} className="rounded-full bg-gray-50 px-3 py-1">
                  {area}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-2xl font-bold text-brand">{listings.length}</div>
              <div className="mt-1 text-xs text-muted">当前展示</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-2xl font-bold text-brand">{averagePrice ? `$${averagePrice}` : "待算"}</div>
              <div className="mt-1 text-xs text-muted">平均租金</div>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5 text-sm leading-7 text-muted">
        这些房源已优先筛选出有邮编、靠近 NTU 通勤圈的房源。后续会继续补充真实通勤时间和屋主认证。当前先以“能快速判断是否适合 NTU 学生”为目标。
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
        <h2 className="mb-2 font-semibold text-amber-950">平台声明</h2>
        <p>本平台不参与房屋租赁交易。</p>
        <p>本平台仅提供房源信息整理与推荐服务。</p>
        <p>所有房源信息均来源于公开渠道。</p>
        <p>用户需自行核实房东身份及房源真实性。</p>
      </section>

      {listings.length === 0 ? (
        <section className="card p-8 text-center text-muted">暂时没有可展示的 NTU 房源。请检查 listing_clean 的 RLS 读取权限或房源状态。</section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <article key={listing.id} className="card overflow-hidden p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-4 rounded-xl bg-gradient-to-br from-teal-50 to-gray-50 p-4">
                <h2 className="text-xl font-bold text-ink">{labelArea(listing.mrt_area)} · {labelRoomType(listing)}</h2>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm text-ink">
                <div className="rounded bg-gray-50 px-3 py-2"><span className="text-muted">房型：</span>{labelRoomType(listing)}</div>
                <div className="rounded bg-gray-50 px-3 py-2"><span className="text-muted">租金：</span>{listing.price ? `$${listing.price}` : "询价"}</div>
                <div className="rounded bg-gray-50 px-3 py-2"><span className="text-muted">区域：</span>{labelArea(listing.mrt_area)}</div>
                <div className="rounded bg-gray-50 px-3 py-2"><span className="text-muted">邮编：</span>{listing.postal_code}</div>
                <div className="rounded bg-gray-50 px-3 py-2"><span className="text-muted">入住：</span>{listing.available_from || "待确认"}</div>
                <div className="rounded bg-gray-50 px-3 py-2"><span className="text-muted">性别：</span>{labelGender(listing.gender_preference)}</div>
                <div className="rounded bg-gray-50 px-3 py-2"><span className="text-muted">可煮：</span>{labelBoolean(listing.cooking_allowed, "可", "不可")}</div>
                <div className="rounded bg-gray-50 px-3 py-2"><span className="text-muted">报地址：</span>{labelBoolean(listing.can_register_address, "可", "待确认")}</div>
              </div>

              <p className="mt-4 rounded-lg bg-teal-50 px-3 py-3 text-sm leading-6 text-muted">
                {listing.summary || fallbackSummary(listing)}
              </p>
            </article>
          ))}
        </section>
      )}

      <section className="rounded-2xl bg-ink p-6 text-white md:flex md:items-center md:justify-between md:p-8">
        <div>
          <h2 className="text-2xl font-bold">想找更合适的房子？</h2>
          <p className="mt-2 text-sm text-white/75">加入 NTU 租房群，把预算、入住时间、是否可煮发给我，我帮你匹配。</p>
        </div>
        <a href="#" className="mt-5 inline-flex rounded-md bg-white px-4 py-2 text-sm font-semibold text-ink md:mt-0">
          加入NTU租房群
        </a>
      </section>
    </div>
  );
}
