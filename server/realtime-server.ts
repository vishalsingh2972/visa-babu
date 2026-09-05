import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { EvaluatorRouter } from './evaluator-router.js';
import type { ConversationMessage } from './evaluator-router.js';
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

    // Track conversation history per session
    let conversationHistory: ConversationMessage[] = [];
    const MAX_ROUNDS = 5; // After 5 candidate responses, officer gives final verdict

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

        if (message.type === 'start_session') {
          console.log(`\n🤝 [Server] Session started. Triggering Visa Officer initial greeting...`);

          const greetingStart = Date.now();
          const greetingPayload = await evaluatorRouter.synthesizeGreeting();
          const greetingLatencyMs = Date.now() - greetingStart;

          ws.send(
            JSON.stringify({
              type: 'greeting_ready',
              engineUsed: greetingPayload.engineUsed,
              latencyMs: greetingLatencyMs,
              byteLength: greetingPayload.audioBuffer.byteLength
            })
          );

          // Stream greeting audio chunks through the throttler (960 bytes = 20ms @ 24kHz PCM)
          const CHUNK_SIZE = 960;
          const buffer = greetingPayload.audioBuffer;

          for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
            const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
            throttler.pushAudioChunk(chunk);
          }

          // Signal end of greeting audio stream
          ws.send(
            JSON.stringify({
              type: 'stream_complete',
              streamKind: 'greeting',
              totalFrames: Math.ceil(buffer.length / CHUNK_SIZE)
            })
          );
        }

        if (message.type === 'submit_transcript') {
          const startTime = Date.now();
          const round = Math.floor(conversationHistory.length / 2) + 1;
          console.log(`\n📥 [Server] Received candidate response (Round ${round}/${MAX_ROUNDS}): "${message.transcript}"`);

          // 1. Run LLM Evaluation with full conversation context
          // On the MAX_ROUNDS round, the officer delivers the final verdict
          const evalResult = await evaluatorRouter.evaluateCandidate(
            message.transcript,
            conversationHistory,
            round
          );

          // Force final verdict on the last round if model didn't set it
          if (round >= MAX_ROUNDS && !evalResult.is_final) {
            evalResult.is_final = true;
            evalResult.voice_mode = 'officer_british';
            if (!evalResult.verdict) {
              // Determine verdict from average score
              const avgScore = evalResult.technical_score;
              evalResult.verdict = avgScore >= 75 ? 'APPROVED' : avgScore >= 55 ? 'CONDITIONAL' : 'NOT_CONVINCING';
            }
            evalResult.feedback = `This concludes our interview. Based on all of your responses, my decision is: ${evalResult.verdict}. ${
              evalResult.verdict === 'APPROVED'
                ? 'Your technical knowledge and consistency are impressive. I am recommending approval of your H-1B petition. Have a good day.'
                : evalResult.verdict === 'CONDITIONAL'
                ? 'The consulate requires additional documentation to verify your claims. You will receive further instructions.'
                : 'I am not convinced by the evidence presented in this interview. Your petition has been denied.'
            }`;
          }

          const evalLatencyMs = Date.now() - startTime;

          // Update conversation history
          conversationHistory.push({
            role: 'candidate',
            content: message.transcript
          });
          conversationHistory.push({
            role: 'officer',
            content: evalResult.feedback
          });

          // Notify client of LLM verdict before TTS begins
          ws.send(
            JSON.stringify({
              type: 'eval_verdict',
              evalResult,
              latencyMs: evalLatencyMs,
              conversationRound: round,
              maxRounds: MAX_ROUNDS
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

          // Signal end of this evaluation audio stream
          ws.send(
            JSON.stringify({
              type: 'stream_complete',
              streamKind: 'evaluation',
              totalFrames: Math.ceil(buffer.length / CHUNK_SIZE)
            })
          );
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