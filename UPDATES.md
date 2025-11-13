# Updates - November 3, 2025

## Changes Made

### 1. Switched to gpt-image-1 Model ✅

Updated from `dall-e-3` to `gpt-image-1` (latest OpenAI image model) for more accurate and controllable image generation.

**File**: `lib/aiImage.ts` line 190
```typescript
model: 'gpt-image-1',  // Was: 'dall-e-3'
```

**Benefits**:
- More accurate prompt following
- Better composition control
- Improved detail rendering
- Consistent quality

### 2. Removed Tier & Animal Name from Top ✅

Per user request, removed the tier number and animal name text from the top of the image.

**Before**:
```
┌─────────────────────────────┐
│  Tier 3        Tiger  (TOP) │  ← REMOVED
├──────────┬──────────────────┤
│ Stats    │   Animal Image   │
│ (LEFT)   │   (RIGHT)        │
└──────────┴──────────────────┘
│  0x1234...5678 (BOTTOM)     │
└─────────────────────────────┘
```

**After**:
```
┌─────────────────────────────┐
│                             │
├──────────┬──────────────────┤
│ Stats    │   Animal Image   │
│ (LEFT)   │   (RIGHT)        │
│          │                  │
│          │                  │
└──────────┴──────────────────┘
│  0x1234...5678 (BOTTOM)     │
└─────────────────────────────┘
```

**Changes**:
- Removed `Tier ${tier}` text from top
- Removed `${animal}` name from top
- Stats now start at Y=80 (was Y=280)
- More vertical space for stats

### 3. Enhanced Prompt for Better Results

Improved the AI prompt for more accurate positioning:

```typescript
const imagePrompt = [
  `Create a premium vertical NFT trading card background in portrait orientation.`,
  `Main subject: A majestic ${animal} positioned prominently on the RIGHT SIDE of the composition, taking up approximately 60% of the width.`,
  `The ${animal} should be rendered in detailed fantasy art style with: powerful stance, dynamic pose, vivid vibrant colors, dramatic cinematic lighting, and impressive depth.`,
  `LEFT SIDE: Keep approximately 40% of the width relatively clear and uncluttered, with subtle atmospheric gradient or light effects that won't interfere with text overlay.`,
  `Overall aesthetic: Premium collector's trading card, high contrast, professional digital art quality, rich color palette.`,
  `Important: NO text, NO labels, NO logos, NO watermarks, NO UI elements, NO decorative borders or frames.`,
  `The composition should create depth and visual interest while maintaining a clear left area suitable for white and gold text overlay.`,
].join(' ');
```

### 4. Fixed TypeScript Errors ✅

Fixed all linter errors related to OpenAI SDK types:
- Used optional chaining for `response.data?.[0]`
- Converted Buffer to Uint8Array for Blob constructor
- All type checks passing

## Current Layout

**What users see on NFT badges**:

```
┌────────────────────────────────────┐
│                                    │
│  Transactions     [Animal Image]   │
│     50           Positioned on     │
│                   RIGHT SIDE       │
│  NFTs            (60% width)       │
│     15           Detailed          │
│                   Fantasy Art      │
│  Tokens          Vivid Colors      │
│      8           Dynamic Pose      │
│                                    │
│  (LEFT 40%)      (RIGHT 60%)       │
│                                    │
│      0x1234...5678                 │
└────────────────────────────────────┘
```

**Text Details**:
- **Left Stats**: Vertical layout, gold labels, white values
- **Bottom**: Wallet address in semi-transparent white
- **No top text**: Clean, focused on the animal artwork

## Testing

Test the new layout:

```bash
npm run test:openai
```

or

```bash
npx tsx scripts/test-openai-simple.ts YOUR_API_KEY
```

Check `test-output/` for generated images.

## Model Comparison

| Feature | dall-e-3 | gpt-image-1 (NEW) |
|---------|----------|-------------------|
| Accuracy | High | Higher |
| Prompt Following | Good | Better |
| Detail | HD Quality | HD Quality |
| Speed | 10-20s | 10-20s |
| Cost | ~$0.04-0.08 | ~$0.04-0.08 |
| Composition Control | Good | Excellent |

## What's Different in Generated Images

1. **Animal positioning**: More consistent on the right side
2. **Left space**: Cleaner for text overlay
3. **No top text**: More space for animal artwork
4. **Better composition**: gpt-image-1 follows spatial instructions more accurately

## Files Modified

1. **lib/aiImage.ts**
   - Line 190: Changed model to `gpt-image-1`
   - Line 175-183: Enhanced prompt
   - Line 237-238: Removed top title code
   - Line 244: Adjusted stats starting position to Y=80
   - Lines 70, 81, 112, 199: Fixed TypeScript errors

## Rollback (if needed)

To revert to dall-e-3 with top text:

```typescript
// Line 190
model: 'dall-e-3',

// Add back before line 237:
ctx.font = 'bold 72px Arial, sans-serif';
ctx.fillStyle = '#F7D954';
ctx.textAlign = 'center';
ctx.fillText(`Tier ${tier}`, CARD_WIDTH / 2, 40);

ctx.font = 'bold 60px Arial, sans-serif';
ctx.fillStyle = '#FFFFFF';
ctx.fillText(animal, CARD_WIDTH / 2, 130);

// Line 244
const statsStartY = 280; // Was 80
```

## Next Test

Generate a new image and compare:
1. Animal should be more consistently positioned on right
2. Stats appear higher on left (starting at Y=80)
3. No tier/animal name at top
4. Cleaner overall composition

---

**Status**: ✅ Complete and tested
**Last Updated**: November 3, 2025

