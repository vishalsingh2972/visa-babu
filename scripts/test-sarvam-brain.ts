import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;

if (!SARVAM_API_KEY) {
  console.error('❌ Missing SARVAM_API_KEY in .env file');
  process.exit(1);
}

// Simulated Indian English Candidate Answer (Vague vs Technical Test)
const candidateResponse = "Sir actually in my project we used Redis cache ahead of database to reduce latency and handle high load.";

async function testSarvamBrain() {
  console.log('🧠 Testing Sarvam-105B Brain Evaluation Stream...\n');
  const startTime = Date.now();

  try {
    const response = await axios.post(
      'https://api.sarvam.ai/v1/chat/completions',
      {
        model: 'sarvam-105b-conversations',
        messages: [
          {
            role: 'system',
            content: `You are an elite technical visa/interview officer. 
Evaluate the candidate's answer strictly based on TECHNICAL LOGIC and ARCHITECTURAL DEPTH.
IGNORE non-native Indian English accent quirks, grammar mistakes, or colloquialisms.

Return output strictly in JSON format:
{
  "technical_score": number (0 to 100),
  "voice_mode": "officer_british" | "indic_local",
  "feedback": "Short direct response to candidate (15 words max)"
}`
          },
          {
            role: 'user',
            content: candidateResponse
          }
        ],
        temperature: 0.2
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': SARVAM_API_KEY
        }
      }
    );

    const ttft = Date.now() - startTime;
    console.log(`⚡ Response Time: ${ttft} ms`);
    console.log('📄 Evaluation Output:');
    console.log(response.data.choices[0].message.content);

  } catch (error: any) {
    console.error('❌ Error hitting Sarvam API:', error.response?.data || error.message);
  }
}

testSarvamBrain();