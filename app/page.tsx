import { createClient } from "@/lib/supabase/server";

type NtuListing = {
  id: string;
  price: number | null;
  postal_code: string | null;
  display_address: string | null;
  commute_minutes: number | null;
  clean_text: string | null;
  tags: string[] | null;
  amenities: string[] | null;
  room_type: string | null;
  normalized_room_type: string | null;
  available_from: string | null;
  cooking_allowed: boolean | null;
  gender_preference: string | null;
};

type CommuteRow = {
  listing_index_id: string;
  duration_minutes: number | null;
};

type IndexRow = {
  id: string;
  clean_listing_id: string | null;
  price: number | null;
  postal_code: string | null;
  tags: string[] | null;
  amenities: string[] | null;
  room_type: string | null;
  normalized_room_type: string | null;
  cooking_allowed: boolean | null;
  gender_preference: string | null;
};

type CleanRow = {
  id: string;
  available_from: string | null;
  clean_text: string | null;
};

type GeocodingRow = {
  postal_code: string | null;
  address: string | null;
  block: string | null;
  road_name: string | null;
  building: string | null;
};

const quickAreas = ["≤30分钟", "31-45分钟", "46-60分钟"];

const roomTypeLabels: Record<string, string> = {
  common_room: "普通房",
  master_room: "主人房",
  single_room: "单人间",
  small_common_room: "小普通房",
  partition_room: "隔间",
  bedspace: "床位",
  studio: "Studio"
};

function labelRoomType(listing: NtuListing) {
  const raw = listing.normalized_room_type || listing.room_type || "房间";
  return roomTypeLabels[raw] ?? raw;
}

function labelGender(value: string | null) {
  if (!value || value === "any" || value === "不限") return "不限";
  if (value.toLowerCase().includes("female") || value.includes("女")) return "限女生";
  if (value.toLowerCase().includes("male") || value.includes("男")) return "限男生";
  return value;
}

function sanitizeAddressText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\bSingapore\b/gi, "")
    .replace(/S\(?\d{6}\)?/gi, "")
    .replace(/\b\d{6}\b/g, "")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDisplayAddress(row: GeocodingRow) {
  const geocodedAddress = sanitizeAddressText(row.address);
  if (geocodedAddress) return geocodedAddress;

  const building = sanitizeAddressText(row.building);
  const block = sanitizeAddressText(row.block);
  const roadName = sanitizeAddressText(row.road_name);
  return [building, block ? `Blk ${block}` : null, roadName].filter(Boolean).join(" · ") || null;
}

function buildTitle(listing: NtuListing) {
  const location = sanitizeAddressText(listing.display_address);
  return [location || "地址待确认", labelRoomType(listing)].filter(Boolean).join(" · ");
}

function buildTags(listing: NtuListing) {
  const commuteTag = listing.commute_minutes ? `到NTU约${listing.commute_minutes}分钟` : null;
  const baseTags = [
    commuteTag,
    listing.cooking_allowed === true ? "可煮" : null,
    labelGender(listing.gender_preference) !== "不限" ? labelGender(listing.gender_preference) : null,
    labelRoomType(listing)
  ];

  const dbTags = [...(listing.tags ?? []), ...(listing.amenities ?? [])]
    .map((tag) => String(tag).trim())
    .filter((tag) => tag && tag.length <= 12 && !/[0-9]{6,}/.test(tag));

  return Array.from(new Set([...baseTags, ...dbTags].filter(Boolean) as string[])).slice(0, 8);
}

function groupCount(listings: NtuListing[], max: number, min = 0) {
  return listings.filter((listing) => {
    const minutes = listing.commute_minutes ?? 999;
    return minutes > min && minutes <= max;
  }).length;
}

