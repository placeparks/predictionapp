import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic", runtime = "nodejs";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const page_size = u.searchParams.get("page_size") ?? "500";
  const minimum_start_date = u.searchParams.get("minimum_start_date") ?? ""; // pass-through optional
  const qs = new URLSearchParams({ page_size });
  if (minimum_start_date) qs.set("minimum_start_date", minimum_start_date);

  const url = `https://api.elections.kalshi.com/v1/milestones/?${qs.toString()}`;
  const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const text = await r.text();
  return new NextResponse(text, { status: r.status, headers: { "content-type": "application/json" } });
}
