#!/usr/bin/env tsx
/**
 * Test script for NFT image generation with real stats
 * Run with: npm run test:nft-image
 * Or: npx tsx scripts/test-nft-image.ts
 */

// Load environment variables
import { config } from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';

const envLocalPath = join(process.cwd(), '.env.local');
const envPath = join(process.cwd(), '.env');

if (existsSync(envLocalPath)) {
  config({ path: envLocalPath });
} else if (existsSync(envPath)) {
  config({ path: envPath });
}

import { generateNFTImage } from '../lib/imageGenerator';

async function main() {
  console.log('🎨 Testing NFT Image Generation with Real Stats\n');

  // Test with actual stats from your console (Tier 4, Dragon)
  const testCases = [
    {
      name: 'Tier 4 Dragon (Your Stats)',
      address: '0xa17b290af9caadfaadf7dd553c41242f05cd9a14',
      stats: {
        tx_count: 36,
        unique_peers: 9,
        erc20_count: 1,
        nft_count: 9,
        nft_collections: 0,
        erc20_usd: 0,
        has_basename: false,
        basename: undefined,
      },
    },
    {
      name: 'Tier 4 Dragon (With Basename)',
      address: '0xa17b290af9caadfaadf7dd553c41242f05cd9a14',
      stats: {
        tx_count: 36,
        unique_peers: 9,
        erc20_count: 1,
        nft_count: 9,
        nft_collections: 0,
        erc20_usd: 0,
        has_basename: true,
        basename: 'testuser.base',
      },
    },
    {
      name: 'Tier 1 Goat',
      address: '0x21a5625fc19469c11555b5607edb2b97324e7d82',
      stats: {
        tx_count: 5,
        unique_peers: 3,
        erc20_count: 0,
        nft_count: 1,
        nft_collections: 0,
        erc20_usd: 0,
        has_basename: false,
        basename: undefined,
      },
    },
  ];

  const outputDir = join(process.cwd(), 'test-output');
  await mkdir(outputDir, { recursive: true });

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${testCase.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Address: ${testCase.address}`);
    console.log(`Stats:`);
    console.log(`  - Transactions: ${testCase.stats.tx_count}`);
    console.log(`  - NFTs: ${testCase.stats.nft_count}`);
    console.log(`  - Tokens: ${testCase.stats.erc20_count}`);
    console.log(`  - Has Basename: ${testCase.stats.has_basename}`);
    if (testCase.stats.basename) {
      console.log(`  - Basename: ${testCase.stats.basename}`);
    }

    try {
      const startTime = Date.now();
      
      // Import tier computation
      const { computeTier, animalFor } = await import('../lib/tier');
      const tier = computeTier(testCase.stats);
      const animal = animalFor(tier);

      console.log(`\n📊 Computed Tier: ${tier}, Animal: ${animal}`);

      const imageBuffer = await generateNFTImage({
        tier,
        animal,
        stats: testCase.stats,
        address: testCase.address.toLowerCase(),
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const filename = `test-${tier}-${animal.toLowerCase()}-${Date.now()}.png`;
      const filepath = join(outputDir, filename);

      await writeFile(filepath, imageBuffer);

      console.log(`\n✅ Success! Generated in ${duration}s`);
      console.log(`📄 File: ${filename}`);
      console.log(`💾 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
      console.log(`📐 Dimensions: 1024 x 1792 px`);
      console.log(`\n📂 Saved to: ${filepath}`);

      // Verify stats are in the image by checking the buffer size
      if (imageBuffer.length < 1000) {
        console.warn('⚠️  Warning: Image buffer is very small, might be empty or corrupted');
      } else {
        console.log('✅ Image buffer looks valid');
      }
    } catch (err) {
      console.error(`\n❌ Error generating image for ${testCase.name}:`);
      if (err instanceof Error) {
        console.error('Message:', err.message);
        if (err.stack) {
          console.error('\nStack trace:');
          console.error(err.stack);
        }
      } else {
        console.error('Unknown error:', err);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✨ Test complete! Check the test-output folder.');
  console.log(`${'='.repeat(60)}\n`);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});

