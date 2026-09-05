import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080/ws/eval';
const socket = new WebSocket(WS_URL);

let requestStartTime = 0;
let receivedChunks = 0;
let totalBytes = 0;

socket.on('open', () => {
  console.log('✅ [Client] Connected to WebSocket server');

  const candidateTranscript =
    'Sir actually we implemented Redis caching with LRU eviction ahead of PostgreSQL database, reducing read latency by 40 percent under high traffic spikes.';

  console.log(`📤 [Client] Sending transcript: "${candidateTranscript}"\n`);
  requestStartTime = Date.now();

  socket.send(
    JSON.stringify({
      type: 'submit_transcript',
      transcript: candidateTranscript
    })
  );
});

socket.on('message', (raw: Buffer) => {
  const msg = JSON.parse(raw.toString());

  if (msg.type === 'eval_verdict') {
    const elapsed = Date.now() - requestStartTime;
    console.log(`🧠 [Verdict Received in ${elapsed} ms]`);
    console.log(`   • Score: ${msg.evalResult.technical_score}/100`);
    console.log(`   • Voice Mode: ${msg.evalResult.voice_mode}`);
    console.log(`   • Feedback: "${msg.evalResult.feedback}"\n`);
  }

  if (msg.type === 'tts_generated') {
    console.log(`🎙 [TTS Ready] Engine: ${msg.engineUsed} | Latency: ${msg.latencyMs} ms`);
    console.log(`📡 Streaming audio frames through network throttler...\n`);
  }

  if (msg.type === 'audio_chunk') {
    receivedChunks++;
    const chunkBytes = Buffer.from(msg.payloadBase64, 'base64').byteLength;
    totalBytes += chunkBytes;

    if (receivedChunks === 1) {
      const ttfb = Date.now() - requestStartTime;
      console.log(`⚡ [TTFB] First audio frame received in ${ttfb} ms total end-to-end!`);
    }

    process.stdout.write(`\r📦 Frame #${receivedChunks} received (${chunkBytes} bytes) | Effective Bandwidth: ${msg.metrics.effectiveBandwidthKbps} Kbps`);
  }

  if (msg.type === 'network_event' && msg.event === 'packet_dropped') {
    console.log(`\n⚠️ [Network Alert] Simulated packet drop (${msg.size} bytes lost)`);
  }
});

socket.on('close', () => {
  console.log('\n\n🔌 [Client] Connection closed.');
});

socket.on('error', (err) => {
  console.error('❌ [Client Error]', err);
});