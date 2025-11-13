import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

console.log('Testing KALSHI_API_KEY environment variable...\n');

const kalshiApiKey = process.env.KALSHI_API_KEY;

if (kalshiApiKey) {
  console.log('✅ KALSHI_API_KEY is set');
  console.log(`   Length: ${kalshiApiKey.length} characters`);
  console.log(`   First 8 chars: ${kalshiApiKey.substring(0, 8)}...`);
  console.log(`   Last 8 chars: ...${kalshiApiKey.substring(kalshiApiKey.length - 8)}`);
  console.log('\n✅ Environment variable is configured correctly!');
} else {
  console.log('❌ KALSHI_API_KEY is NOT set');
  console.log('   Please add KALSHI_API_KEY to your .env.local file');
  process.exit(1);
}




