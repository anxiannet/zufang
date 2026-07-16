import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CandidateImportStatus,
  IngestionListing,
  ListingImportCandidate,
  ParsedListingCandidate
} from "./types";

const protected_statuses: CandidateImportStatus[] = ["approved", "imported", "rejected", "duplicate"];

export function should_refresh_candidate(
  existing: Pick<ListingImportCandidate, "import_status" | "updated_at"> | null | undefined,
  scraped_at: string | null | undefined
): boolean {
  if (!existing) return true;
  if (protected_statuses.includes(existing.import_status)) return false;
  if (!scraped_at) return false;

  const candidate_updated_at = Date.parse(existing.updated_at);
  const source_scraped_at = Date.parse(scraped_at);
  if (Number.isNaN(candidate_updated_at) || Number.isNaN(source_scraped_at)) return false;
  return source_scraped_at > candidate_updated_at;
}

export async function getPendingIngestionListings(
  supabase: SupabaseClient,
  limit = 50,
  source?: string
): Promise<IngestionListing[]> {
  const output: IngestionListing[] = [];
  let offset = 0;
  const page_size = Math.min(Math.max(limit * 2, 50), 500);

  while (output.length < limit) {
    let query = supabase
      .from("ingestion_listings")
      .select("id,source,source_id,listing_url,detail_url,list_title,list_price,list_contact,list_raw_text,raw_detail_html,scraped_at,created_at,last_seen_at")
      .eq("removed_from_source", false)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + page_size - 1);

    if (source) query = query.eq("source", source);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    const ids = data.map((row) => row.id);
    const { data: existing, error: existing_error } = await supabase
      .from("listing_import_candidates")
      .select("ingestion_listing_id,import_status,updated_at")
      .in("ingestion_listing_id", ids);
    if (existing_error) throw new Error(existing_error.message);

    const existing_by_ingestion_id = new Map(
      (existing ?? []).map((candidate) => [Number(candidate.ingestion_listing_id), candidate])
    );
    for (const row of data) {
      const candidate = existing_by_ingestion_id.get(Number(row.id));
      if (should_refresh_candidate(candidate as Pick<ListingImportCandidate, "import_status" | "updated_at"> | undefined, row.scraped_at)) {
        output.push(row as IngestionListing);
      }
      if (output.length >= limit) break;
    }

    if (data.length < page_size) break;
    offset += page_size;
  }

  return output;
}

