# OpenAI Integration Summary

## What Was Done

This project now uses **OpenAI DALL-E 3** for generating high-quality NFT badge images with a hybrid approach combining AI-generated backgrounds and Canvas-rendered text.

## Key Changes

### 1. **Installed OpenAI SDK**
```bash
npm install openai
```

### 2. **Updated `lib/aiImage.ts`**

#### Before:
- Used raw fetch API calls to OpenAI
- Attempted to bake text into AI-generated images
- Text quality was inconsistent

#### After:
- Uses official OpenAI Node.js SDK
- **Hybrid approach**: DALL-E 3 generates animal background, Canvas overlays perfect text
- Much better text quality and layout control

**New Function**: `generateAICardWithText()`
- Generates 1024x1792px portrait card
- Animal positioned on RIGHT (60% width)
- Stats text on LEFT (40% width) - reading TOP TO BOTTOM
- Tier name and Animal name on TOP
- Wallet address on BOTTOM

### 3. **Layout Specifications**

```
┌─────────────────────────────────────┐
│        Tier 3 - Tiger (TOP)         │
├─────────────┬───────────────────────┤
│             │                       │
│ Transactions│                       │
│     50      │                       │
│             │      [Tiger Image]    │
│ NFTs        │      (AI Generated)   │
│     15      │                       │
│             │                       │
│ Tokens      │                       │
│      8      │                       │
│             │                       │
│  (LEFT)     │        (RIGHT)        │
├─────────────┴───────────────────────┤
│     0x1234...5678 (BOTTOM)          │
└─────────────────────────────────────┘
```

### 4. **Text Styling**

