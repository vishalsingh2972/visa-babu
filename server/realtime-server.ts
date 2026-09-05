import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { EvaluatorRouter } from './evaluator-router.js';
import { NetworkThrottler } from './network-throttler.js';

dotenv.config();

const SARVAM_API_KEY = process.env.SARVAM_API_KEY || '';
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || '';

if (!SARVAM_API_KEY || !CARTESIA_API_KEY) {
  console.error('❌ Missing required API keys in .env');
  process.exit(1);
}

const fastify: FastifyInstance = Fastify({ logger: false });
fastify.register(fastifyWebsocket);

const evaluatorRouter = new EvaluatorRouter(SARVAM_API_KEY, CARTESIA_API_KEY);

fastify.register(async function (app: FastifyInstance) {
  app.get('/ws/eval', { websocket: true }, (connection: any) => {
    // Standardize access across @fastify/websocket version variations
    const ws = connection.socket || connection;
    console.log('⚡ [Server] Client connected to /ws/eval');

    // Instantiate network throttler for simulated 3G network conditions
    const throttler = new NetworkThrottler({
      bandwidthLimitKbps: 300,
      latencyMs: 150,
      packetLossRate: 0.02,
      codec: 'pcm'
    });

    // Forward throttled audio chunks directly back to the client
    throttler.on('audio_frame', (frame: { codec: string; data: Buffer; metrics: any }) => {
      ws.send(
        JSON.stringify({
          type: 'audio_chunk',
          codec: frame.codec,
          payloadBase64: frame.data.toString('base64'),
          metrics: frame.metrics
        })
      );
    });

    throttler.on('packet_dropped', (info: { size: number }) => {
      ws.send(
        JSON.stringify({
          type: 'network_event',
          event: 'packet_dropped',
          size: info.size
        })
      );
    });

    ws.on('message', async (rawMessage: Buffer) => {
      try {
        const message = JSON.parse(rawMessage.toString());

        if (message.type === 'submit_transcript') {
          const startTime = Date.now();
          console.log(`\n📥 [Server] Received candidate response: "${message.transcript}"`);

          // 1. Run LLM Evaluation
          const evalResult = await evaluatorRouter.evaluateCandidate(message.transcript);
          const evalLatencyMs = Date.now() - startTime;

          // Notify client of LLM verdict before TTS begins
          ws.send(
            JSON.stringify({
              type: 'eval_verdict',
              evalResult,
              latencyMs: evalLatencyMs
            })
          );

          // 2. Synthesize audio output via routed TTS engine
          const ttsStart = Date.now();
          const ttsPayload = await evaluatorRouter.synthesizeRoutedSpeech(evalResult);
          const ttsLatencyMs = Date.now() - ttsStart;

          ws.send(
            JSON.stringify({
              type: 'tts_generated',
              engineUsed: ttsPayload.engineUsed,
              latencyMs: ttsLatencyMs,
              byteLength: ttsPayload.audioBuffer.byteLength
            })
          );

          // 3. Chunk audio payload into 20ms audio frames (960 bytes for 24kHz 16-bit mono PCM)
          const CHUNK_SIZE = 960;
          const buffer = ttsPayload.audioBuffer;

          for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
            const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
            throttler.pushAudioChunk(chunk);
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('❌ Error processing WS message:', errorMessage);
        ws.send(
          JSON.stringify({
            type: 'error',
            message: errorMessage
          })
        );
      }
    });

    ws.on('close', () => {
      console.log('🔌 [Server] Client disconnected');
    });
  });
});

const PORT = 8080;
fastify.listen({ port: PORT }, (err: Error | null) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`🚀 [Day 4 Server] Listening for streaming audio on ws://localhost:${PORT}/ws/eval`);
});