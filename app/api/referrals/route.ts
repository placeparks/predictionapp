import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * GET /api/referrals?user=0x...
 * Get referral status for a user, including their referral codes
 */
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }

    const url = new URL(req.url);
    const user = (url.searchParams.get("user") || "").toLowerCase();

    if (!/^0x[a-f0-9]{40}$/.test(user)) {
      return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
    }

    // Get referral stats as referrer (returns empty array if none - that's fine)
    const { data: referrerData, error: referrerError } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .eq("referrer_address", user)
      .order("created_at", { ascending: false });

    if (referrerError) {
      console.warn("[referrals] Error fetching referrer data (non-fatal):", referrerError);
    }

    // Get referral info as referred user (returns null if none - that's fine)
    const { data: referredData, error: referredError } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .eq("referred_address", user)
      .maybeSingle();

    if (referredError) {
      console.warn("[referrals] Error fetching referred data (non-fatal):", referredError);
    }

    // Get Genesis status (returns null if not a Genesis user - that's fine)
    const { data: genesisData, error: genesisError } = await supabaseAdmin
      .from("genesis_users")
      .select("*")
      .eq("address", user)
      .maybeSingle();

    if (genesisError) {
      console.warn("[referrals] Error fetching genesis data (non-fatal):", genesisError);
    }

    // Get user's referral codes
    let referralCodes: Array<{
      code: string;
      created_at: string;
      usage_count: number;
      is_active: boolean;
      last_used_at: string | null;
    }> = [];
    
    try {
      const { data: codesData, error: codesError } = await supabaseAdmin.rpc("get_user_referral_codes", {
        p_creator_address: user,
      });
      
      if (codesError) {
        console.warn("[referrals] Error fetching referral codes (non-fatal):", codesError);
      } else if (codesData) {
        referralCodes = codesData;
      }
    } catch (codesErr) {
      console.warn("[referrals] Error fetching referral codes (non-fatal):", codesErr);
    }

    // Count active referrals
    const activeCount = referrerData?.filter(r => r.is_active === true).length || 0;
    const totalReferrals = referrerData?.length || 0;

    // Get primary referral code (most used or first created)
    const primaryCode = referralCodes.length > 0 
      ? referralCodes.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0) || 
                                      new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.code
      : null;

    // Get base URL from environment variable or detect from request
    const envBaseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
    const requestUrl = new URL(req.url);
    const detectedBaseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const baseUrl = envBaseUrl || detectedBaseUrl || "https://prophecy.house";
    const referralLink = primaryCode 
      ? `${baseUrl}?ref=${primaryCode}`
      : `${baseUrl}?ref=${user}`; // Fallback to wallet address if no code

    return NextResponse.json({
      ok: true,
      referrer: {
        total: totalReferrals,
        active: activeCount,
        referrals: referrerData || [],
      },
      referred: referredData || null,
      genesis: genesisData || null,
      referralCodes: referralCodes,
      primaryCode: primaryCode,
      referralLink: referralLink,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[referrals] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/referrals
 * Create a referral relationship OR generate a referral code
 * Body: 
 *   - { action: "create", referralCode: "PROPH-...", referred: "0x..." } - Use a referral code
 *   - { action: "generate", creator: "0x..." } - Generate a new referral code
 */
export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }

    const body = await req.json();
    const action = body?.action || "create"; // Default to "create" for backward compatibility

    if (action === "generate") {
      // Generate a new referral code
      const creator = (body?.creator || "").toLowerCase();

      if (!/^0x[a-f0-9]{40}$/.test(creator)) {
        return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
      }

      const { data: code, error } = await supabaseAdmin.rpc("generate_referral_code", {
        p_creator_address: creator,
      });

      if (error) {
        console.error("[referrals] Error generating code:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      // Get base URL from environment variable or detect from request
      const envBaseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_URL?.trim();
      const requestUrl = new URL(req.url);
      const detectedBaseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
      const baseUrl = envBaseUrl || detectedBaseUrl || "https://prophecy.house";
      
      return NextResponse.json({
        ok: true,
        code: code,
        referralLink: `${baseUrl}?ref=${code}`,
      });
    } else {
      // Create referral using code (or fallback to wallet address for backward compatibility)
      const referralCode = body?.referralCode || body?.code || null;
      const referred = (body?.referred || "").toLowerCase();

      if (!/^0x[a-f0-9]{40}$/.test(referred)) {
        return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
      }

      let result;
      let _referrerAddress: string | null = null; // Unused but kept for potential future use

      if (referralCode && typeof referralCode === "string" && referralCode.trim().length > 0) {
        // Use referral code system
        const { data, error } = await supabaseAdmin.rpc("create_referral_from_code", {
          p_referral_code: referralCode.trim(),
          p_referred_address: referred,
        });

        if (error) {
          console.error("[referrals] Error creating referral from code:", error);
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        if (!data?.ok) {
          return NextResponse.json({ 
            ok: false, 
            error: data?.error || "invalid_referral_code",
            message: data?.message || "Invalid referral code"
          }, { status: 400 });
        }

        result = data;
        _referrerAddress = data.referrer_address;
      } else {
        // Fallback to old system (direct wallet address) for backward compatibility
        const referrer = (body?.referrer || "").toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(referrer)) {
          return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin.rpc("create_referral", {
          p_referrer_address: referrer,
          p_referred_address: referred,
        });

        if (error) {
          console.error("[referrals] Error creating referral:", error);
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        result = data;
        _referrerAddress = referrer;
      }

      // Process rewards immediately
      let rewardData: unknown = null;
      try {
        const rewardResponse = await supabaseAdmin.rpc("process_referral_rewards", {
          p_referred_address: referred,
        });
        if (rewardResponse.error) {
          console.warn("[referrals] Reward processing failed (non-fatal):", rewardResponse.error);
        } else {
          rewardData = rewardResponse.data;
        }
      } catch (err) {
        console.warn("[referrals] Reward processing failed (non-fatal):", err);
      }

      return NextResponse.json({
        ok: true,
        referral: result,
        rewards: rewardData,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[referrals] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