function formatCleanText(value: string | null | undefined) {
  const text = String(value ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || "暂无清洗后的房源信息";
}

async function getNtuListings() {
  const supabase = await createClient();

  const { data: commuteData, error: commuteError } = await supabase
    .from("listing_commute_cache")
    .select("listing_index_id,duration_minutes")
    .eq("school_code", "NTU")
    .eq("mode", "bus")
    .eq("status", "success")
    .lte("duration_minutes", 60)
    .order("duration_minutes", { ascending: true })
    .limit(60);

  if (commuteError) {
    console.error("Failed to load NTU commute cache", commuteError.message);
    return [];
  }

  const commuteRows = (commuteData ?? []) as CommuteRow[];
  const indexIds = commuteRows.map((row) => row.listing_index_id).filter(Boolean);
  if (indexIds.length === 0) return [];

  const commuteByIndexId = new Map<string, number>();
  for (const row of commuteRows) {
    if (row.duration_minutes !== null) commuteByIndexId.set(row.listing_index_id, row.duration_minutes);
  }

  const { data: indexData, error: indexError } = await supabase
    .from("listing_indexes")
    .select("id,clean_listing_id,price,postal_code,tags,amenities,room_type,normalized_room_type,cooking_allowed,gender_preference")
    .in("id", indexIds)
    .eq("status", "active");

  if (indexError) {
    console.error("Failed to load listing indexes", indexError.message);
    return [];
  }

  const indexRows = (indexData ?? []) as IndexRow[];
  const cleanIds = Array.from(new Set(indexRows.map((listing) => listing.clean_listing_id).filter(Boolean) as string[]));
  const postalCodes = Array.from(new Set(indexRows.map((listing) => listing.postal_code).filter(Boolean) as string[]));
  const cleanById = new Map<string, CleanRow>();
  const addressByPostalCode = new Map<string, string>();

  if (cleanIds.length > 0) {
    const { data: cleanData } = await supabase
      .from("listing_clean")
      .select("id,available_from,clean_text")
      .in("id", cleanIds);

    for (const row of (cleanData ?? []) as CleanRow[]) {
      cleanById.set(row.id, row);
    }
  }

  if (postalCodes.length > 0) {
    const { data: geocodingRows } = await supabase
      .from("geocoding_cache")
      .select("postal_code,address,block,road_name,building")
      .in("postal_code", postalCodes)
      .eq("status", "success");

    for (const row of (geocodingRows ?? []) as GeocodingRow[]) {
      if (!row.postal_code) continue;
      const displayAddress = buildDisplayAddress(row);
      if (displayAddress) addressByPostalCode.set(row.postal_code, displayAddress);
    }
  }

  return indexRows
    .map((listing) => {
      const cleanRow = listing.clean_listing_id ? cleanById.get(listing.clean_listing_id) : null;
      return {
        id: listing.id,
        price: listing.price,
        postal_code: listing.postal_code,
        display_address: listing.postal_code ? addressByPostalCode.get(listing.postal_code) ?? null : null,
        commute_minutes: commuteByIndexId.get(listing.id) ?? null,
        clean_text: cleanRow?.clean_text ?? null,
        tags: listing.tags,
        amenities: listing.amenities,
        room_type: listing.room_type,
        normalized_room_type: listing.normalized_room_type,
        available_from: cleanRow?.available_from ?? null,
        cooking_allowed: listing.cooking_allowed,
        gender_preference: listing.gender_preference
      };
    })
    .sort((a, b) => (a.commute_minutes ?? 999) - (b.commute_minutes ?? 999));
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
              <h1 className="text-3xl font-bold tracking-tight text-ink md:text-5xl">NTU 60分钟通勤圈房源</h1>
              <p className="max-w-3xl text-base leading-7 text-muted md:text-lg">
                优先展示已计算真实公交通勤、到 NTU 约 60 分钟以内的房源，按通勤时间从短到长排序。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-ink">
              {quickAreas.map((area) => (
                <span key={area} className="rounded-full bg-gray-50 px-3 py-1">
                  {area}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-2xl font-bold text-brand">{listings.length}</div>
              <div className="mt-1 text-xs text-muted">60分钟内</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-2xl font-bold text-brand">{averagePrice ? `$${averagePrice}` : "待算"}</div>
              <div className="mt-1 text-xs text-muted">平均租金</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="card p-4"><span className="font-semibold text-brand">≤30分钟：</span>{groupCount(listings, 30)} 间</div>
        <div className="card p-4"><span className="font-semibold text-brand">31-45分钟：</span>{groupCount(listings, 45, 30)} 间</div>
        <div className="card p-4"><span className="font-semibold text-brand">46-60分钟：</span>{groupCount(listings, 60, 45)} 间</div>
      </section>

      <section className="card p-5 text-sm leading-7 text-muted">
        通勤时间来自缓存计算结果，仅作为初步筛选参考；实际路线、等待时间和上课地点可能影响最终通勤体验。
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
        <h2 className="mb-2 font-semibold text-amber-950">平台声明</h2>
        <p>本平台不参与房屋租赁交易。</p>
        <p>本平台仅提供房源信息整理与推荐服务。</p>
        <p>所有房源信息均来源于公开渠道。</p>
        <p>用户需自行核实房东身份及房源真实性。</p>
      </section>

      {listings.length === 0 ? (
        <section className="card p-8 text-center text-muted">暂时没有 NTU 60分钟内通勤房源。请先运行通勤计算或检查 listing_commute_cache。</section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <article key={listing.id} className="card overflow-hidden p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="rounded-xl bg-gradient-to-br from-teal-50 to-gray-50 p-4">
                <h2 className="text-lg font-bold leading-7 text-ink">{buildTitle(listing)}</h2>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="text-2xl font-bold text-brand">
                    {listing.price ? `$${listing.price}` : "询价"}<span className="text-sm font-medium text-muted"> / 月</span>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand shadow-sm">
                    {listing.commute_minutes}分钟
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {buildTags(listing).map((tag) => (
                  <span key={tag} className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-brand">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-4 rounded-lg bg-gray-50 p-3">
                <div className="mb-2 text-xs font-semibold text-ink">房源信息</div>
                <p className="max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-muted">
                  {formatCleanText(listing.clean_text)}
                </p>
              </div>
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
