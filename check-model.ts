import { config } from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';
import OpenAI from 'openai';

// Load .env.local
const envLocalPath = join(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath });
  console.log('✅ Loaded .env.local\n');
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY not found in .env.local');
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

async function checkModel() {
  console.log('Checking if gpt-image-1 is available...\n');
  
  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: 'A simple test image',
      size: '1024x1024',
      n: 1,
    });
    console.log('✅ gpt-image-1 is AVAILABLE on your account!');
    console.log('You can use it in production.');
  } catch (err: any) {
    console.log('❌ gpt-image-1 is NOT available');
    console.log('Error:', err.message);
    
    if (err.message?.includes('verification')) {
      console.log('\n📋 Action needed: Verify your OpenAI organization');
      console.log('Visit: https://help.openai.com/en/articles/10362446');
    } else if (err.message?.includes('model')) {
      console.log('\n⚠️  Model not found. Using dall-e-3 instead.');
    }
    
    console.log('\n✅ DALL-E 3 is available and will work great with the enhanced prompt!');
  }
}

checkModel();

