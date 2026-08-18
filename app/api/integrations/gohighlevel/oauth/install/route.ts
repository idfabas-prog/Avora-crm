import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertGhlPermission, ghlLocationAllowed } from "@/lib/integrations/gohighlevel/permissions";
import { buildGhlOAuthInstallUrl, createGhlOAuthState } from "@/lib/integrations/gohighlevel/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { GhlConnection } from "@/lib/integrations/gohighlevel/types";

export async function GET(request: Request) {
  const profile = await requireCurrentProfile();
  assertGhlPermission(profile, "integrations.ghl.credentials.manage");
  const url = new URL(request.url);
  const connectionId = String(url.searchParams.get("connection_id") ?? "").trim();
  if (!connectionId) return Response.json({ ok: false, error: "Connection is required" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ghl_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("organization_id", profile.organizationId)
    .single();
  if (error || !data) return Response.json({ ok: false, error: "GoHighLevel connection not found" }, { status: 404 });
  const connection = data as GhlConnection;
  if (!ghlLocationAllowed(profile, connection.location_id)) return Response.json({ ok: false, error: "GoHighLevel connection is not available for this user" }, { status: 403 });

  const admin = createAdminClient();
  const state = await createGhlOAuthState(admin, profile, connection);
  return NextResponse.redirect(buildGhlOAuthInstallUrl({ state: state.state }));
}