- **Tier Number**: Gold (#F7D954), 72px, bold, centered
- **Animal Name**: White (#FFFFFF), 60px, bold, centered
- **Stat Labels**: Gold (#F7D954), 38px, bold
- **Stat Values**: White (#FFFFFF), 56px, bold
- **Wallet Address**: White with transparency, 32px, centered

### 5. **Created Documentation**

- **OPENAI_SETUP.md**: Complete setup guide
- **OPENAI_INTEGRATION_SUMMARY.md**: This file
- **scripts/test-openai-image.ts**: Test script for verification

### 6. **New NPM Script**

```bash
npm run test:openai
```

This generates sample images for tiers 1, 3, and 5 to test the OpenAI integration.

## How It Works

### Step 1: DALL-E 3 Background Generation
```typescript
const imagePrompt = [
  'Create a premium vertical NFT trading card background',
  'Main subject: A majestic ${animal} on the RIGHT SIDE',
  'LEFT SIDE: Keep relatively clear for text overlay',
  // ... more details
].join(' ');

const response = await openai.images.generate({
  model: 'dall-e-3',
  prompt: imagePrompt,
  size: '1024x1792',
  quality: 'hd',
  style: 'vivid',
});
```

### Step 2: Canvas Text Overlay
```typescript
// Load AI background
const bgImage = await loadImage(backgroundBuffer);
const canvas = createCanvas(1024, 1792);
ctx.drawImage(bgImage, 0, 0, 1024, 1792);

// Add gradient overlay for readability
const gradient = ctx.createLinearGradient(0, 0, 512, 0);
gradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 512, 1792);

// Render text with perfect typography
ctx.font = 'bold 72px Arial';
ctx.fillStyle = '#F7D954';
ctx.fillText(`Tier ${tier}`, 512, 40);
// ... more text
```

## Benefits of This Approach

1. **High-Quality Animals**: DALL-E 3 creates stunning, unique animal illustrations
2. **Perfect Text**: Canvas ensures crisp, readable text every time
3. **Consistent Layout**: Text positioning is always exactly where needed
4. **Fast Rendering**: Canvas text overlay is instant after AI generation
5. **Fallback Support**: If OpenAI fails, still generates usable images

## Cost Analysis

- **DALL-E 3 (1024x1792, HD)**: ~$0.04-0.08 per image
- **Generated once per mint**: Cached in IPFS permanently
- **No ongoing costs**: Images are stored on IPFS

### Example Monthly Costs:
- 100 mints/month: $4-8
- 500 mints/month: $20-40
- 1000 mints/month: $40-80

## Environment Variables

Add to `.env.local`:

```bash
# Required for OpenAI integration
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional
USE_OPENAI_IMAGE=true              # Enable OpenAI (default: true)
REQUIRE_OPENAI_TEXT=false          # Fail if OpenAI unavailable (default: false)
OPENAI_USE_LOCAL_REFERENCE=false   # Use local images as reference (default: false)
```

## Testing

### Test OpenAI Integration
```bash
npm run test:openai
```

This will:
1. Check if `OPENAI_API_KEY` is set
2. Generate 3 sample images (Tier 1, 3, 5)
3. Save them to `test-output/` directory
4. Report timing and file sizes

### Expected Output
```
🎨 Testing OpenAI Image Generation

✅ OpenAI API Key found
🔑 Key preview: sk-proj-abcdef123456...

📁 Output directory: /path/to/test-output

============================================================
🎯 Generating: Tier 1 - Goat
============================================================
📊 Stats:
  - Transactions: 5
  - NFTs: 2
  - Tokens: 3

✅ Success! Generated in 8.45s
📄 File: tier-1-goat.png
💾 Size: 1234.56 KB
📐 Dimensions: 1024 x 1792 px
```

## Integration Points

### 1. Minting Flow
- User clicks "Mint Your NFT"
- `POST /api/upload-ipfs` called
- `generateNFTImage()` in `lib/imageGenerator.ts` called
- Delegates to `generateAICardWithText()` in `lib/aiImage.ts`
- Image uploaded to Pinata IPFS
- Metadata created with IPFS URL

### 2. Display Flow
- User's NFT displayed on page
- `GET /api/image/[tokenId].png` called
- Fetches metadata from IPFS
- Returns cached image or regenerates if needed

## Fallback Behavior

If `OPENAI_API_KEY` is not set or API fails:

1. `generateAICardWithText()` returns `null`
2. `generateNFTImage()` falls back to gradient background
3. Canvas renders all text (tier, stats, address)
4. Still produces a valid NFT image

Set `REQUIRE_OPENAI_TEXT=true` to fail hard if OpenAI is unavailable.

## Troubleshooting

### Issue: "OPENAI_API_KEY not set"
**Solution**: Add key to `.env.local` and restart dev server

### Issue: "OpenAI generation failed"
**Causes**:
- Invalid API key
- No credits in OpenAI account
- Rate limit exceeded
- Network issues

**Solution**: Check OpenAI dashboard and error logs

### Issue: Text is cut off
**Cause**: Long basename or large numbers

**Solution**: Adjust font sizes in `generateAICardWithText()` function

### Issue: Animal not positioned correctly
**Cause**: DALL-E 3 interprets prompts creatively

**Solution**: Prompt is optimized but results may vary slightly. This is expected with AI generation.

## Future Improvements

1. **Caching**: Cache generated images locally to reduce API calls
2. **Batch Generation**: Generate multiple tiers at once for testing
3. **Prompt Tuning**: Fine-tune prompts based on results
4. **Alternative Models**: Test DALL-E 2 for lower costs
5. **Local AI**: Consider Stable Diffusion for self-hosted alternative

## Files Modified

1. `lib/aiImage.ts` - Core OpenAI integration
2. `lib/imageGenerator.ts` - Already calls `generateAICardWithText()`
3. `package.json` - Added `test:openai` script
4. `scripts/test-openai-image.ts` - New test script
5. `OPENAI_SETUP.md` - Setup documentation
6. `OPENAI_INTEGRATION_SUMMARY.md` - This file

## Next Steps for Developers

1. **Set up API key**: Add `OPENAI_API_KEY` to `.env.local`
2. **Test**: Run `npm run test:openai`
3. **Review output**: Check `test-output/` directory
4. **Deploy**: Add API key to production environment
5. **Monitor**: Track OpenAI usage in dashboard

## Support

- **OpenAI SDK Docs**: https://github.com/openai/openai-node
- **DALL-E 3 API**: https://platform.openai.com/docs/guides/images
- **Pricing**: https://openai.com/pricing

---

**Status**: ✅ Ready for production

**Last Updated**: November 3, 2025

