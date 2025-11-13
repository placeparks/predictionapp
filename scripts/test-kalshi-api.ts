import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { createSign } from 'crypto';

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const KALSHI_API_BASE = process.env.KALSHI_API_URL || 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_DEMO_API_BASE = 'https://demo-api.kalshi.co/trade-api/v2';

/**
 * Generate authentication signature using RSA private key
 */
function generateSignature(
  method: string,
  path: string,
  body: string,
  timestamp: string,
  privateKey: string
): string {
  const message = timestamp + method.toUpperCase() + path + body;
  const sign = createSign('RSA-SHA256');
  sign.update(message);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

async function testKalshiAuth() {
  console.log('🔍 Testing Kalshi API Configuration...\n');
  
  // Check environment variables
  console.log('Environment Variables Check:');
  console.log('----------------------------');
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;
  const email = process.env.KALSHI_EMAIL;
  const password = process.env.KALSHI_PASSWORD;
  const apiUrl = process.env.KALSHI_API_URL;
  
  console.log(`KALSHI_API_KEY_ID: ${apiKeyId ? '✅ Set' : '❌ Not set'}`);
  console.log(`KALSHI_PRIVATE_KEY: ${privateKey ? `✅ Set (${privateKey.length} chars)` : '❌ Not set'}`);
  console.log(`KALSHI_EMAIL: ${email ? '✅ Set' : '❌ Not set'}`);
  console.log(`KALSHI_PASSWORD: ${password ? `✅ Set (${password.length} chars)` : '❌ Not set'}`);
  console.log(`KALSHI_API_URL: ${apiUrl || 'Using default production URL'}\n`);

  const hasApiKey = apiKeyId && privateKey;
  const hasEmailPassword = email && password;

  if (!hasApiKey && !hasEmailPassword) {
    console.log('❌ Error: No valid authentication method configured!');
    console.log('\n📝 You need EITHER:');
    console.log('\n   Option 1 - API Key Authentication (Recommended):');
    console.log('   KALSHI_API_KEY_ID=your_api_key_id');
    console.log('   KALSHI_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"');
    console.log('\n   Option 2 - Email/Password Authentication:');
    console.log('   KALSHI_EMAIL=your_email@example.com');
    console.log('   KALSHI_PASSWORD=your_password\n');
    return;
  }

  // Determine which auth method to use
  const authMethod = hasApiKey ? 'API Key' : 'Email/Password';
  console.log(`🔐 Testing Authentication (${authMethod})...`);
  console.log('----------------------------\n');
  
  try {
    const useDemo = false;
    const baseUrl = useDemo ? KALSHI_DEMO_API_BASE : KALSHI_API_BASE;
    
    console.log(`Attempting login to: ${baseUrl}`);
    
    let response;

    // Try API key authentication first
    if (hasApiKey) {
      console.log('Using API Key authentication...\n');
      
      const path = '/trade-api/v2/login';
      const timestamp = Date.now().toString();
      const signature = generateSignature('POST', path, '', timestamp, privateKey!);

      response = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'KALSHI-ACCESS-KEY': apiKeyId!,
          'KALSHI-ACCESS-SIGNATURE': signature,
          'KALSHI-ACCESS-TIMESTAMP': timestamp
        }
      });
    } 
    // Fall back to email/password
    else if (hasEmailPassword) {
      console.log('Using Email/Password authentication...\n');
      
      response = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
    } else {
      throw new Error('No authentication method available');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.log(`❌ Authentication failed (${response.status})`);
      console.log('Error details:', JSON.stringify(error, null, 2));
      
      if (hasApiKey) {
        console.log('\n💡 Troubleshooting Tips:');
        console.log('   1. Verify your API key ID is correct');
        console.log('   2. Ensure private key includes BEGIN/END markers');
        console.log('   3. Check for newline characters (\\n) in private key');
        console.log('   4. Make sure the private key is in PEM format');
      }
      return;
    }

    const data = await response.json();
    console.log('✅ Authentication successful!');
    console.log(`   Auth Method: ${authMethod}`);
    console.log(`   Token: ${data.token?.substring(0, 20)}...`);
    console.log(`   Member ID: ${data.member_id || 'N/A'}\n`);

    // Test fetching markets
    console.log('📊 Testing Markets API...');
    console.log('----------------------------');
    
    const marketsResponse = await fetch(`${baseUrl}/markets?limit=5&status=open`, {
      headers: {
        'Authorization': `Bearer ${data.token}`,
        'Accept': 'application/json'
      }
    });

    if (!marketsResponse.ok) {
      const error = await marketsResponse.json().catch(() => ({}));
      console.log(`❌ Markets fetch failed (${marketsResponse.status})`);
      console.log('Error details:', JSON.stringify(error, null, 2));
      return;
    }

    const marketsData = await marketsResponse.json();
    console.log(`✅ Successfully fetched ${marketsData.markets?.length || 0} markets\n`);
    
    if (marketsData.markets && marketsData.markets.length > 0) {
      console.log('📈 Sample Markets:');
      marketsData.markets.slice(0, 3).forEach((market: any, i: number) => {
        console.log(`\n   ${i + 1}. ${market.title}`);
        console.log(`      Ticker: ${market.ticker}`);
        console.log(`      Category: ${market.category}`);
        console.log(`      Yes Price: ${market.yes_bid || 'N/A'}¢`);
        console.log(`      Volume: $${market.volume || 0}`);
      });
    }

    console.log('\n✅ All tests passed! Your Kalshi API is configured correctly.\n');
    console.log('🚀 Next step: Run "npm run dev" and click the Predictions tab!\n');

  } catch (error) {
    console.log('❌ Test failed with error:');
    console.error(error);
    
    if (error instanceof Error) {
      console.log('\n💡 Error details:', error.message);
    }
  }
}

testKalshiAuth();

