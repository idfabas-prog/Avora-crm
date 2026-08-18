import { NextResponse } from "next/server";
import { getAppEnvironment, getAppVersion } from "@/lib/config/environment";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unavailable" = "ok";
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").select("id").limit(1);
    if (error) database = "unavailable";
  } catch {
    database = "unavailable";
  }

  return NextResponse.json(
    {
      ok: database === "ok",
      environment: getAppEnvironment(),
      version: getAppVersion(),
      database
    },
    {
      status: database === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

