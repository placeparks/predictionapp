# Quick Start: OpenAI Image Generation

Get your NFT badges generating with AI in 5 minutes!

## Step 1: Get Your OpenAI API Key (2 minutes)

1. Go to: https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click **"Create new secret key"**
4. Copy the key (starts with `sk-proj-...`)

> **💡 Tip**: You'll need to add credits to your OpenAI account. $5-10 is plenty to start.

## Step 2: Add to Your Project (1 minute)

Create or edit `.env.local` in your project root:

```bash
OPENAI_API_KEY=sk-proj-YOUR-KEY-HERE
```

That's it! The integration is already set up.

## Step 3: Test It (2 minutes)

```bash
npm run test:openai
```

This will generate 3 sample NFT badges and save them to `test-output/`.

**What you'll see:**
```
🎨 Testing OpenAI Image Generation

✅ OpenAI API Key found
🔑 Key preview: sk-proj-abcdef123456...

============================================================
🎯 Generating: Tier 1 - Goat
============================================================

✅ Success! Generated in 8.45s
📄 File: tier-1-goat.png
```

Check the `test-output/` folder for your images!

## Step 4: Start Your Dev Server

```bash
npm run dev
```

Now when users mint NFTs, they'll get AI-generated badges automatically!

## What You Get

Each NFT badge will have:

- ✅ **Top**: Tier number and animal name (e.g., "Tier 3 - Tiger")
- ✅ **Right**: Beautiful AI-generated animal illustration
- ✅ **Left**: Vertical stats (Transactions, NFTs, Tokens)
- ✅ **Bottom**: Wallet address

All with perfect typography and professional design.

## Cost

- **Per image**: ~$0.04-0.08 (one-time, cached in IPFS)
- **100 mints**: ~$4-8
- **1000 mints**: ~$40-80

Images are generated once and stored permanently on IPFS.

## How It Works

1. User clicks "Mint NFT"
2. System calls OpenAI DALL-E 3 to generate animal background
3. Canvas overlays perfect text (tier, stats, address)
4. Image uploaded to IPFS via Pinata
5. NFT minted with IPFS metadata

**Generation time**: ~5-15 seconds per image

## Troubleshooting

### "OPENAI_API_KEY not set"
→ Add the key to `.env.local` and restart server

### "Insufficient credits"
→ Add credits at https://platform.openai.com/account/billing

### "Rate limit exceeded"
→ Wait a moment and try again, or upgrade OpenAI tier

### Images look different each time
→ That's normal! DALL-E 3 creates unique art each time

## Optional: Disable OpenAI

If you want to use gradient backgrounds instead:

```bash
# In .env.local
OPENAI_API_KEY=  # Leave empty or remove
```

System will automatically fall back to gradient + text rendering.

## Need Help?

1. Check `OPENAI_SETUP.md` for detailed setup
2. Read `OPENAI_INTEGRATION_SUMMARY.md` for technical details
3. Run `npm run test:openai` to verify setup

## Example Output

**Tier 1 - Goat**:
- Majestic goat illustration on right
- "Tier 1" and "Goat" at top in gold/white
- Stats on left: "Transactions: 5, NFTs: 2, Tokens: 3"
- Wallet address at bottom

**Tier 5 - Phoenix**:
- Stunning phoenix with fire effects on right
- "Tier 5" and "Phoenix" at top
- Stats including Basename if available
- Professional collector card quality

---

**Ready to go?** Run `npm run test:openai` now! 🚀

If it works, you're all set. If not, check the error message and troubleshooting section above.

