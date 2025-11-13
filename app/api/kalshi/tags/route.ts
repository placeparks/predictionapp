import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API = "https://api.elections.kalshi.com/v1/search/tags_by_categories";

export async function GET() {
  try {
    const r = await fetch(API, { headers: { accept: "application/json" }, cache: "no-store" });
    const body = await r.json();
    if (!r.ok) return NextResponse.json({ ok:false, status:r.status, body }, { status: 502 });
    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok:false, message }, { status: 502 });
  }
}
