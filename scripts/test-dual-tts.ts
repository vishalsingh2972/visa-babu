import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;

if (!SARVAM_API_KEY || !CARTESIA_API_KEY) {
  console.error('❌ Missing API keys in .env file');
  process.exit(1);
}

// Test string 1: British Officer Voice (Cartesia Sonic)
const officerText = "Your caching logic is acceptable, but how do you handle key eviction under load?";

// Test string 2: Indic Local Voice (Sarvam Bulbul v3)
const indicText = "Your caching explanation is good, but please clarify how you sync data with database.";

async function testCartesiaSonic() {
  console.log('🇬🇧 Testing Cartesia Sonic 3.6 (British English Officer)...');
  const startTime = Date.now();

  try {
    const response = await axios.post(
      'https://api.cartesia.ai/tts/bytes',
      {
        model_id: 'sonic-3.6', // Cartesia Sonic 3.6 release
        transcript: officerText,
        voice: {
          mode: 'id',
          id: '7cf0e2b1-8daf-4fe4-89ad-f6039398f359' // "Benedict" - British Officer Voice
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 24000
        }
      },
      {
        headers: {
          'Cartesia-Version': '2024-06-10',
          'X-API-Key': CARTESIA_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    const ttfb = Date.now() - startTime;
    const buffer = Buffer.from(response.data);
    console.log(`  ⚡ Cartesia Sonic 3.6 TTFB: ${ttfb} ms | Audio Payload Size: ${buffer.byteLength} bytes`);
  } catch (err: any) {
    const errDetail = err.response?.data ? Buffer.from(err.response.data).toString() : err.message;
    console.error('  ❌ Cartesia Error:', errDetail);
  }
}

async function testSarvamBulbul() {
  console.log('\n🇮🇳 Testing Sarvam Bulbul v3 (Indic Local Voice)...');
  const startTime = Date.now();

  try {
    const response = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      {
        text: indicText,
        language_code: 'en-IN',
        speaker: 'shubh',
        model: 'bulbul:v3',
        speech_sample_rate: 24000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': SARVAM_API_KEY
        }
      }
    );

    const ttfb = Date.now() - startTime;
    const audioBase64 = response.data.audios?.[0] || '';
    const buffer = Buffer.from(audioBase64, 'base64');
    console.log(`  ⚡ Sarvam Bulbul TTFB: ${ttfb} ms | Audio Payload Size: ${buffer.byteLength} bytes`);
  } catch (err: any) {
    console.error('  ❌ Sarvam Bulbul Error:', err.response?.data || err.message);
  }
}

async function runDualTTSBenchmark() {
  console.log('🎙️ Starting Dual-TTS API Benchmark Test...\n');
  await testCartesiaSonic();
  await testSarvamBulbul();
  console.log('\n✅ Day 1 Task 1.3 Complete!');
}

runDualTTSBenchmark();