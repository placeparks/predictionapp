# Testing OpenAI Image Generation

Multiple ways to test the image generation before minting!

## Method 1: Using .env.local (Recommended)

1. Create `.env.local` in project root:
```bash
OPENAI_API_KEY=sk-proj-YOUR-KEY-HERE
```

2. Run the test:
```bash
npm run test:openai
```

This will generate 3 sample images (Tier 1, 3, 5) and save to `test-output/`.

---

## Method 2: Pass API Key Directly

If `.env.local` isn't working, pass the key as an argument:

```bash
npx tsx scripts/test-openai-simple.ts sk-proj-YOUR-KEY-HERE
```

This generates one test image (Tier 3 Tiger) in `test-output/`.

---

## Method 3: PowerShell Environment Variable

Set the key in PowerShell and run:

```powershell
$env:OPENAI_API_KEY="sk-proj-YOUR-KEY-HERE"
npm run test:openai
```

---

## Method 4: Hardcode in File (Temporary)

**For testing only**, edit `lib/aiImage.ts` line 156:

```typescript
const apiKey = process.env.OPENAI_API_KEY || 'sk-proj-YOUR-KEY-HERE';
```

⚠️ **Remember to remove before committing!**

---

## What You'll See

Successful test output:
```
🎨 Testing OpenAI Image Generation

✅ OpenAI API Key found
🔑 Key preview: sk-proj-abcdef123456...

📁 Output directory: D:\miniapp\test-output

============================================================
🎯 Generating: Tier 3 - Tiger
============================================================
📊 Stats:
  - Transactions: 50
  - NFTs: 15
  - Tokens: 8
  - Address: 0xabcd...ef12

⏳ Calling OpenAI DALL-E 3...
[AI Card] Generating card for Tiger (Tier 3)...
[AI Card] Step 1: Generating background with DALL-E 3...
[AI Card] Background generated, size: 2457632
[AI Card] Step 2: Overlaying text with Canvas...
[AI Card] Card generation complete

✅ Success! Generated in 12.34s
📄 File: test-tiger.png
💾 Size: 2399.64 KB
📐 Dimensions: 1024 x 1792 px

📂 Open: D:\miniapp\test-output\test-tiger.png
```

---

## Check the Generated Image

Open `test-output/test-tiger.png` and verify:

- ✅ **Top**: "Tier 3" (gold) and "Tiger" (white)
- ✅ **Right**: AI-generated tiger illustration
- ✅ **Left**: Vertical stats (Transactions, NFTs, Tokens)
- ✅ **Bottom**: Wallet address (0xabcd...ef12)

---

## Troubleshooting

### "OPENAI_API_KEY not set"
Try Method 2 or 4 above.

### "OpenAI generation failed: 401 Unauthorized"
Your API key is invalid. Get a new one at: https://platform.openai.com/api-keys

### "OpenAI generation failed: 429 Too Many Requests"
Rate limited. Wait 60 seconds and try again.

### "OpenAI generation failed: Insufficient credits"
Add credits at: https://platform.openai.com/account/billing

### Image looks wrong
- DALL-E 3 creates unique images each time
- Text overlay should always be consistent
- If text is wrong, there's a bug in the Canvas code

### Very slow (30+ seconds)
Normal! DALL-E 3 HD images take 10-20 seconds to generate.

---

## Testing in Development Server

1. Start dev server:
```bash
npm run dev
```

2. Connect your wallet

3. View your stats (tier will show based on on-chain activity)

4. Click "Mint Your NFT"

5. Wait ~10-20 seconds for generation + IPFS upload

6. NFT appears with AI-generated image!

**Note**: This uses real OpenAI credits (~$0.04-0.08 per image)

---

## Testing Without OpenAI (Free)

Want to see the fallback without spending credits?

1. Don't set `OPENAI_API_KEY` (or remove it)

2. Start dev server and mint

3. You'll get gradient background with Canvas text

This tests the entire flow without OpenAI costs!

---

## Quick Test Script Comparison

| Method | Command | Images | Time | Use Case |
|--------|---------|--------|------|----------|
| Full Test | `npm run test:openai` | 3 (Tier 1,3,5) | 30-60s | Complete test |
| Simple Test | `npx tsx scripts/test-openai-simple.ts KEY` | 1 (Tier 3) | 10-20s | Quick verify |
| Dev Server | `npm run dev` → mint | 1 (your tier) | 10-20s | Full flow test |

---

## After Testing Successfully

1. ✅ Remove any hardcoded API keys from code
2. ✅ Add `OPENAI_API_KEY` to production environment
3. ✅ Deploy!

Your NFT minting will automatically use OpenAI for all new mints.

---

## Need Help?

Check these files:
- `QUICKSTART_OPENAI.md` - Setup guide
- `OPENAI_SETUP.md` - Detailed configuration
- `IMPLEMENTATION_COMPLETE.md` - Full documentation

Or check the console logs - they show exactly what's happening during generation.

