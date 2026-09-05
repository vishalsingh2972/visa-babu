"use client";

import React, { useState, useEffect, useRef } from "react";
import { VoiceOrb, OrbState } from "@/components/VoiceOrb";
import { Mic, Send, Wifi, Activity, ShieldAlert, Cpu } from "lucide-react";

interface EvalVerdict {
  technical_score: number;
  voice_mode: "officer_british" | "indic_local";
  feedback: string;
}

export default function VoiceDashboard() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState(
    "Sir actually we implemented Redis caching with LRU eviction ahead of PostgreSQL database, reducing read latency by 40 percent under high traffic spikes."
  );
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

  const wsRef = useRef<WebSocket | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Connect to Day 4 Fastify WebSocket Server
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
        setMetrics((prev) => {
          const isFirstFrame = prev.framesReceived === 0;
          return {
            ...prev,
            framesReceived: prev.framesReceived + 1,
            ttfb: isFirstFrame ? Date.now() - startTimeRef.current : prev.ttfb,
            effectiveBandwidth: msg.metrics.effectiveBandwidthKbps,
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

    return () => ws.close();
  }, []);

  const handleSubmit = () => {
    if (!wsRef.current || !transcript.trim()) return;

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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 md:p-12 font-sans">
      {/* Top Header */}
      <header className="w-full max-w-5xl flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
            VISA-BABU // Voice AI Workbench
          </h1>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
          <Wifi className={`w-3.5 h-3.5 ${isConnected ? "text-emerald-400" : "text-rose-500"}`} />
          <span>{isConnected ? "WS CONNECTED (8080)" : "DISCONNECTED"}</span>
        </div>
      </header>

      {/* Main Interactive Center Area */}
      <div className="w-full max-w-4xl flex flex-col items-center my-auto">
        <VoiceOrb
          state={orbState}
          audioLevel={orbState === "speaking" ? 0.7 : 0.2}
          onClick={() => orbState === "speaking" && setOrbState("idle")}
        />

        {/* Dynamic Verdict Card */}
        {verdict && (
          <div className="w-full mt-6 p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl shadow-2xl transition-all duration-300">
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
              <span>Voice Mode: <strong className="text-cyan-400">{verdict.voice_mode}</strong></span>
              <span>•</span>
              <span>Routed Engine: <strong className="text-indigo-400">{metrics.engineUsed}</strong></span>
            </div>
          </div>
        )}

        {/* Live Streaming Metrics Telemetry Grid */}
        <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
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

      {/* Input Form Bar */}
      <div className="w-full max-w-3xl flex items-center space-x-3 bg-slate-900 border border-slate-800 p-2 rounded-2xl shadow-2xl mt-8">
        <div className="p-3 text-slate-400 hover:text-cyan-400 transition-colors">
          <Mic className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Enter candidate answer..."
          className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none text-sm px-2"
        />
        <button
          onClick={handleSubmit}
          disabled={!isConnected || orbState === "processing"}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition-all flex items-center space-x-2 shadow-lg shadow-indigo-600/30"
        >
          <span>Send</span>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </main>
  );
}