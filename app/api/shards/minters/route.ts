import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

type Level = "Common" | "Rare" | "Epic" | "Legendary";

const ADDRESS_CHUNK_SIZE = 70;

function chunk<T>(source: T[], size: number): T[][] {
  if (size <= 0) return [source];
  const result: T[][] = [];
  for (let i = 0; i < source.length; i += size) {
    result.push(source.slice(i, i + size));
  }
  return result;
}

function tierToLevel(rawTier: unknown): Level {
  const tier = Number(rawTier ?? 0);
  if (tier >= 4) return "Legendary";
  if (tier >= 3) return "Epic";
  if (tier >= 2) return "Rare";
  return "Common";
}

function computeCoherence(wins: number, losses: number, tier: number): number {
  const total = wins + losses;
  if (total === 0) {
    // small baseline so minted-but-inactive still glow a bit, scale with tier
    return Math.min(100, 30 + tier * 8);
  }
  const winRate = wins / total;
  // Experience bonus grows sub-linearly with number of settled predictions
  const experienceBoost = Math.min(25, Math.log2(total + 1) * 12);
  return Math.min(100, Math.round(winRate * 70 + experienceBoost + tier * 3));
}

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, data: [] });
  }

  try {
    const { data: eligibilityData, error: eligibilityError } = await supabaseAdmin
      .from("eligibility")
      .select("address, tier, minted_tier, minted_token_id, minted_at, minted_animal, minted_metadata_url")
      .not("minted_token_id", "is", null);

    if (eligibilityError) {
      console.error("[minters] eligibility query failed", eligibilityError);
      return NextResponse.json({ ok: false, data: [] }, { status: 500 });
    }

    const eligible = (eligibilityData ?? []).filter((row) =>
      typeof row?.address === "string" && row.address.length > 0
    );

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const tierLookup = new Map<string, number>();
    const mintedInfo = new Map<
      string,
      {
        tier: number;
        animal: string | null;
        tokenId: number | null;
        metadataUrl: string | null;
        mintedAt: string | null;
      }
    >();

    eligible.forEach((row) => {
      const wallet = row.address.toLowerCase();
      const tier = Number(row.minted_tier ?? row.tier ?? 0);
      tierLookup.set(wallet, tier);
      mintedInfo.set(wallet, {
        tier,
        animal: row.minted_animal ?? null,
        tokenId: row.minted_token_id ?? null,
        metadataUrl: row.minted_metadata_url ?? null,
        mintedAt: row.minted_at ?? null,
      });
    });

    const wallets = Array.from(tierLookup.keys());
    const walletSet = new Set(wallets);

    // Fetch predictions for these wallets
    type PredictionRow = { user_address: string; market_id: string; side_yes: boolean | null };
    const predictions: PredictionRow[] = [];

    for (const batch of chunk(wallets, ADDRESS_CHUNK_SIZE)) {
      const { data, error } = await supabaseAdmin
        .from("predictions")
        .select("user_address, market_id, side_yes")
        .in("user_address", batch);

      if (error) {
        console.error("[minters] predictions query failed", error);
        continue;
      }
      if (data) predictions.push(...data);
    }

    const marketIds = Array.from(
      new Set(predictions.map((p) => p.market_id).filter((id): id is string => !!id))
    );

    type OutcomeRow = { market_id: string; resolved: boolean | null; side_yes: boolean | null };
    const outcomes = new Map<string, OutcomeRow>();

    for (const batch of chunk(marketIds, ADDRESS_CHUNK_SIZE)) {
      const { data, error } = await supabaseAdmin
        .from("outcomes")
        .select("market_id, resolved, side_yes")
        .in("market_id", batch);

      if (error) {
        console.error("[minters] outcomes query failed", error);
        continue;
      }
      (data ?? []).forEach((row) => {
        if (row?.market_id) {
          outcomes.set(row.market_id, row);
        }
      });
    }

    const predictionsByWallet = new Map<string, PredictionRow[]>();
    predictions.forEach((row) => {
      const wallet = row.user_address?.toLowerCase();
      if (!walletSet.has(wallet)) return;
      if (!predictionsByWallet.has(wallet)) predictionsByWallet.set(wallet, []);
      predictionsByWallet.get(wallet)!.push(row);
    });

    const result = eligible.map((row) => {
      const wallet = row.address.toLowerCase();
      const mintedTier = tierLookup.get(wallet) ?? 0;
      const level = tierToLevel(mintedTier);
      const preds = predictionsByWallet.get(wallet) ?? [];

      let wins = 0;
      let losses = 0;
      let resolved = 0;

      preds.forEach((prediction) => {
        const outcome = prediction.market_id ? outcomes.get(prediction.market_id) : undefined;
        if (!outcome || !outcome.resolved || typeof outcome.side_yes !== "boolean") return;
        if (prediction.side_yes === null) return;
        resolved += 1;
        if (prediction.side_yes === outcome.side_yes) wins += 1;
        else losses += 1;
      });

      const settled = wins + losses;
      const winRate = settled > 0 ? wins / settled : 0;
      const coherence = computeCoherence(wins, losses, mintedTier);
      const mint = mintedInfo.get(wallet);

      return {
        wallet,
        level,
        wins,
        losses,
        coherence,
        winRate,
        mintedTier,
        mintedAnimal: mint?.animal ?? null,
        mintedTokenId: mint?.tokenId ?? null,
        mintedMetadataUrl: mint?.metadataUrl ?? null,
        mintedAt: mint?.mintedAt ?? null,
        totalPredictions: preds.length,
        resolvedPredictions: resolved,
        unresolvedPredictions: Math.max(0, preds.length - resolved),
        lat: null,
        lon: null,
      };
    });

    // sort by tier then win rate so biggest achievers appear first (useful for debugging)
    result.sort((a, b) => {
      const tierA = tierLookup.get(a.wallet) ?? 0;
      const tierB = tierLookup.get(b.wallet) ?? 0;
      if (tierA !== tierB) return tierB - tierA;
      return b.winRate - a.winRate;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("[minters] unexpected failure", error);
    return NextResponse.json({ ok: false, data: [] }, { status: 500 });
  }
}
