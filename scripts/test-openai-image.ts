#!/usr/bin/env tsx
/**
 * Test script for OpenAI image generation
 * Run with: npx tsx scripts/test-openai-image.ts
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';

// Try to load .env.local first, then .env
const envLocalPath = join(process.cwd(), '.env.local');
const envPath = join(process.cwd(), '.env');

if (existsSync(envLocalPath)) {
  console.log('📄 Loading .env.local...');
  config({ path: envLocalPath });
} else if (existsSync(envPath)) {
  console.log('📄 Loading .env...');
  config({ path: envPath });
} else {
  console.log('⚠️  No .env.local or .env file found');
}

import { generateAICardWithText } from '../lib/aiImage';
import { writeFile, mkdir } from 'fs/promises';

async function main() {
  console.log('🎨 Testing OpenAI Image Generation\n');

  // Check if OPENAI_API_KEY is set
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY environment variable is not set');
    console.log('\nPlease create a .env.local file in the project root with:');
    console.log('OPENAI_API_KEY=sk-proj-...\n');
    console.log('Or run with: OPENAI_API_KEY=sk-proj-... npm run test:openai\n');
    process.exit(1);
  }

  console.log('✅ OpenAI API Key found');
  console.log('🔑 Key preview:', process.env.OPENAI_API_KEY.substring(0, 20) + '...\n');

  // Test data for different tiers
  const testCases = [
    {
      tier: 1,
      animal: 'Goat',
      stats: {
        tx_count: 5,
        nft_count: 2,
        erc20_count: 3,
        has_basename: false,
      },
      address: '0x1234567890abcdef1234567890abcdef12345678',
    },
    {
      tier: 3,
      animal: 'Tiger',
      stats: {
        tx_count: 50,
        nft_count: 15,
        erc20_count: 8,
        has_basename: false,
      },
      address: '0xabcdef1234567890abcdef1234567890abcdef12',
    },
    {
      tier: 5,
      animal: 'Phoenix',
      stats: {
        tx_count: 300,
        nft_count: 50,
        erc20_count: 25,
        has_basename: true,
        basename: 'legendary.base',
      },
      address: '0xfedcba0987654321fedcba0987654321fedcba09',
    },
  ];

  // Create output directory
  const outputDir = join(process.cwd(), 'test-output');
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }

  console.log(`📁 Output directory: ${outputDir}\n`);

  // Generate images for each test case
  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 Generating: Tier ${testCase.tier} - ${testCase.animal}`);
    console.log(`${'='.repeat(60)}`);
    
    console.log(`📊 Stats:`);
    console.log(`  - Transactions: ${testCase.stats.tx_count}`);
    console.log(`  - NFTs: ${testCase.stats.nft_count}`);
    console.log(`  - Tokens: ${testCase.stats.erc20_count}`);
    if (testCase.stats.has_basename) {
      console.log(`  - Basename: ${testCase.stats.basename}`);
    }
    console.log(`  - Address: ${testCase.address.slice(0, 6)}...${testCase.address.slice(-4)}`);

    try {
      const startTime = Date.now();
      const imageBuffer = await generateAICardWithText(testCase);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (!imageBuffer) {
        console.error(`❌ Failed to generate image for ${testCase.animal}`);
        continue;
      }

      const filename = `tier-${testCase.tier}-${testCase.animal.toLowerCase()}.png`;
      const filepath = join(outputDir, filename);
      await writeFile(filepath, imageBuffer);

      console.log(`\n✅ Success! Generated in ${duration}s`);
      console.log(`📄 File: ${filename}`);
      console.log(`💾 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
      console.log(`📐 Dimensions: 1024 x 1792 px`);
    } catch (err) {
      console.error(`❌ Error generating image for ${testCase.animal}:`, err);
      if (err instanceof Error) {
        console.error(`   Message: ${err.message}`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✨ Test complete!');
  console.log(`${'='.repeat(60)}`);
  console.log(`\n📂 Check the output in: ${outputDir}`);
  console.log('\nYou should see:');
  testCases.forEach(tc => {
    console.log(`  - tier-${tc.tier}-${tc.animal.toLowerCase()}.png`);
  });
  console.log('\n');
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});

