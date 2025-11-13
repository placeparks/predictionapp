import { createCanvas, loadImage } from 'canvas';
import { join } from 'path';
import type { Snapshot } from './tier';
import { generateAICardWithText } from './aiImage';

export interface NFTImageData {
  tier: number;
  animal: string;
  stats: Snapshot;
  address: string;
}

// Portrait card dimensions aligned with AI outputs
const CARD_WIDTH = 1024;
const CARD_HEIGHT = 1792;

export async function generateNFTImage(data: NFTImageData): Promise<Buffer> {
  const { tier, animal, stats, address } = data;

  // Generate a full AI-rendered card with baked-in text
  const aiCard = await generateAICardWithText({
    tier,
    animal,
    address: address.toLowerCase(),
    stats: {
      tx_count: stats.tx_count,
      nft_count: stats.nft_count,
      erc20_count: stats.erc20_count,
      has_basename: stats.has_basename,
      basename: stats.basename,
    },
  });
  if (aiCard) return aiCard;

  // Strict mode: require AI and do not fallback
  if (process.env.REQUIRE_OPENAI_TEXT === 'true') {
    throw new Error('AI card generation failed and REQUIRE_OPENAI_TEXT is set');
  }

  // Minimal fallback (no local assets): gradient + required text layout
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Try to use local animal image only if explicitly allowed; otherwise use gradient
  let drewBackground = false;
  const allowLocalSubject = process.env.OPENAI_USE_LOCAL_REFERENCE === 'true';
  if (allowLocalSubject) {
    try {
      const animalLower = animal.toLowerCase();
      const animalImagePath = join(process.cwd(), 'public', 'images', `${animalLower}.png`);
      let img = await loadImage(animalImagePath);
      // Handle misspelled phoenix
      if (!img && animalLower === 'phoenix') {
        img = await loadImage(join(process.cwd(), 'public', 'images', 'pheonix.png'));
      }
      if (img) {
        const scale = Math.max(CARD_WIDTH / img.width, CARD_HEIGHT / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (CARD_WIDTH - drawW) / 2;
        const dy = (CARD_HEIGHT - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
        drewBackground = true;
      }
    } catch {}
  }

  if (!drewBackground) {
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    gradient.addColorStop(0, '#0f1020');
    gradient.addColorStop(1, '#1b2430');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  // Title: Tier N
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 96px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // subtle shadow for better contrast
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.fillText(`Tier ${tier}`, CARD_WIDTH / 2, 48);
  ctx.shadowBlur = 0;

  // Left vertical stats
  // draw a subtle translucent panel behind stats for readability
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  const panelX = 40;
  const panelY = 220;
  const panelW = 520;
  const panelH = CARD_HEIGHT - 480;
  ctx.fillRect(panelX, panelY, panelW, panelH);

  const statsX = 64;
  const statsY = 280;
  const statsSpacing = 160;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 60px Arial';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  ctx.fillText(`tx: ${stats.tx_count}`, statsX, statsY);
  ctx.fillText(`NFT: ${stats.nft_count}`, statsX, statsY + statsSpacing);
  if (stats.has_basename && stats.basename) {
    ctx.fillText(`${stats.basename}`, statsX, statsY + statsSpacing * 2);
  }
  ctx.shadowBlur = 0;

  // No animal name text in fallback to avoid textual subject

  // Bottom address
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = '40px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(shortAddress, CARD_WIDTH / 2, CARD_HEIGHT - 32);

  return canvas.toBuffer('image/png');
}

