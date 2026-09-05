import dotenv from 'dotenv';
import { EvaluatorRouter } from '../server/evaluator-router.js';

dotenv.config();

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;

if (!SARVAM_API_KEY || !CARTESIA_API_KEY) {
  console.error('❌ Missing API keys in .env file');
  process.exit(1);
}

const router = new EvaluatorRouter(SARVAM_API_KEY, CARTESIA_API_KEY);

// Scenario A: Vague candidate answer
const scenarioA_Candidate = "Sir actually I want to go to US because I want big salary package and good life for my family.";

// Scenario B: Technical candidate answer in Indian English
const scenarioB_Candidate = "Sir actually we implemented Redis caching with LRU eviction ahead of PostgreSQL database, reducing read latency by 40 percent under high traffic spikes.";

async function runScenario(label: string, transcript: string) {
  console.log(`====================================================`);
  console.log(`▶ TESTING ${label}`);
  console.log(`====================================================`);
  console.log(`🗣 Candidate Transcript: "${transcript}"\n`);

  const evalStart = Date.now();
  const evalResult = await router.evaluateCandidate(transcript);
  const evalTime = Date.now() - evalStart;

  console.log(`🧠 [Sarvam-105B] Evaluation Time: ${evalTime} ms`);
  console.log(`   • Technical Score: ${evalResult.technical_score}/100`);
  console.log(`   • Voice Mode Selected: ${evalResult.voice_mode}`);
  console.log(`   • Evaluator Feedback: "${evalResult.feedback}"\n`);

  console.log(`🎙 Routing Feedback to TTS Engine...`);
  const ttsResult = await router.synthesizeRoutedSpeech(evalResult);
  console.log(`   • Engine Utilized: ${ttsResult.engineUsed}`);
  console.log(`   • TTS Generation Time: ${ttsResult.ttfbMs} ms`);
  console.log(`   • Audio Payload Delivered: ${ttsResult.audioBuffer.byteLength} bytes\n`);
}

async function executeDay3Tests() {
  await runScenario('SCENARIO A (Vague Candidate Answer)', scenarioA_Candidate);
  await runScenario('SCENARIO B (Structured Candidate Answer)', scenarioB_Candidate);
  console.log('✅ Day 3 Evaluation & Dynamic Routing Pipeline Tests Complete!');
}

executeDay3Tests();