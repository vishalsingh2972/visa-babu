import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080/ws/eval';

// Five sequential candidate responses to test full conversation + final verdict
const responses = [
  'Good morning officer. My name is Vishal and I am applying for an H-1B visa. I work as a full-stack engineer where I built a real-time event-driven architecture using Fastify and Redis for our payment processing system.',
  'We used Redis as a distributed cache layer with LRU eviction in front of our PostgreSQL database. This reduced our P99 read latency from 450ms to 18ms under peak load of about 50k RPM.',
  'Yes we also implemented WebSocket-based streaming for real-time notification delivery to over 10,000 concurrent users, using a horizontal scaling approach with a Redis pub-sub layer.',
  'We handled consistency by using write-through caching with Redis and PostgreSQL in sync via CDC (change data capture). This ensured stale data never exceeding 100ms window.',
  'For scaling, we horizontally scaled the Fastify services behind an NGINX load balancer, with Redis watching for hot-shard redistribution. Our auto-scaling handled bursts from 5 to 30 instances within 90 seconds.'
];

async function testMultiTurn() {
  console.log('🧪 Testing Multi-Turn Conversation (Round 1-3)...\n');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✅ Connected to server');
    // Trigger officer greeting first
    console.log('\n--- Sending start_session ---');
    ws.send(JSON.stringify({ type: 'start_session' }));
  });

  let roundIndex = 0;
  let receivedRound = false;
  let playedAllAudio = false;

  ws.on('message', (data: Buffer) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'greeting_ready') {
      console.log(`🎙️ Greeting ready (${msg.latencyMs}ms, ${msg.byteLength} bytes)`);
      // Wait a bit for greeting audio to stream, then send first answer
      setTimeout(() => sendNextResponse(ws), 2000);
    }

    if (msg.type === 'eval_verdict') {
      receivedRound = true;
      playedAllAudio = false;
      console.log(`\n📊 ROUND ${msg.conversationRound} VERDICT:`);
      console.log(`   Score: ${msg.evalResult.technical_score}/100`);
      console.log(`   Voice Mode: ${msg.evalResult.voice_mode}`);
      console.log(`   Follow-up: ${msg.evalResult.follow_up_question}`);
      console.log(`   Officer Says: "${msg.evalResult.feedback}"`);
      console.log(`   Latency: ${msg.latencyMs}ms`);
    }

    if (msg.type === 'stream_complete' && !playedAllAudio) {
      playedAllAudio = true;
      // Wait for officer audio to finish streaming before next round
      setTimeout(() => {
        roundIndex++;
        if (roundIndex < responses.length) {
          console.log(`\n--- Sending Round ${roundIndex + 1} response ---`);
          ws.send(JSON.stringify({ type: 'submit_transcript', transcript: responses[roundIndex] }));
        } else {
          console.log('\n✅ Multi-turn conversation test COMPLETE (5 rounds)');
          setTimeout(() => ws.close(), 1000);
        }
      }, 3000); // Simulate response time + officer audio playback
    }
  });

  ws.on('close', () => {
    console.log('\n🔌 Connection closed');
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });

  function sendNextResponse(ws: WebSocket) {
    if (roundIndex < responses.length) {
      console.log(`--- Sending Round ${roundIndex + 1} response ---`);
      ws.send(JSON.stringify({ type: 'submit_transcript', transcript: responses[roundIndex] }));
    }
  }
}

testMultiTurn();