export async function createImportCandidate(
  supabase: SupabaseClient,
  ingestion: IngestionListing,
  parsed: ParsedListingCandidate,
  import_status: CandidateImportStatus
): Promise<{ created: boolean; candidate: ListingImportCandidate | null }> {
  const { data: existing, error: existing_error } = await supabase
    .from("listing_import_candidates")
    .select("*")
    .eq("ingestion_listing_id", ingestion.id)
    .maybeSingle();
  if (existing_error) throw new Error(existing_error.message);

  if (existing && protected_statuses.includes(existing.import_status as CandidateImportStatus)) {
    return { created: false, candidate: existing as ListingImportCandidate };
  }

  const row = {
    ingestion_listing_id: ingestion.id,
    source: ingestion.source ?? "unknown",
    source_id: ingestion.source_id,
    source_url: ingestion.detail_url ?? ingestion.listing_url,
    ...parsed,
    import_status,
    import_error: null,
    parser_version: "v1",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("listing_import_candidates")
    .upsert(row, { onConflict: "ingestion_listing_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { created: !existing, candidate: data as ListingImportCandidate };
}

export async function detectDuplicateCandidate(
  supabase: SupabaseClient,
  candidate: ParsedListingCandidate & {
    ingestion_listing_id: number;
    source: string;
    source_id: string | null;
    source_url: string | null;
  }
): Promise<{ duplicate: boolean; listing_id?: string; reason?: string }> {
  if (candidate.parsed_phone && candidate.parsed_rent_amount && candidate.parsed_postal_code) {
    const { data, error } = await supabase
      .from("listings")
      .select("id,postal_code")
      .eq("phone", candidate.parsed_phone)
      .eq("rent_amount", candidate.parsed_rent_amount)
      .eq("postal_code", candidate.parsed_postal_code)
      .limit(1);
    if (error) throw new Error(error.message);
    if (data?.[0]) return { duplicate: true, listing_id: data[0].id, reason: "电话、租金及邮编疑似重复" };
  }

  return { duplicate: false };
}

export async function markCandidateDuplicate(
  supabase: SupabaseClient,
  candidate_id: string,
  warnings: string[],
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from("listing_import_candidates")
    .update({
      import_status: "duplicate",
      parse_warnings: [...new Set([...warnings, "疑似重复房源", reason])],
      updated_at: new Date().toISOString()
    })
    .eq("id", candidate_id);
  if (error) throw new Error(error.message);
}

export async function importCandidateToListing(
  supabase: SupabaseClient,
  candidate_id: string,
  options: { reviewedBy?: string; systemOwnerId: string }
): Promise<{ listing_id: string }> {
  const { data: candidate, error: candidate_error } = await supabase
    .from("listing_import_candidates")
    .select("*")
    .eq("id", candidate_id)
    .single();
  if (candidate_error || !candidate) throw new Error(candidate_error?.message ?? "Candidate not found");
  if (!["parsed", "needs_review"].includes(candidate.import_status)) throw new Error("Candidate must be published or under review before import");
  if (candidate.listing_id) throw new Error("Candidate has already been imported");

  const required = [
    ["parsed_title", candidate.parsed_title],
    ["parsed_rent_amount", candidate.parsed_rent_amount],
    ["parsed_postal_code", candidate.parsed_postal_code]
  ] as const;
  const missing = required.find(([, value]) => value === null || value === "");
  if (missing) throw new Error(`${missing[0]} is required`);
  if (!candidate.parsed_phone && !candidate.parsed_wechat) throw new Error("A phone or WeChat contact is required");

  const listing_type = mapListingType(candidate.parsed_listing_type);
  const room_type = mapRoomType(candidate.parsed_room_type);
  if (!listing_type) throw new Error("parsed_listing_type cannot be mapped to listings enum");
  if (listing_type !== "whole_unit" && !room_type) {
    throw new Error("parsed_room_type is required unless listing_type is whole_unit");
  }

  const { data: owner, error: owner_error } = await supabase
    .from("users_profile")
    .select("id")
    .eq("id", options.systemOwnerId)
    .maybeSingle();
  if (owner_error) throw new Error(owner_error.message);
  if (!owner) throw new Error("systemOwnerId is not a valid users_profile.id");

  const duplicate = await detectDuplicateCandidate(supabase, candidate);
  if (duplicate.duplicate) {
    await markCandidateDuplicate(supabase, candidate.id, candidate.parse_warnings ?? [], duplicate.reason ?? "疑似重复房源");
    throw new Error(duplicate.reason ?? "Duplicate listing");
  }

  const now = new Date().toISOString();
  const candidate_no = candidate.candidate_no ? `C${String(candidate.candidate_no).padStart(4, "0")}` : candidate.id;
  const imported_source = mapFormalListingSource(candidate.source);
  const internal_note = [
    `由候选房源 ${candidate_no} 导入`,
    "已人工联系并确认授权",
    `候选来源=${candidate.source}`,
    `候选链接=${candidate.source_url ?? ""}`
  ].join("；");

  const { data: listing, error: listing_error } = await supabase
    .from("listings")
    .insert({
      owner_id: options.systemOwnerId,
      status: "draft",
      title: candidate.parsed_title,
      listing_type,
      room_type,
      rent_amount: candidate.parsed_rent_amount,
      deposit_amount: candidate.parsed_deposit_amount,
      postal_code: candidate.parsed_postal_code,
      unit_hidden_address: null,
      available_from: candidate.parsed_available_from ?? now.slice(0, 10),
      min_lease_months: candidate.parsed_min_lease_months ?? 6,
      max_occupants: candidate.parsed_max_occupants ?? 1,
      gender_preference: candidate.parsed_gender_preference ?? "any",
      registration_allowed: candidate.parsed_registration_allowed ?? false,
      landlord_staying: candidate.parsed_landlord_staying ?? false,
      total_bedrooms: candidate.parsed_total_bedrooms,
      total_bathrooms: candidate.parsed_total_bathrooms,
      current_occupants_count: candidate.parsed_current_occupants_count,
      bathroom_shared_with_count: candidate.parsed_bathroom_shared_with_count,
      description: candidate.parsed_description,
      description_clean: candidate.parsed_description_clean,
      source: imported_source,
      contact_visibility: "group_only",
      wechat: candidate.parsed_wechat,
      phone: candidate.parsed_phone,
      is_owner_direct: candidate.parsed_is_owner_direct ?? false,
      is_agent: candidate.parsed_is_agent ?? false,
      is_sublet: candidate.parsed_is_sublet ?? false,
      verification_status: "unverified",
      utilities_policy: candidate.parsed_utilities_policy,
      aircon_policy: candidate.parsed_aircon_policy,
      cooking_policy: candidate.parsed_cooking_policy,
      visitors_policy: candidate.parsed_visitors_policy,
      smoking_policy: candidate.parsed_smoking_policy,
      pets_policy: candidate.parsed_pets_policy,
      tenant_type_preference: candidate.parsed_tenant_type_preference ?? [],
      available_note: candidate.parsed_available_note,
      internal_note
    })
    .select("id")
    .single();

  if (listing_error || !listing) {
    await supabase
      .from("listing_import_candidates")
      .update({
        import_status: "failed",
        import_error: listing_error?.message ?? "Listing insert failed",
        updated_at: now
      })
      .eq("id", candidate.id);
    throw new Error(listing_error?.message ?? "Listing insert failed");
  }

  const facilityRows = normalizeParsedFacilities(candidate.parsed_facilities).map((facility) => ({
    listing_id: listing.id,
    facility_name: facility.facility_name,
    availability: facility.availability,
    note: facility.note
  }));
  if (facilityRows.length > 0) {
    const { error: facility_error } = await supabase
      .from("listing_facilities")
      .upsert(facilityRows, { onConflict: "listing_id,facility_name" });
    if (facility_error) throw new Error(facility_error.message);
  }

  const { error: update_error } = await supabase
    .from("listing_import_candidates")
    .update({
      import_status: "imported",
      listing_id: listing.id,
      reviewed_by: options.reviewedBy ?? candidate.reviewed_by,
      reviewed_at: now,
      import_error: null,
      updated_at: now
    })
    .eq("id", candidate.id)
    .in("import_status", ["parsed", "needs_review"]);
  if (update_error) throw new Error(update_error.message);

  return { listing_id: listing.id };
}

function normalizeParsedFacilities(value: unknown): Array<{
  facility_name: string;
  availability: "available" | "restricted" | "not_available";
  note: string | null;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const facility_name = "facility_name" in row ? String(row.facility_name) : "";
    const availability = "availability" in row ? String(row.availability) : "available";
    if (!facility_name || !["available", "restricted", "not_available"].includes(availability)) return [];
    return [{
      facility_name,
      availability: availability as "available" | "restricted" | "not_available",
      note: "note" in row && typeof row.note === "string" && row.note.trim() ? row.note.trim() : null
    }];
  });
}

function mapFormalListingSource(value: string | null): "owner_submit" | "wechat_group" | "zufang" | "xiaohongshu" | "manual" {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("wechat") || normalized.includes("微信")) return "wechat_group";
  if (normalized.includes("xiaohongshu") || normalized.includes("小红书")) return "xiaohongshu";
  if (normalized.includes("zufang") || normalized.includes("shicheng") || normalized.includes("bbs")) return "zufang";
  return "manual";
}

function mapListingType(value: string | null): "room" | "whole_unit" | "student_apartment" | "bedspace" | null {
  return value === "room" || value === "whole_unit" || value === "student_apartment" || value === "bedspace"
    ? value
    : null;
}

function mapRoomType(value: string | null): "common_room" | "master_room" | "studio" | "whole_unit" | "partition_room" | "maid_room" | null {
  return value === "common_room"
    || value === "master_room"
    || value === "studio"
    || value === "whole_unit"
    || value === "partition_room"
    || value === "maid_room"
    ? value
    : null;
}
