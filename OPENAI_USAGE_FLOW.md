# OpenAI Usage in Image Generation

## Current Status: ✅ ENABLED

- `USE_OPENAI_IMAGE=true` ✅
- `OPENAI_API_KEY` is set ✅

## Where OpenAI is Used

### Flow in `lib/imageGenerator.ts`:

1. **Line 22-34**: First tries `generateAICardWithText()`
   - **Only if** `USE_OPENAI_TEXT=true` (currently not set)
   - Generates full card with text baked in by OpenAI
   - Returns early if successful

2. **Line 43**: Then tries `generateAIAnimalImage(animal, tier, referenceImage)`
   - **Only if** `USE_OPENAI_IMAGE=true` ✅ (YOU HAVE THIS ENABLED)
   - Uses OpenAI to generate the background image
   - **If referenceImage is provided**: Uses OpenAI's `/v1/images/edits` endpoint
   - **If no referenceImage**: Uses OpenAI's `/v1/images/generations` endpoint
   - Returns the generated background

3. **Line 52-94**: Falls back to local images if OpenAI fails or is disabled
   - Uses images from `public/images/{animal}.png`

## OpenAI API Calls (in `lib/aiImage.ts`)

### `generateAIAnimalImage()` - Lines 30-101

**With Reference Image** (lines 30-101):
- Calls: `https://api.openai.com/v1/images/edits`
- Uses: OpenAI's image-to-image editing
- When: `referenceImage` parameter is provided
- Endpoint: `/v1/images/edits`
- Method: POST with FormData

**Without Reference Image** (lines 104-140):
- Calls: `https://api.openai.com/v1/images/generations`
- Uses: OpenAI's text-to-image generation
- When: No `referenceImage` provided
- Endpoint: `/v1/images/generations`
- Method: POST with JSON

### `generateAICardWithText()` - Lines 164-236

- Calls: `https://api.openai.com/v1/images/generations`
- Only if: `USE_OPENAI_TEXT=true` (currently not enabled)
- Generates: Full card with text baked in

## Why Your Test Used OpenAI

Your test image was generated with:
- ✅ `USE_OPENAI_IMAGE=true` - So OpenAI was called
- ❌ No `referenceImage` provided - So it used text-to-image generation
- Endpoint: `/v1/images/generations` (not edits)

## To Use Reference Images with OpenAI

When you provide a `referenceImage`, it will:
1. Use OpenAI's `/v1/images/edits` endpoint
2. Take your reference image
3. Transform it based on the prompt (animal + tier styling)
4. Generate a new image inspired by your reference

Example:
```powershell
# Add referenceImage to the request body
$body = @{
    stats = @{...}
    referenceImage = "data:image/png;base64,YOUR_IMAGE_BASE64"
}
```

## Current Behavior

✅ **Your setup**: OpenAI text-to-image generation is ACTIVE
- Generates background images via OpenAI
- Then overlays stats/text using Canvas
- Falls back to local images if OpenAI fails

🔲 **Not active**: `USE_OPENAI_TEXT=true` (full card generation)
- Would generate entire card including text
- Currently disabled, using Canvas overlay instead
