"use client";

import React, { useState, useEffect, useRef } from "react";
import { VoiceOrb, OrbState } from "@/components/VoiceOrb";
import { PCMStreamPlayer } from "@/lib/pcm-player";
import { AnalyticsModal } from "@/components/AnalyticsModal";
import {
  Mic,
  MicOff,
  Send,
  Wifi,
  Activity,
  ShieldAlert,
  Cpu,
  Volume2,
  BarChart3,
} from "lucide-react";

interface EvalVerdict {
  technical_score: number;
  voice_mode: "officer_british" | "indic_local";
  feedback: string;
}

interface TelemetryMetric {
  ttfb: number;
  evalLatency: number;
  ttsLatency: number;
  engineUsed: string;
  packetLosses: number;
}

export default function VoiceDashboard() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [verdict, setVerdict] = useState<EvalVerdict | null>(null);
  const [metrics, setMetrics] = useState({
    evalLatency: 0,
    ttsLatency: 0,
    ttfb: 0,
    framesReceived: 0,
    engineUsed: "-",
    effectiveBandwidth: 0,
    packetLosses: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<TelemetryMetric[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pcmPlayerRef = useRef<PCMStreamPlayer | null>(null);
  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Instantiate PCM Stream Player (24kHz sample rate)
    pcmPlayerRef.current = new PCMStreamPlayer(24000);

    // Instantiate WebSocket Connection
    const ws = new WebSocket("ws://localhost:8080/ws/eval");

    ws.onopen = () => {
      setIsConnected(true);
      console.log("Connected to Realtime Voice Server");
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "eval_verdict") {
        setVerdict(msg.evalResult);
        setMetrics((prev) => ({ ...prev, evalLatency: msg.latencyMs }));
        setOrbState("processing");
      }

      if (msg.type === "tts_generated") {
        setMetrics((prev) => ({
          ...prev,
          ttsLatency: msg.latencyMs,
          engineUsed: msg.engineUsed,
        }));
        setOrbState("speaking");
      }

      if (msg.type === "audio_chunk") {
        // Play incoming PCM chunk through Web Audio API
        if (pcmPlayerRef.current) {
          pcmPlayerRef.current.playChunk(msg.payloadBase64);
        }

        setMetrics((prev) => {
          const isFirstFrame = prev.framesReceived === 0;
          const calculatedTTFB = isFirstFrame
            ? Date.now() - startTimeRef.current
            : prev.ttfb;

          return {
            ...prev,
            framesReceived: prev.framesReceived + 1,
            ttfb: calculatedTTFB,
            effectiveBandwidth: msg.metrics?.effectiveBandwidthKbps || 0,
          };
        });
      }

      if (msg.type === "network_event" && msg.event === "packet_dropped") {
        setMetrics((prev) => ({
          ...prev,
          packetLosses: prev.packetLosses + 1,
        }));
      }
    };

    ws.onclose = () => setIsConnected(false);
    wsRef.current = ws;

    // Web Speech API Initialization for Mic Recording
    if (
      typeof window !== "undefined" &&
      ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    ) {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let currentTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (err: any) => console.error("Mic error:", err);
      recognitionRef.current = recognition;
    }

    return () => {
      ws.close();
      pcmPlayerRef.current?.stop();
    };
  }, []);

  // Save current turn's metrics to telemetry history once evaluation stream finishes
  useEffect(() => {
    if (metrics.ttfb > 0 && metrics.evalLatency > 0 && metrics.ttsLatency > 0) {
      setMetricsHistory((prev) => {
        // Prevent duplicate appending for the same frame batch
        const lastEntry = prev[prev.length - 1];
        if (
          lastEntry &&
          lastEntry.ttfb === metrics.ttfb &&
          lastEntry.evalLatency === metrics.evalLatency
        ) {
          return prev;
        }
        return [
          ...prev,
          {
            ttfb: metrics.ttfb,
            evalLatency: metrics.evalLatency,
            ttsLatency: metrics.ttsLatency,
            engineUsed: metrics.engineUsed,
            packetLosses: metrics.packetLosses,
          },
        ];
      });
    }
  }, [metrics]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Browser speech recognition is not supported in this browser. Try Chrome/Edge.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      setOrbState("idle");
    } else {
      setTranscript("");
      recognitionRef.current.start();
      setIsRecording(true);
      setOrbState("listening");
    }
  };

  const handleSubmit = () => {
    if (!wsRef.current || !transcript.trim()) return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    setOrbState("processing");
    setVerdict(null);
    setMetrics({
      evalLatency: 0,
      ttsLatency: 0,
      ttfb: 0,
      framesReceived: 0,
      engineUsed: "-",
      effectiveBandwidth: 0,
      packetLosses: 0,
    });

    startTimeRef.current = Date.now();
    wsRef.current.send(
      JSON.stringify({
        type: "submit_transcript",
        transcript,
      })
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 md:p-12 font-sans relative">
      {/* Header */}
      <header className="w-full max-w-5xl flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
            VISA-BABU // Live Voice Workbench
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsAnalyticsOpen(true)}
            className="flex items-center space-x-2 text-xs font-mono bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-300 px-3 py-1.5 rounded-full transition"
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Telemetry</span>
          </button>

          <div className="flex items-center space-x-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
            <Wifi className={`w-3.5 h-3.5 ${isConnected ? "text-emerald-400" : "text-rose-500"}`} />
            <span>{isConnected ? "WS CONNECTED (8080)" : "DISCONNECTED"}</span>
          </div>
        </div>
      </header>

      {/* Main Interactive Orb & Feedback Area */}
      <div className="w-full max-w-4xl flex flex-col items-center my-auto">
        <VoiceOrb
          state={orbState}
          audioLevel={orbState === "speaking" || orbState === "listening" ? 0.7 : 0.2}
          onClick={toggleRecording}
        />

        {/* Live Speaking Indicator */}
        {orbState === "speaking" && (
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-4 py-1.5 rounded-full mb-4 animate-bounce">
            <Volume2 className="w-4 h-4 animate-pulse" />
            <span>Streaming PCM Audio via AudioContext...</span>
          </div>
        )}

        {/* Verdict Card */}
        {verdict && (
          <div className="w-full mt-4 p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl shadow-2xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <span className="font-semibold text-sm tracking-wide text-slate-300 uppercase">
                  Evaluator Verdict
                </span>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  verdict.technical_score >= 70
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                }`}
              >
                Score: {verdict.technical_score}/100
              </div>
            </div>

            <p className="text-lg font-medium text-slate-100 mb-3">"{verdict.feedback}"</p>

            <div className="flex items-center space-x-4 text-xs font-mono text-slate-400 border-t border-slate-800 pt-3">
              <span>
                Voice Mode: <strong className="text-cyan-400">{verdict.voice_mode}</strong>
              </span>
              <span>•</span>
              <span>
                Routed Engine: <strong className="text-indigo-400">{metrics.engineUsed}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Metrics Telemetry Grid */}
        <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <div className="text-slate-400 text-xs mb-1 flex items-center space-x-1">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>TTFB Latency</span>
            </div>
            <div className="text-xl font-bold font-mono text-cyan-300">
              {metrics.ttfb ? `${metrics.ttfb} ms` : "--"}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <div className="text-slate-400 text-xs mb-1 flex items-center space-x-1">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>LLM / TTS Time</span>
            </div>
            <div className="text-xl font-bold font-mono text-indigo-300">
              {metrics.evalLatency ? `${metrics.evalLatency} / ${metrics.ttsLatency} ms` : "--"}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <div className="text-slate-400 text-xs mb-1">Received Frames</div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {metrics.framesReceived}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <div className="text-slate-400 text-xs mb-1 flex items-center space-x-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Packet Losses</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {metrics.packetLosses}
            </div>
          </div>
        </div>
      </div>

      {/* Input Bar with Mic Recording Toggle */}
      <div className="w-full max-w-3xl flex items-center space-x-3 bg-slate-900 border border-slate-800 p-2 rounded-2xl shadow-2xl mt-6">
        <button
          onClick={toggleRecording}
          className={`p-3 rounded-xl transition-all ${
            isRecording
              ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse"
              : "text-slate-400 hover:text-cyan-400"
          }`}
          title={isRecording ? "Stop Recording" : "Start Mic Recording"}
        >
          {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <input
          type="text"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={isRecording ? "Listening to your speech..." : "Speak or type your candidate response..."}
          className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none text-sm px-2"
        />

        <button
          onClick={handleSubmit}
          disabled={!isConnected || orbState === "processing" || !transcript.trim()}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition-all flex items-center space-x-2 shadow-lg shadow-indigo-600/30"
        >
          <span>Evaluate</span>
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Analytics Modal Component */}
      <AnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        metricsHistory={metricsHistory}
      />
    </main>
  );
}