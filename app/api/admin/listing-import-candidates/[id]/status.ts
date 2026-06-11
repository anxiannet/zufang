import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateCandidateStatus(
  context: { params: Promise<{ id: string }> },
  status: "approved" | "rejected" | "duplicate",
  warning?: string
) {
  let profile;
  try {
    profile = await requireRole(["admin"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = createAdminClient();
  const { data: candidate, error: read_error } = await supabase
    .from("listing_import_candidates")
    .select("import_status,parse_warnings")
    .eq("id", id)
    .single();
  if (read_error) return NextResponse.json({ error: read_error.message }, { status: 404 });
  if (candidate.import_status === "imported") {
    return NextResponse.json({ error: "Imported candidates cannot change status" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    import_status: status,
    reviewed_by: profile.id,
    reviewed_at: now,
    updated_at: now,
    import_error: null
  };
  if (warning) update.parse_warnings = [...new Set([...(candidate.parse_warnings ?? []), warning])];

  const { data, error } = await supabase
    .from("listing_import_candidates")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
