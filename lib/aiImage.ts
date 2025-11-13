import { createCanvas, loadImage } from 'canvas';
import OpenAI from 'openai';

/**
 * Attempts to generate a full-bleed background image for the given animal using OpenAI Images API.
 * - Controlled by env: set `USE_OPENAI_IMAGE=true` and `OPENAI_API_KEY` to enable.
 * - Optionally accepts a reference image (File or Buffer) to use with OpenAI's edit endpoint.
 * - Returns a PNG buffer on success, or null on any failure.
 */

interface FileLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  type?: string;
}

interface OpenAIImageResponse {
  b64_json?: string;
  url?: string;
}

export async function generateAIAnimalImage(
  animal: string, 
  tier: number,
  referenceImage?: File | Buffer | string
): Promise<Buffer | null> {
  try {
    if (process.env.USE_OPENAI_IMAGE !== 'true') return null;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const openai = new OpenAI({ apiKey });

    // Compose prompt: keep animal locked, full-bleed, no borders, rich premium trading-card artwork.
    const prompt = [
      `Create premium trading-card artwork, FULL-BLEED to edges (no borders, no rounded corners).`,
      `Main subject: ${animal} as the central figure, majestic and powerful.`,
      `High detail, dynamic lighting, cinematic depth, dramatic background.`,
      `Do not include any text, labels, logos, watermarks, UI, or frames.`,
      `Leave subtle negative space along the left third to help overlay readability.`,
      `Overall style: vivid, high-contrast, collector-card worthy.`,
      `Tier context: Tier ${tier}.`
    ].join(' ');

    // If reference image is provided and explicitly allowed, use OpenAI's edit endpoint
    const allowRef = process.env.OPENAI_USE_LOCAL_REFERENCE === 'true';
    if (referenceImage && allowRef) {
      let imageBuffer: Buffer;
      let mimeType = 'image/png';
      
      if (Buffer.isBuffer(referenceImage)) {
        imageBuffer = referenceImage;
      } else if (typeof referenceImage === 'string' && referenceImage.startsWith('data:')) {
        // Convert data URL to Buffer
        const matches = referenceImage.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          const base64Data = matches[2];
          imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
          return null;
        }
      } else if (typeof referenceImage === 'object' && 'arrayBuffer' in referenceImage) {
        // Handle File-like objects (works in both browser and Node.js 18+)
        try {
          const fileLike = referenceImage as FileLike;
          const arrayBuffer = await fileLike.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
          mimeType = fileLike.type || 'image/png';
        } catch {
          return null;
        }
      } else {
        return null;
      }

      // Use OpenAI SDK for image editing
      try {
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
        const file = new File([blob], 'reference.png', { type: mimeType });
        
        const response = await openai.images.edit({
          image: file,
          prompt: `Use this image as inspiration: ${prompt}`,
          model: 'dall-e-2',
          size: '1024x1024',
          response_format: 'b64_json',
        });

        const b64 = response.data?.[0]?.b64_json;
        if (!b64) return null;

        const imgBuf = Buffer.from(b64, 'base64');
        try {
          const img = await loadImage(`data:image/png;base64,${b64}`);
          const canvas = createCanvas(img.width, img.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          return canvas.toBuffer('image/png');
        } catch {
          return imgBuf;
        }
      } catch (err) {
        console.warn('[AI Image] OpenAI edit failed:', err);
        return null;
      }
    }

    // Use OpenAI SDK for image generation
    try {
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt,
        size: '1024x1024',
        n: 1,
        response_format: 'b64_json',
        quality: 'hd',
        style: 'vivid',
      });

      const b64 = response.data?.[0]?.b64_json;
      if (!b64) return null;

      const imgBuf = Buffer.from(b64, 'base64');

      // Validate the image by trying to load it via canvas
      try {
        const img = await loadImage(`data:image/png;base64,${b64}`);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return canvas.toBuffer('image/png');
      } catch {
        return imgBuf;
      }
    } catch (err) {
      console.error('[AI Image] OpenAI generation failed:', err);
      return null;
    }
  } catch (err) {
    console.error('[AI Image] Error:', err);
    return null;
  }
}

export interface AICardTextSpec {
  tier: number;
  animal: string;
  address: string;
  stats: {
    tx_count: number;
    nft_count: number;
    erc20_count: number;
    has_basename: boolean;
    basename?: string;
  };
}

