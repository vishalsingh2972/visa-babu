"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { VoiceOrb, OrbState } from "@/components/VoiceOrb";
import { PCMStreamPlayer } from "@/lib/pcm-player";
import { AnalyticsModal } from "@/components/AnalyticsModal";
import {
  Phone,
  PhoneOff,
  Wifi,
  Activity,
  ShieldAlert,
  Cpu,
  Volume2,
  BarChart3,
  Mic,
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
  const [isCallActive, setIsCallActive] = useState(false);
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
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<string>("");
  const isCallActiveRef = useRef(false);

  // Keep transcriptRef synchronized with state for callback access
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Keep isCallActive synchronized with ref for stable callbacks
  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  // Function to transmit candidate speech over WebSocket
  const sendTranscriptToServer = useCallback(() => {
    const textToSend = transcriptRef.current.trim();
    if (!wsRef.current || !textToSend || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Pause listening while server processes and streams audio response
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Safe catch if already stopped
      }
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
        transcript: textToSend,
      })
    );

    // Clear local transcript buffer for next speech segment
    setTranscript("");
    transcriptRef.current = "";
  }, []);

  // Open mic for next candidate response (auto-resume after officer speech)
  const openMicrophone = useCallback(() => {
    if (isCallActiveRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setOrbState("listening");
      } catch (err) {
        console.error("Failed auto-resuming mic:", err);
      }
    } else {
      setOrbState("idle");
    }
  }, []);

  // Handle continuous audio chunk stream
  const handleIncomingAudioChunk = useCallback(
    (base64Payload: string, metricsData: any) => {
      if (pcmPlayerRef.current) {
        pcmPlayerRef.current.playChunk(base64Payload);
      }

      setMetrics((prev) => {
        const isFirstFrame = prev.framesReceived === 0;
        const calculatedTTFB = isFirstFrame ? Date.now() - startTimeRef.current : prev.ttfb;

        return {
          ...prev,
          framesReceived: prev.framesReceived + 1,
          ttfb: calculatedTTFB,
          effectiveBandwidth: metricsData?.effectiveBandwidthKbps || 0,
        };
      });
    },
    []
  );

  useEffect(() => {
    pcmPlayerRef.current = new PCMStreamPlayer(24000);

    // Define auto-resume listener: when officer audio finishes, open mic
    pcmPlayerRef.current.onEnded = openMicrophone;

    const ws = new WebSocket("ws://localhost:8080/ws/eval");

    ws.onopen = () => {
      setIsConnected(true);
      console.log("WebSocket Gateway Connected.");
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "greeting_ready") {
        // Officer greeting is ready to stream
        setMetrics((prev) => ({
          ...prev,
          ttsLatency: msg.latencyMs,
          engineUsed: msg.engineUsed,
        }));
        setOrbState("speaking");
        console.log("Greeting stream ready. Playing officer initial greeting...");
      }

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

      if (msg.type === "stream_complete") {
        // All audio chunks for this stream have been sent.
        // Signal the player to fire onEnded once all expected frames finish playing.
        console.log(`Stream complete (${msg.streamKind}). Total frames: ${msg.totalFrames}`);
        if (pcmPlayerRef.current) {
          pcmPlayerRef.current.markStreamEnd(msg.totalFrames);
        }
      }

      if (msg.type === "audio_chunk") {
        handleIncomingAudioChunk(msg.payloadBase64, msg.metrics);
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

    // Web Speech API Continuous Speech Detection Initialization
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

        // Reset silence detection timeout on speech activity
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // Auto-submit after 1.5 seconds of silence
        silenceTimerRef.current = setTimeout(() => {
          if (transcriptRef.current.trim().length > 0) {
            sendTranscriptToServer();
          }
        }, 1500);
      };

      recognition.onerror = (err: any) => {
        console.error("Mic error:", err);
        // If recognition errors during active call, try to restart after a short delay
        if (isCallActiveRef.current && err.error !== "aborted") {
          setTimeout(() => {
            try {
              recognitionRef.current?.start();
            } catch (e) {
              // Already starting
            }
          }, 500);
        }
      };
      recognitionRef.current = recognition;
    }

    return () => {
      ws.close();
      pcmPlayerRef.current?.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [handleIncomingAudioChunk, sendTranscriptToServer, openMicrophone]);

  // Telemetry metric logging
  useEffect(() => {
    if (metrics.ttfb > 0 && metrics.evalLatency > 0 && metrics.ttsLatency > 0) {
      setMetricsHistory((prev) => {
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

  // One-click toggle for initiating or hanging up the hands-free call session
  const toggleCallSession = () => {
    if (!recognitionRef.current) {
      alert("Speech Recognition API is not supported in this browser. Please use Chrome/Edge.");
      return;
    }

    if (isCallActiveRef.current) {
      // Hang up session
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setIsCallActive(false);
      isCallActiveRef.current = false;
      setOrbState("idle");
      setTranscript("");
      if (pcmPlayerRef.current) pcmPlayerRef.current.stop();
    } else {
      // Start session: trigger officer cold-start greeting, NOT immediate mic open
      setTranscript("");
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

      setIsCallActive(true);
      isCallActiveRef.current = true;
      setOrbState("processing"); // Show processing while greeting is being synthesized

      // Request officer greeting from server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        startTimeRef.current = Date.now();
        wsRef.current.send(JSON.stringify({ type: "start_session" }));
        console.log("Session initialized. Triggering Visa Officer initial greeting...");
      } else {
        console.error("WebSocket not connected. Cannot start session.");
        setIsCallActive(false);
        isCallActiveRef.current = false;
        setOrbState("idle");
      }
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 md:p-12 font-sans relative">
      {/* Header */}
      <header className="w-full max-w-5xl flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isCallActive ? "bg-emerald-400 animate-ping" : "bg-cyan-400 animate-pulse"
            }`}
          />
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
            VISA-BABU // Realtime Voice Session
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

      {/* Main Interactive Orb & Hands-free Session Controller */}
      <div className="w-full max-w-4xl flex flex-col items-center my-auto">
        <VoiceOrb
          state={orbState}
          audioLevel={orbState === "speaking" || orbState === "listening" ? 0.7 : 0.2}
          onClick={toggleCallSession}
        />

        {/* Call Action Button */}
        <div className="mt-6 flex flex-col items-center space-y-3">
          <button
            onClick={toggleCallSession}
            disabled={!isConnected}
            className={`flex items-center space-x-3 px-8 py-4 rounded-full font-semibold text-sm transition-all shadow-xl ${
              isCallActive
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
            }`}
          >
            {isCallActive ? (
              <>
                <PhoneOff className="w-5 h-5" />
                <span>End Call Session</span>
              </>
            ) : (
              <>
                <Phone className="w-5 h-5" />
                <span>Start Visa Interview Session</span>
              </>
            )}
          </button>
          <span className="text-xs font-mono text-slate-500">
            {isCallActive
              ? orbState === "speaking"
                ? "Officer speaking... mic muted."
                : orbState === "processing"
                ? "Initializing session..."
                : "Listening... Stop speaking for 1.5s to submit."
              : "Click once to begin a seamless visa interview with the AI officer."}
          </span>
        </div>

        {/* Live Audio Streaming Banner */}
        {orbState === "speaking" && (
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-4 py-1.5 rounded-full mt-4 animate-bounce">
            <Volume2 className="w-4 h-4 animate-pulse" />
            <span>Streaming Audio Response...</span>
          </div>
        )}

        {/* Live Transcript Display */}
        {isCallActive && transcript && (
          <div className="w-full max-w-xl mt-6 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex items-center space-x-3">
            <Mic className="w-4 h-4 text-cyan-400 animate-pulse flex-shrink-0" />
            <p className="text-sm font-mono text-slate-300 italic truncate">
              "{transcript}"
            </p>
          </div>
        )}

        {/* Verdict Card */}
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

      {/* Telemetry Analytics Modal */}
      <AnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        metricsHistory={metricsHistory}
      />
    </main>
  );
}