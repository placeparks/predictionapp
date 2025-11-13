#!/usr/bin/env tsx
/**
 * Simple OpenAI test - pass API key as argument
 * Run with: npx tsx scripts/test-openai-simple.ts YOUR_API_KEY
 */

import { generateAICardWithText } from '../lib/aiImage';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

async function main() {
  console.log('🎨 OpenAI Image Generation Test (Simple)\n');

  // Get API key from command line argument or environment
  const apiKey = process.argv[2] || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ ERROR: No API key provided\n');
    console.log('Usage:');
    console.log('  npx tsx scripts/test-openai-simple.ts YOUR_API_KEY');
    console.log('  npx tsx scripts/test-openai-simple.ts sk-proj-...\n');
    console.log('Or set environment variable:');
    console.log('  $env:OPENAI_API_KEY="sk-proj-..."; npm run test:openai\n');
    process.exit(1);
  }

  // Set it in process.env so the lib can use it
  process.env.OPENAI_API_KEY = apiKey;

  console.log('✅ API Key provided');
  console.log('🔑 Key preview:', apiKey.substring(0, 20) + '...\n');

  // Create output directory
  const outputDir = join(process.cwd(), 'test-output');
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }

  console.log(`📁 Output directory: ${outputDir}\n`);

  // Test with Tier 3 Tiger
  const testCase = {
    tier: 3,
    animal: 'Tiger',
    stats: {
      tx_count: 50,
      nft_count: 15,
      erc20_count: 8,
      has_basename: false,
    },
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
  };

  console.log(`${'='.repeat(60)}`);
  console.log(`🎯 Generating: Tier ${testCase.tier} - ${testCase.animal}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Stats:`);
  console.log(`  - Transactions: ${testCase.stats.tx_count}`);
  console.log(`  - NFTs: ${testCase.stats.nft_count}`);
  console.log(`  - Tokens: ${testCase.stats.erc20_count}`);
  console.log(`  - Address: ${testCase.address.slice(0, 6)}...${testCase.address.slice(-4)}`);

  try {
    const startTime = Date.now();
    console.log('\n⏳ Calling OpenAI DALL-E 3...');
    
    const imageBuffer = await generateAICardWithText(testCase);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!imageBuffer) {
      console.error('\n❌ Failed to generate image');
      console.log('Check the console for error messages from OpenAI');
      process.exit(1);
    }

    const filename = `test-tiger.png`;
    const filepath = join(outputDir, filename);
    await writeFile(filepath, imageBuffer);

    console.log(`\n✅ Success! Generated in ${duration}s`);
    console.log(`📄 File: ${filename}`);
    console.log(`💾 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`📐 Dimensions: 1024 x 1792 px`);
    console.log(`\n📂 Open: ${filepath}`);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✨ Test complete! Check the test-output folder.');
    console.log(`${'='.repeat(60)}\n`);
  } catch (err) {
    console.error('\n❌ Error:', err);
    if (err instanceof Error) {
      console.error('Message:', err.message);
      if (err.stack) {
        console.error('\nStack trace:');
        console.error(err.stack);
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});

