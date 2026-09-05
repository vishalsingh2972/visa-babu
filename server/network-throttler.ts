import { EventEmitter } from 'events';

export interface NetworkConfig {
  bandwidthLimitKbps: number; // e.g. 300 kbps for 3G
  latencyMs: number;          // e.g. 200 ms ping
  packetLossRate: number;     // e.g. 0.05 for 5% drop rate
  codec: 'pcm' | 'opus';
}

export interface MetricSnapshot {
  totalBytesSent: number;
  totalPacketsSent: number;
  packetsDropped: number;
  bufferUnderruns: number;
  effectiveBandwidthKbps: number;
}

export class NetworkThrottler extends EventEmitter {
  private config: NetworkConfig;
  private queue: { data: Buffer; timestamp: number }[] = [];
  private metrics: MetricSnapshot = {
    totalBytesSent: 0,
    totalPacketsSent: 0,
    packetsDropped: 0,
    bufferUnderruns: 0,
    effectiveBandwidthKbps: 0
  };
  private startTime: number = Date.now();

  constructor(config: Partial<NetworkConfig> = {}) {
    super();
    this.config = {
      bandwidthLimitKbps: config.bandwidthLimitKbps ?? 300,
      latencyMs: config.latencyMs ?? 200,
      packetLossRate: config.packetLossRate ?? 0.05,
      codec: config.codec ?? 'pcm'
    };
  }

  public updateConfig(newConfig: Partial<NetworkConfig>) {
    this.config = { ...this.config, ...newConfig };
    console.log(`📡 [NetworkThrottler] Config Updated:`, this.config);
  }

  /**
   * Simulates packet loss, latency jitter, and bandwidth limits
   */
  public pushAudioChunk(pcmChunk: Buffer) {
    // 1. Packet Loss Simulation
    if (Math.random() < this.config.packetLossRate) {
      this.metrics.packetsDropped++;
      this.emit('packet_dropped', { size: pcmChunk.byteLength });
      return; // Packet lost in transit
    }

    // 2. Codec Overhead Simulation
    // Raw PCM = 24000 samples/s * 16 bits = 384 kbps
    // Opus compression ~ 32 kbps (approx. 12:1 compression ratio)
    let finalChunk = pcmChunk;
    if (this.config.codec === 'opus') {
      const compressedSize = Math.max(8, Math.floor(pcmChunk.byteLength / 12));
      finalChunk = pcmChunk.subarray(0, compressedSize);
    }

    // 3. Bandwidth Throttling Delay Calculation
    // Time needed to transmit payload at target Kbps
    const payloadBits = finalChunk.byteLength * 8;
    const transmissionDelayMs = (payloadBits / (this.config.bandwidthLimitKbps * 1024)) * 1000;
    
    // Total simulated network transit time = Artificial Ping + Transmission Delay
    const totalDelayMs = this.config.latencyMs + transmissionDelayMs;

    const deliveryTime = Date.now() + totalDelayMs;
    this.queue.push({ data: finalChunk, timestamp: deliveryTime });

    // Schedule delivery
    setTimeout(() => {
      this.processQueue();
    }, totalDelayMs);
  }

  private processQueue() {
    const now = Date.now();
    while (this.queue.length > 0 && this.queue[0] && this.queue[0].timestamp <= now) {
      const item = this.queue.shift();
      if (item) {
        this.metrics.totalBytesSent += item.data.byteLength;
        this.metrics.totalPacketsSent++;
        
        const elapsedTimeSec = (Date.now() - this.startTime) / 1000 || 1;
        this.metrics.effectiveBandwidthKbps = Number(
          ((this.metrics.totalBytesSent * 8) / (elapsedTimeSec * 1024)).toFixed(2)
        );

        this.emit('audio_frame', {
          data: item.data,
          codec: this.config.codec,
          metrics: { ...this.metrics }
        });
      }
    }
  }

  public getMetrics(): MetricSnapshot {
    return { ...this.metrics };
  }
}