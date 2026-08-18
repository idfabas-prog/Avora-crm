import { NextResponse } from "next/server";
import { buildReadinessProbe, type ReadinessDatabaseStatus } from "@/lib/system/production-readiness";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: ReadinessDatabaseStatus = "ok";
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").select("id").limit(1);
    if (error) database = "unavailable";
  } catch {
    database = "unavailable";
  }

  const readiness = buildReadinessProbe(database);

  return NextResponse.json(
    readiness.payload,
    {
      status: readiness.statusCode,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
