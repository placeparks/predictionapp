import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, tokenId, tier, animal, metadataUrl } = body;

    if (!address || !/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
    }

    if (!tokenId || !tier || !animal) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    if (supabaseAdmin) {
      try {
        // Update eligibility table to record minted tier
        await supabaseAdmin
          .from("eligibility")
          .upsert({
            address: address.toLowerCase(),
            tier, // Current eligible tier
            minted_tier: tier, // Tier that was actually minted
            minted_token_id: tokenId,
            minted_animal: animal,
            minted_metadata_url: metadataUrl || null,
            minted_at: new Date().toISOString(),
            last_computed_at: new Date().toISOString(),
          }, { onConflict: "address" });

        console.log(`Recorded mint for ${address}: Token ${tokenId}, Tier ${tier} - ${animal}`);
      } catch (e) {
        console.error("Failed to record mint in Supabase:", e);
        // Don't fail the request if Supabase update fails
      }
    }

    return NextResponse.json({
      ok: true,
      address,
      tokenId,
      tier,
      animal,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/record-mint error:", message);
    return NextResponse.json({ 
      ok: false, 
      error: "internal_error", 
      message 
    }, { status: 500 });
  }
}
