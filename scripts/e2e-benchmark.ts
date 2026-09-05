import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

interface BenchmarkResult {
  scenario: string;
  transcript: string;
  evalLatencyMs: number;
  ttsLatencyMs: number;
  ttfbMs: number;
  engineUsed: string;
  totalFrames: number;
  packetLosses: number;
}

const WS_URL = 'ws://localhost:8080/ws/eval';

const TEST_SCENARIOS = [
  {
    name: 'Scenario 1: High Technical Response (H-1B / O-1 Level)',
    transcript:
      'Sir, we implemented a distributed Redis cache with LRU eviction ahead of our PostgreSQL database cluster, reducing P99 latency from 450ms to 18ms.'
  },
  {
    name: 'Scenario 2: Code-Mixed Indic Response',
    transcript:
      'Actually sir, humne frontend setup ke liye Next.js 15 App Router use kiya hai, and state management ke liye Zustand setup kiya to keep latency under 200ms.'
  },
  {
    name: 'Scenario 3: Weak / Hesitant Answer',
    transcript:
      'Um, we just used a simple database and connected it to the React app. When traffic increased, we added another server.'
  }
];

async function runSingleBenchmark(scenario: { name: string; transcript: string }): Promise<BenchmarkResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const startTime = Date.now();

    let evalLatencyMs = 0;
    let ttsLatencyMs = 0;
    let ttfbMs = 0;
    let engineUsed = '-';
    let totalFrames = 0;
    let packetLosses = 0;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Benchmark timed out for ${scenario.name}`));
    }, 15000);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'submit_transcript',
          transcript: scenario.transcript
        })
      );
    });

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'eval_verdict') {
        evalLatencyMs = msg.latencyMs;
      }

      if (msg.type === 'tts_generated') {
        ttsLatencyMs = msg.latencyMs;
        engineUsed = msg.engineUsed;
      }

      if (msg.type === 'audio_chunk') {
        if (totalFrames === 0) {
          ttfbMs = Date.now() - startTime;
        }
        totalFrames++;
      }

      if (msg.type === 'network_event' && msg.event === 'packet_dropped') {
        packetLosses++;
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve({
        scenario: scenario.name,
        transcript: scenario.transcript,
        evalLatencyMs,
        ttsLatencyMs,
        ttfbMs,
        engineUsed,
        totalFrames,
        packetLosses
      });
    });

    // Close socket after streaming settles
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 6000);
  });
}

async function runSuite() {
  console.log('🚀 [Day 7] Starting End-to-End Latency & Telemetry Benchmark Suite...\n');
  const results: BenchmarkResult[] = [];

  for (const scenario of TEST_SCENARIOS) {
    console.log(`⏳ Running: ${scenario.name}`);
    try {
      const result = await runSingleBenchmark(scenario);
      results.push(result);
      console.log(`✅ Completed: TTFB=${result.ttfbMs}ms | Engine=${result.engineUsed}\n`);
    } catch (err: any) {
      console.error(`❌ Failed: ${err.message}\n`);
    }
  }

  console.log('================================================================================');
  console.log('                       E2E BENCHMARK SUMMARY REPORT                             ');
  console.log('================================================================================');
  console.table(
    results.map((r) => ({
      Scenario: r.scenario.split(':')[0],
      'LLM Latency (ms)': r.evalLatencyMs,
      'TTS Latency (ms)': r.ttsLatencyMs,
      'TTFB (ms)': r.ttfbMs,
      Engine: r.engineUsed,
      'Frames Recv': r.totalFrames,
      'Loss Events': r.packetLosses
    }))
  );

  const avgTTFB = Math.round(results.reduce((acc, r) => acc + r.ttfbMs, 0) / results.length);
  console.log(`\n📊 Average End-to-End TTFB: ${avgTTFB} ms`);
  console.log('================================================================================\n');
}

runSuite();