/**
 * Generates a full card with text baked into the image by OpenAI.
 * Hybrid approach: DALL-E 3 generates the animal background, Canvas overlays perfect text
 * Layout: Animal on RIGHT, vertical stats text on LEFT, tier+animal name on TOP, wallet address on BOTTOM
 * Returns a PNG buffer sized to 1024x1792.
 */
export async function generateAICardWithText(spec: AICardTextSpec): Promise<Buffer | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('[AI Card] OPENAI_API_KEY not set, skipping AI generation');
      return null;
    }

    const openai = new OpenAI({ apiKey });
    const { tier, animal, stats, address } = spec;
    
    // Validate address
    if (!address || address.length < 10 || address === '0x0000000000000000000000000000000000000000') {
      console.error('[AI Card] Invalid address:', address);
      return null;
    }
    
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    console.log('[AI Card] Using address:', address, 'Short:', shortAddress);

    const CARD_WIDTH = 1024;
    const CARD_HEIGHT = 1792;

    console.log(`[AI Card] Generating card for ${animal} (Tier ${tier})...`);

    // Strategy: Generate background with animal, then overlay text with Canvas for perfect typography
    const imagePrompt = [
      `Portrait of exactly ONE ${animal} for an NFT trading card background.`,
      `There must be only a SINGLE ${animal} in the entire image - do not include any other animals or creatures.`,
      `Position: The lone ${animal} should be on the RIGHT side of the vertical frame, occupying roughly the right 60% of the space.`,
      `The ${animal} should face slightly toward the left or forward.`,
      `Style: Fantasy art, majestic, powerful, highly detailed with dramatic lighting and vivid colors.`,
      `Background: The LEFT 40% should be mostly clear space with soft gradients or atmospheric effects - no additional subjects.`,
      `Absolutely NO: multiple animals, other creatures, text, labels, logos, watermarks, borders, or UI elements.`,
      `This is a solo character portrait featuring exactly one ${animal}.`,
    ].join(' ');

    console.log('[AI Card] Step 1: Generating background with gpt-image-1...');

    let backgroundBuffer: Buffer;
    try {
      const response = await openai.images.generate({
        model: 'gpt-image-1',
        prompt: imagePrompt,
        size: '1024x1536', // gpt-image-1 max portrait size
        n: 1,
        quality: 'high',
      });

      const item = response.data?.[0] as OpenAIImageResponse | undefined;
      if (!item) {
        console.warn('[AI Card] No image returned from OpenAI');
        console.log('Response:', JSON.stringify(response, null, 2));
        return null;
      }

      let tempBuffer: Buffer | null = null;
      if (item.b64_json) {
        // Some accounts return base64
        tempBuffer = Buffer.from(item.b64_json, 'base64');
        console.log('[AI Card] Received base64 image from OpenAI');
      } else if (item.url) {
        // Some accounts return URL
        const imageUrl: string = item.url;
        console.log('[AI Card] Downloading image from OpenAI URL...');
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          console.error('[AI Card] Failed to download image from URL');
          return null;
        }
        const arrayBuffer = await imageResponse.arrayBuffer();
        tempBuffer = Buffer.from(arrayBuffer);
      } else {
        console.warn('[AI Card] No url or b64_json returned from OpenAI');
        console.log('Item:', JSON.stringify(item, null, 2));
        return null;
      }

      // Extend 1024x1536 to 1024x1792 by adding space at bottom
      const sourceImg = await loadImage(tempBuffer);
      const tempCanvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
      const tempCtx = tempCanvas.getContext('2d');
      
      // Fill with dark gradient background
      const bgGradient = tempCtx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
      bgGradient.addColorStop(0, '#0a0a0a');
      bgGradient.addColorStop(1, '#1a1a2e');
      tempCtx.fillStyle = bgGradient;
      tempCtx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      
      // Draw the AI image at top
      tempCtx.drawImage(sourceImg, 0, 0, CARD_WIDTH, 1536);
      
      backgroundBuffer = tempCanvas.toBuffer('image/png');
      console.log('[AI Card] Background generated and extended to 1792, size:', backgroundBuffer.length);
    } catch (err) {
      console.error('[AI Card] gpt-image-1 generation failed:', err);
      return null;
    }

    // Step 2: Load background and overlay text with Canvas for perfect typography
    console.log('[AI Card] Step 2: Overlaying text with Canvas...');
    
    try {
      const bgImage = await loadImage(backgroundBuffer);
      const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
      const ctx = canvas.getContext('2d');

      // Draw background
      ctx.drawImage(bgImage, 0, 0, CARD_WIDTH, CARD_HEIGHT);

      // Helper: rounded rect (used later for address pill)
      const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
      };

      // Configure text rendering
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // LEFT: Vertical stats (top to bottom, left-aligned) with enhanced styling
      // Note: Tier and Animal name removed from top as per user request
      ctx.textAlign = 'left';
      
      const statsX = 40;
      const statsStartY = 80;
      const statsLineGap = 18; // gap between label and value
      const rowGap = 26;       // gap between rows
      const valueSize = 56;
      const labelSize = 38;

      // Build rows: only Transactions, NFTs, and optional Basename
      console.log('[AI Card] Stats received:', JSON.stringify(stats, null, 2));
      const rows: Array<{ label: string; value: string }> = [];
      
      // Ensure values are numbers, defaulting to 0 if undefined/null
      const txCount = stats.tx_count ?? 0;
      const nftCount = stats.nft_count ?? 0;
      
      console.log('[AI Card] Using stats - tx_count:', txCount, 'nft_count:', nftCount, 'has_basename:', stats.has_basename, 'basename:', stats.basename);
      
      rows.push({ label: 'Transactions', value: String(txCount) });
      rows.push({ label: 'NFTs', value: String(nftCount) });
      if (stats.has_basename && stats.basename) {
        rows.push({ label: 'Basename', value: stats.basename });
      }
      
      console.log('[AI Card] Rows to render:', rows);

      // Label gradient (gold)
      const makeGoldGradient = (y: number) => {
        const g = ctx.createLinearGradient(statsX, y, statsX + 260, y + 10);
        g.addColorStop(0, '#f7d954');
        g.addColorStop(1, '#f2c14e');
        return g;
      };

      let yCursor = statsStartY;
      rows.forEach((row, idx) => {
        // Label
        ctx.font = `700 ${labelSize}px Arial, sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 6;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.fillStyle = makeGoldGradient(yCursor);
        ctx.strokeText(row.label, statsX, yCursor);
        ctx.fillText(row.label, statsX, yCursor);

        // Value
        yCursor += labelSize + statsLineGap;
        ctx.font = `800 ${valueSize}px Arial, sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeText(row.value, statsX, yCursor);
        ctx.fillText(row.value, statsX, yCursor);

        // Separator line
        yCursor += valueSize + rowGap;
        if (idx < rows.length - 1) {
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          const startSepX = 18;
          const endSepX = Math.floor(CARD_WIDTH * 0.5) - 18;
          ctx.moveTo(startSepX, yCursor);
          ctx.lineTo(endSepX, yCursor);
          ctx.stroke();
          yCursor += 12;
        }
      });

      // BOTTOM: Wallet address with pill background
      ctx.font = '600 34px Arial, sans-serif';
      const addrMetrics = ctx.measureText(shortAddress);
      const padX = 20;
      const pillW = addrMetrics.width + padX * 2;
      const pillH = 46;
      const pillX = CARD_WIDTH / 2 - pillW / 2;
      const pillY = CARD_HEIGHT - 48 - pillH / 2;

      // Pill background
      drawRoundedRect(pillX, pillY, pillW, pillH, 18);
      const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY + pillH);
      pillGrad.addColorStop(0, 'rgba(0,0,0,0.55)');
      pillGrad.addColorStop(1, 'rgba(30,30,40,0.45)');
      ctx.fillStyle = pillGrad;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.stroke();

      // Address text
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText(shortAddress, CARD_WIDTH / 2, pillY + pillH / 2);

      console.log('[AI Card] Card generation complete');
      return canvas.toBuffer('image/png');
    } catch (err) {
      console.error('[AI Card] Text overlay failed:', err);
      // Return the background without text as fallback
      return backgroundBuffer;
    }
  } catch (err) {
    console.error('[AI Card] Error:', err);
    return null;
  }
}

