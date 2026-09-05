export class PCMStreamPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private sampleRate: number;
  private queuedSources: AudioBufferSourceNode[] = [];
  private receivedFrames = 0;
  public expectedFrames = 0;
  private streamEndTimeout: ReturnType<typeof setTimeout> | null = null;
  private analyserNode: AnalyserNode | null = null;

  public onEnded: (() => void) | null = null;

  public getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  public getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
  }

  private initContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRate });
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.7;
      this.analyserNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Accepts Base64 encoded 16-bit PCM mono audio chunk and queues it for continuous playback
   */
  public playChunk(base64Data: string) {
    this.initContext();
    if (!this.audioCtx) return;

    this.receivedFrames++;

    // Decode Base64 to Int16 Array
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);

    // Convert Int16 PCM (-32768 to 32767) to Normalized Float32 (-1.0 to 1.0)
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    // Create Audio Buffer
    const buffer = this.audioCtx.createBuffer(1, float32Array.length, this.sampleRate);
    buffer.getChannelData(0).set(float32Array);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyserNode!);

    // Schedule playback seamlessly
    const currentTime = this.audioCtx.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    // Track the scheduled end time for this source
    const scheduledEndTime = this.nextStartTime + buffer.duration;
    source.onended = () => {
      const sourceIndex = this.queuedSources.indexOf(source);
      if (sourceIndex !== -1) {
        this.queuedSources.splice(sourceIndex, 1);
      }

      // Only fire onEnded if we've received and played all expected frames
      if (
        this.expectedFrames > 0 &&
        this.queuedSources.length === 0 &&
        this.onEnded
      ) {
        if (this.receivedFrames >= this.expectedFrames) {
          this.fireOnEnded();
        } else {
          // Some frames may have been dropped by network throttling.
          // Start fallback timer to fire onEnded after 4s grace period.
          if (this.streamEndTimeout) clearTimeout(this.streamEndTimeout);
          this.streamEndTimeout = setTimeout(() => {
            if (this.queuedSources.length === 0 && this.onEnded) {
              this.fireOnEnded();
            }
          }, 4000);
        }
      }
    };

    source.start(this.nextStartTime);
    this.nextStartTime = scheduledEndTime;
    this.queuedSources.push(source);
  }

  private fireOnEnded() {
    if (!this.onEnded) return;
    const cb = this.onEnded;
    // Reset counters for the next stream
    this.receivedFrames = 0;
    this.expectedFrames = 0;
    if (this.streamEndTimeout) {
      clearTimeout(this.streamEndTimeout);
      this.streamEndTimeout = null;
    }
    cb();
  }

  /**
   * Signal that the current stream is complete.
   * The onEnded callback will fire once all expected frames have finished playing.
   */
  public markStreamEnd(expectedTotalFrames?: number) {
    if (expectedTotalFrames !== undefined) {
      this.expectedFrames = expectedTotalFrames;
    }

    // If no chunks are queued and we have the expected frame count, fire onEnded immediately
    if (
      this.queuedSources.length === 0 &&
      this.expectedFrames > 0 &&
      this.receivedFrames >= this.expectedFrames &&
      this.onEnded
    ) {
      this.fireOnEnded();
      return;
    }

    // Fallback: in case network throttling drops some frames and receivedFrames never reaches
    // expectedFrames, fire onEnded after a 4-second grace period if all audio has finished playing.
    if (this.queuedSources.length === 0 && this.expectedFrames > 0 && this.onEnded) {
      if (this.streamEndTimeout) clearTimeout(this.streamEndTimeout);
      this.streamEndTimeout = setTimeout(() => {
        if (this.queuedSources.length === 0 && this.onEnded) {
          this.fireOnEnded();
        }
      }, 4000);
    }
  }

  public stop() {
    if (this.audioCtx) {
      // Stop all active sources to immediately halt playback
      for (const source of this.queuedSources) {
        try {
          source.stop();
        } catch (e) {
          // Already stopped
        }
      }
      this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.streamEndTimeout) {
      clearTimeout(this.streamEndTimeout);
      this.streamEndTimeout = null;
    }
    this.queuedSources = [];
    this.nextStartTime = 0;
    this.receivedFrames = 0;
    this.expectedFrames = 0;
    // Don't null onEnded - it should persist for new sessions
  }
}