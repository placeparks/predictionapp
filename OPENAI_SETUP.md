# OpenAI Image Generation Setup

This project uses OpenAI's DALL-E 3 to generate high-quality NFT badge images with tier-based animals.

## Features

- **Animal on Right**: Majestic animal illustration based on tier (Tadpole, Goat, Fox, Tiger, Dragon, Phoenix)
- **Vertical Stats on Left**: Transaction count, NFT count, Token count displayed vertically
- **Tier & Animal Name on Top**: Clear header showing tier number and animal name
- **Wallet Address on Bottom**: User's wallet address displayed at the bottom

## Setup Instructions

### 1. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in to your account
3. Create a new API key
4. Copy the key (starts with `sk-proj-...` or `sk-...`)

### 2. Configure Environment Variables

Add the following to your `.env.local` file:

```bash
# Required: OpenAI API Key for DALL-E 3 image generation
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Enable OpenAI image generation (default: true when API key is set)
USE_OPENAI_IMAGE=true

# Optional: Require OpenAI (fail if unavailable, otherwise falls back to gradient)
REQUIRE_OPENAI_TEXT=false

# Optional: Use local animal images as reference for DALL-E
OPENAI_USE_LOCAL_REFERENCE=false
```

### 3. How It Works

The image generation uses a **hybrid approach** for best results:

1. **DALL-E 3 Background**: Generates a high-quality animal illustration positioned on the right
2. **Canvas Text Overlay**: Adds crisp, perfectly-rendered text using Node Canvas
   - Top: Tier number and animal name (gold and white)
   - Left: Vertical stats with labels and values
   - Bottom: Wallet address

This approach combines AI creativity with perfect typography.

## Tier System

The animals correspond to tiers defined in `lib/tier.ts`:

| Tier | Animal   | Requirements                    |
|------|----------|---------------------------------|
| 0    | Tadpole  | Default (no activity)           |
| 1    | Goat     | >= 0 transactions               |
| 2    | Fox      | >= 12 transactions              |
| 3    | Tiger    | >= 23 transactions              |
| 4    | Dragon   | >= 214 transactions             |
| 5    | Phoenix  | >= 255 transactions + Basename  |

## Image Specifications

- **Format**: PNG
- **Size**: 1024 x 1792 pixels (portrait)
- **Quality**: HD (DALL-E 3)
- **Style**: Vivid, high-contrast fantasy art
- **Text Colors**: 
  - Tier/Labels: Gold (#F7D954)
  - Values/Animal Name: White (#FFFFFF)
  - Address: Semi-transparent white

## Usage in Code

The image generation is automatically used by:

1. **Minting**: `/api/upload-ipfs` generates and uploads to Pinata
2. **Display**: `/api/image/[id].png` serves the NFT image
3. **Generator**: `lib/imageGenerator.ts` orchestrates the process
4. **AI Engine**: `lib/aiImage.ts` handles OpenAI integration

## Cost Considerations

- **DALL-E 3**: ~$0.04-0.08 per image (1024x1792, HD quality)
- Images are cached in IPFS after minting
- Only generated once per mint/upgrade

## Fallback Behavior

If OpenAI is unavailable or API key is not set:

1. System falls back to gradient background
2. Text is rendered using Canvas
3. Basic tier badge is still generated
4. No errors for end users

## Testing

To test image generation without minting:

```bash
npm run test:image
```

This will generate sample images for all tiers.

## Troubleshooting

### "OPENAI_API_KEY not set"
- Add your API key to `.env.local`
- Restart your dev server

### "OpenAI generation failed"
- Check your API key is valid
- Verify you have credits in your OpenAI account
- Check OpenAI status page for outages

### Images look wrong
- DALL-E 3 generates unique images each time
- Text overlay is consistent (Canvas-rendered)
- Animal positioning may vary slightly

### Rate limits
- DALL-E 3 has rate limits based on your tier
- Free tier: 5 requests/minute
- Paid tier: Higher limits
- Consider caching generated images

## Best Practices

1. **Cache aggressively**: Store generated images in IPFS
2. **Monitor costs**: Track API usage in OpenAI dashboard
3. **Handle failures gracefully**: Use fallback rendering
4. **Test locally**: Generate samples before deploying
5. **Version control**: Keep prompts in code for consistency

## Support

For issues with:
- OpenAI API: [OpenAI Help Center](https://help.openai.com)
- Image generation: Check `lib/aiImage.ts` logs
- IPFS upload: Verify Pinata configuration

---

**Note**: This setup uses the official OpenAI Node.js SDK for reliable API integration.

