import { NetworkThrottler } from '../server/network-throttler.js';

console.log('🧪 Running Day 2 Network Throttling & Codec Benchmark...\n');

// Mock 3-second PCM audio buffer (24kHz, 16-bit mono = 48,000 bytes/sec)
const sampleRate = 24000;
const bytesPerSample = 2; // 16-bit
const pcmChunkSize = (sampleRate * bytesPerSample * 0.02); // 20ms frame = 960 bytes
const totalFrames = 150; // 3 seconds worth of frames

function runCodecSimulation(codecName: 'pcm' | 'opus') {
  return new Promise<void>((resolve) => {
    console.log(`====================================================`);
    console.log(`▶ TESTING CODEC: ${codecName.toUpperCase()} under 3G Throttling (300 kbps, 200ms latency, 5% packet loss)`);
    console.log(`====================================================`);

    const throttler = new NetworkThrottler({
      bandwidthLimitKbps: 300,
      latencyMs: 200,
      packetLossRate: 0.05,
      codec: codecName
    });

    let receivedFrames = 0;
    const dummyPCMFrame = Buffer.alloc(pcmChunkSize, 0x12); // Mock PCM audio data

    throttler.on('audio_frame', ({ data, metrics }) => {
      receivedFrames++;
      process.stdout.write(
        `\r📦 Frames Received: ${receivedFrames}/${totalFrames} | Bytes Sent: ${metrics.totalBytesSent} B | Bandwidth: ${metrics.effectiveBandwidthKbps} Kbps | Drops: ${metrics.packetsDropped}`
      );

      if (receivedFrames + metrics.packetsDropped >= totalFrames) {
        console.log(`\n\n✅ ${codecName.toUpperCase()} Benchmark Complete:`);
        console.log(`   • Total Bytes Transmitted: ${metrics.totalBytesSent} bytes`);
        console.log(`   • Packets Dropped (5% loss): ${metrics.packetsDropped}`);
        console.log(`   • Effective Bandwidth Used: ${metrics.effectiveBandwidthKbps} Kbps\n`);
        resolve();
      }
    });

    // Simulate real-time mic/TTS frame emission every 20ms
    let frameIndex = 0;
    const interval = setInterval(() => {
      throttler.pushAudioChunk(dummyPCMFrame);
      frameIndex++;
      if (frameIndex >= totalFrames) {
        clearInterval(interval);
      }
    }, 20);
  });
}

async function executeBenchmark() {
  await runCodecSimulation('pcm');
  await runCodecSimulation('opus');
  console.log('🎉 Day 2 Network Throttler & Codec Benchmark Complete!');
}

executeBenchmark();