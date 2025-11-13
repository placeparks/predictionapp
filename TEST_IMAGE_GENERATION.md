# NFT Image Generation Testing Guide

This guide explains how to test NFT image generation **without minting** an NFT.

## Methods

### Method 1: API Endpoint (Recommended)

Start your dev server and use the test API endpoint:

```bash
npm run dev
```

#### Browser Test (GET)
Open in your browser:
```
http://localhost:3000/api/test-image-generation
```

Or with custom stats:
```
http://localhost:3000/api/test-image-generation?tx_count=183&unique_peers=10&nft_count=3&tokens=5
```

#### POST Request (with reference image)
Use curl or any HTTP client:

```bash
# Without reference image
curl -X POST http://localhost:3000/api/test-image-generation \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x1234567890123456789012345678901234567890",
    "stats": {
      "tx_count": 183,
      "unique_peers": 10,
      "erc20_count": 5,
      "nft_count": 3,
      "nft_collections": 2,
      "erc20_usd": 0,
      "has_basename": false
    }
  }'

# With reference image (base64 data URL)
curl -X POST http://localhost:3000/api/test-image-generation \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x1234567890123456789012345678901234567890",
    "stats": {
      "tx_count": 183,
      "unique_peers": 10,
      "erc20_count": 5,
      "nft_count": 3,
      "nft_collections": 2,
      "erc20_usd": 0,
      "has_basename": false
    },
    "referenceImage": "data:image/png;base64,iVBORw0KG..."
  }'
```

### Method 2: Standalone Script

Run the test script directly:

```bash
# Install tsx if not already installed
npm install --save-dev tsx

# Run basic test
npm run test:image

# With custom stats
npm run test:image -- --tx=183 --peers=10 --nfts=3 --tokens=5

# With reference image
npm run test:image -- --reference-image=./public/images/goat.png

# Full example with all options
npm run test:image -- \
  --address=0x1234567890123456789012345678901234567890 \
  --tx=183 \
  --peers=10 \
  --tokens=5 \
  --nfts=3 \
  --basename=true \
  --basename-value=test.basename \
  --reference-image=./path/to/image.png
```

The script will:
- Generate the NFT image
- Save it as `test-nft-image-tier-{tier}-{animal}.png`
- Create an HTML viewer at `test-nft-image-tier-{tier}-{animal}.html`
- Display configuration and results in the console

## OpenAI Configuration

To test with OpenAI-generated images:

1. Create or update `.env.local`:
```env
USE_OPENAI_IMAGE=true
USE_OPENAI_TEXT=false
OPENAI_API_KEY=sk-your-api-key-here
```

2. Restart your dev server or re-run the script

## Reference Image Testing

To test with reference images (for OpenAI image-to-image generation):

1. **Via API**: Include `referenceImage` as a base64 data URL in the POST body
2. **Via Script**: Use `--reference-image=./path/to/image.png`

The reference image will be used with OpenAI's `images/edits` endpoint when:
- `USE_OPENAI_IMAGE=true`
- `OPENAI_API_KEY` is set
- A reference image is provided

## Output

Both methods will generate:
- **PNG file**: The actual NFT image
- **HTML file**: A simple viewer to preview the image in a browser
- **Console output**: Tier, animal, stats, and generation details

## Examples

### Test Tier 3 (Fox) - 183 transactions
```bash
npm run test:image -- --tx=183
```

### Test Tier 4 with reference image
```bash
npm run test:image -- --tx=214 --reference-image=./public/images/dragon.png
```

### Test Tier 5 (Phoenix) with basename
```bash
npm run test:image -- --tx=255 --basename=true --basename-value=mybase.basename
```

## Troubleshooting

- **"Cannot find module 'canvas'"**: Make sure `canvas` is installed (it's in dependencies)
- **OpenAI not working**: Check your `.env.local` file and API key
- **Reference image not found**: Use absolute paths or paths relative to project root
- **Script fails**: Make sure `tsx` is installed: `npm install --save-dev tsx`

## Next Steps

Once you're happy with the generated images:
1. Test different tiers and stats
2. Test with different reference images
3. When ready, proceed with actual NFT minting!
