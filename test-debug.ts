import OpenAI from 'openai';

// Get API key from environment or hardcode temporarily
const apiKey = process.env.OPENAI_API_KEY || 'YOUR_KEY_HERE';

console.log('Testing OpenAI connection...');
console.log('API Key:', apiKey.substring(0, 20) + '...\n');

const openai = new OpenAI({ apiKey });

async function test() {
  try {
    console.log('Calling OpenAI with gpt-image-1...');
    
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: 'A majestic tiger on the right side, fantasy art style',
      size: '1024x1792',
      n: 1,
      response_format: 'b64_json',
      quality: 'hd',
      style: 'vivid',
    });

    console.log('Response received!');
    console.log('Data:', response.data?.[0] ? 'Image data present' : 'NO IMAGE DATA');
    
    if (response.data?.[0]?.b64_json) {
      console.log('✅ Success! Image generated');
      console.log('Size:', Buffer.from(response.data[0].b64_json, 'base64').length, 'bytes');
    } else {
      console.log('❌ No image data in response');
      console.log('Full response:', JSON.stringify(response, null, 2));
    }
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    if (err.error) {
      console.error('Error details:', err.error);
    }
  }
}

test();

