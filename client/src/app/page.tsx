"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { VoiceOrb, OrbState } from "@/components/VoiceOrb";
import { PCMStreamPlayer } from "@/lib/pcm-player";
import { AnalyticsModal } from "@/components/AnalyticsModal";
import { ConversationTimeline, TimelineEntry } from "@/components/ConversationTimeline";
import { ScoreGauge } from "@/components/ScoreGauge";
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
  Landmark,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import confetti from "canvas-confetti";

interface EvalVerdict {
  technical_score: number;
  voice_mode: "officer_british" | "indic_local";
  feedback: string;
  follow_up_question?: boolean;
  conversation_round?: number;
  is_final?: boolean;
  verdict?: "APPROVED" | "CONDITIONAL" | "NOT_CONVINCING";
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
  const [isInitializing, setIsInitializing] = useState(false);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
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
  const [maxRounds, setMaxRounds] = useState(0);
  const [finalVerdict, setFinalVerdict] = useState<{
    verdict: string;
    score: number;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcmPlayerRef = useRef<PCMStreamPlayer | null>(null);
  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<string>("");
  const isCallActiveRef = useRef(false);
  const timelineIdRef = useRef(0);

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

    // Add candidate entry to timeline
    timelineIdRef.current++;
    setTimelineEntries((prev) => [
      ...prev,
      {
        id: timelineIdRef.current,
        role: "candidate",
        content: textToSend,
        timestamp: Date.now(),
      },
    ]);

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
        setMetrics((prev) => ({
          ...prev,
          ttsLatency: msg.latencyMs,
          engineUsed: msg.engineUsed,
        }));
        setOrbState("speaking");
        setTimelineEntries((prev) => [
          ...prev,
          {
            id: ++timelineIdRef.current,
            role: "officer",
            content: "Good morning. I am the consular officer handling your visa interview. Please state your name and visa category, and briefly describe your primary technical work or field of study.",
            timestamp: Date.now(),
          },
        ]);
        console.log("Greeting stream ready. Playing officer initial greeting...");
      }

      if (msg.type === "eval_verdict") {
        setVerdict(msg.evalResult);
        setMaxRounds(msg.maxRounds || 0);
        setMetrics((prev) => ({ ...prev, evalLatency: msg.latencyMs }));

        if (msg.evalResult.is_final) {
          setFinalVerdict({
            verdict: msg.evalResult.verdict || "NOT_CONVINCING",
            score: msg.evalResult.technical_score,
          });
          if (msg.evalResult.verdict === "APPROVED") {
            confetti({
              particleCount: 120,
              spread: 70,
              origin: { y: 0.3 },
            });
          }
        }

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

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        silenceTimerRef.current = setTimeout(() => {
          if (transcriptRef.current.trim().length > 0) {
            sendTranscriptToServer();
          }
        }, 1500);
      };

      recognition.onerror = (err: any) => {
        console.error("Mic error:", err);
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
      setVerdict(null);
      setTimelineEntries([]);
      setFinalVerdict(null);
      setMaxRounds(0);
      setIsInitializing(false);
      if (pcmPlayerRef.current) pcmPlayerRef.current.stop();
    } else {
      setTranscript("");
      setVerdict(null);
      setTimelineEntries([]);
      setFinalVerdict(null);
      setMaxRounds(0);
      setIsInitializing(true);
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
      setOrbState("processing");

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        startTimeRef.current = Date.now();
        wsRef.current.send(JSON.stringify({ type: "start_session" }));
        console.log("Session initialized. Triggering Visa Officer initial greeting...");
        setTimeout(() => setIsInitializing(false), 3000);
      } else {
        console.error("WebSocket not connected. Cannot start session.");
        setIsCallActive(false);
        isCallActiveRef.current = false;
        setOrbState("idle");
        setIsInitializing(false);
      }
    }
  };

  return (
    <main className="min-h-screen bg-[#070b1a] text-slate-100 flex flex-col items-center justify-between p-6 md:p-12 font-sans relative overflow-hidden">
      {/* Ambient background gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-amber-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="w-full max-w-6xl flex items-center justify-between border-b border-slate-800/70 pb-4 relative z-10">
        <div className="flex items-center space-x-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isCallActive ? "bg-emerald-400 animate-ping" : "bg-amber-400 animate-pulse"
            }`}
          />
          <h1 className="text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
              VISA-BABU
            </span>
            <span className="text-slate-300 ml-2 text-base font-medium">// Realtime Voice Session</span>
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsAnalyticsOpen(true)}
            className="flex items-center space-x-2 text-xs font-mono bg-amber-600/15 border border-amber-500/30 hover:bg-amber-600/25 text-amber-300 px-3 py-1.5 rounded-full transition"
          >
            <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
            <span>Telemetry</span>
          </button>

          <div className="flex items-center space-x-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
            <Wifi className={`w-3.5 h-3.5 ${isConnected ? "text-emerald-400" : "text-rose-500"}`} />
            <span>{isConnected ? "WS CONNECTED (8080)" : "DISCONNECTED"}</span>
          </div>
        </div>
      </header>

      {/* Session Init Overlay */}
      <AnimatePresence>
        {isInitializing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#070b1a]/95 backdrop-blur-xl flex flex-col items-center justify-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="relative w-20 h-20"
            >
              <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
              <div className="absolute inset-2 rounded-full border border-cyan-400/20 border-b-cyan-400 animate-spin [animation-direction:reverse] [animation-duration:2s]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Landmark className="w-7 h-7 text-amber-400" />
              </div>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 font-mono text-sm text-slate-300"
            >
              Initializing Consular Officer...
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="mt-2 text-xs font-mono text-slate-500"
            >
              Connecting to voice engine
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center lg:items-start gap-8 my-auto relative z-10">
        {/* Left Panel */}
        <div className="flex-1 flex flex-col items-center">
          <div className="text-xs font-mono text-slate-500 mb-2 flex items-center space-x-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>H-1B Technical Visa Interview Simulation</span>
          </div>

          <VoiceOrb
            state={orbState}
            audioLevel={orbState === "speaking" || orbState === "listening" ? 0.7 : 0.2}
            onClick={toggleCallSession}
          />

          <div className="mt-4 flex flex-col items-center space-y-3">
            <button
              onClick={toggleCallSession}
              disabled={!isConnected}
              className={`flex items-center space-x-3 px-8 py-4 rounded-full font-semibold text-sm transition-all shadow-xl ${
                isCallActive
                  ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30"
                  : "bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 shadow-amber-600/40"
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
                  <span>Start Visa Interview</span>
                </>
              )}
            </button>
            <span className="text-xs font-mono text-slate-500">
              {isCallActive
                ? orbState === "speaking"
                  ? "Officer speaking... mic muted."
                  : orbState === "processing"
                  ? "Analyzing response..."
                  : "Listening... Stop speaking for 1.5s to submit."
                : "Click to begin a seamless hands-free interview."}
            </span>
          </div>

          <AnimatePresence>
            {orbState === "speaking" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center space-x-2 text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-4 py-2 rounded-full mt-5"
              >
                <Volume2 className="w-4 h-4 animate-pulse" />
                <span>Streaming Officer Response...</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isCallActive && transcript && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-md mt-6 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex items-center space-x-3"
              >
                <Mic className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
                <p className="text-sm font-mono text-slate-300 italic truncate">
                  "{transcript}"
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Panel */}
        <div className="flex-1 w-full lg:max-w-md space-y-6">
          {/* Conversation Timeline Card */}
          <div className="bg-slate-900/50 border border-slate-800/80 backdrop-blur-md rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800/70">
              <div className="flex items-center space-x-2">
                <Landmark className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">Interview Transcript</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {timelineEntries.length > 0 ? `${timelineEntries.length} exchanges` : "Session not started"}
              </span>
            </div>
            <ConversationTimeline entries={timelineEntries} />
          </div>

          {/* Score Display Card */}
          <AnimatePresence>
            {verdict && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="bg-slate-900/50 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold tracking-wide text-slate-300 uppercase">Evaluation Score</span>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      verdict.technical_score >= 70
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {verdict.technical_score >= 70 ? "STRONG" : "WEAK"}
                  </div>
                </div>

                <div className="flex items-center justify-center py-3">
                  <ScoreGauge score={verdict.technical_score} />
                </div>

                <div className="mt-4 p-4 rounded-xl bg-slate-950/50 border border-slate-800">
                  <p className="text-sm font-mono text-slate-200 leading-relaxed">
                    "{verdict.feedback}"
                  </p>
                </div>

                <div className="flex items-center justify-between mt-4 text-xs font-mono text-slate-400 border-t border-slate-800 pt-3">
                  <div className="flex items-center space-x-3">
                    <span>
                      Voice: <strong className="text-cyan-400">{verdict.voice_mode}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Engine: <strong className="text-indigo-400">{metrics.engineUsed}</strong>
                    </span>
                  </div>
                  {verdict.conversation_round && (
                    <span className="text-amber-400">Round #{verdict.conversation_round}</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Final Verdict Card */}
          <AnimatePresence>
            {finalVerdict && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className={`rounded-2xl p-6 border backdrop-blur-md ${
                  finalVerdict.verdict === "APPROVED"
                    ? "bg-emerald-950/30 border-emerald-500/40"
                    : finalVerdict.verdict === "CONDITIONAL"
                    ? "bg-amber-950/30 border-amber-500/40"
                    : "bg-rose-950/30 border-rose-500/40"
                }`}
              >
                <div className="flex items-center justify-center mb-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
                    className={`w-16 h-16 rounded-full flex items-center justify-center ${
                      finalVerdict.verdict === "APPROVED"
                        ? "bg-emerald-500/20 border-2 border-emerald-500/60"
                        : finalVerdict.verdict === "CONDITIONAL"
                        ? "bg-amber-500/20 border-2 border-amber-500/60"
                        : "bg-rose-500/20 border-2 border-rose-500/60"
                    }`}
                  >
                    {finalVerdict.verdict === "APPROVED" ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    ) : finalVerdict.verdict === "CONDITIONAL" ? (
                      <AlertTriangle className="w-8 h-8 text-amber-400" />
                    ) : (
                      <XCircle className="w-8 h-8 text-rose-400" />
                    )}
                  </motion.div>
                </div>

                <h3 className="text-center font-mono text-xl font-bold tracking-widest mb-1 text-slate-100">
                  {finalVerdict.verdict === "APPROVED"
                    ? "VISA APPROVED"
                    : finalVerdict.verdict === "CONDITIONAL"
                    ? "ADDITIONAL DOCUMENTATION REQUIRED"
                    : "NOT CONVINCING"}
                </h3>

                <p className="text-center text-xs font-mono text-slate-400 mt-2">
                  Final Score: <strong className="text-white">{finalVerdict.score}/100</strong> · After {maxRounds} rounds of questioning
                </p>

                <div className="mt-4 text-center">
                  {finalVerdict.verdict === "APPROVED" ? (
                    <span className="text-xs font-mono text-emerald-400">
                      ✓ Your technical depth and consistency met consular requirements.
                    </span>
                  ) : finalVerdict.verdict === "CONDITIONAL" ? (
                    <span className="text-xs font-mono text-amber-400">
                      ⚠ The officer requires more documentation to verify your claims.
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-rose-400">
                      ✗ The officer was not convinced by the evidence presented.
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Metrics Telemetry Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="text-slate-400 text-[10px] mb-1 flex items-center space-x-1">
                <Activity className="w-3 h-3 text-amber-400" />
                <span>TTFB</span>
              </div>
              <div className="text-lg font-bold font-mono text-amber-300">
                {metrics.ttfb ? `${metrics.ttfb}ms` : "--"}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="text-slate-400 text-[10px] mb-1 flex items-center space-x-1">
                <Cpu className="w-3 h-3 text-indigo-400" />
                <span>LLM / TTS</span>
              </div>
              <div className="text-lg font-bold font-mono text-indigo-300">
                {metrics.evalLatency ? `${metrics.evalLatency}/${metrics.ttsLatency}ms` : "--"}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="text-slate-400 text-[10px] mb-1">Frames</div>
              <div className="text-lg font-bold font-mono text-emerald-400">
                {metrics.framesReceived}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="text-slate-400 text-[10px] mb-1 flex items-center space-x-1">
                <ShieldAlert className="w-3 h-3 text-rose-400" />
                <span>Loss</span>
              </div>
              <div className="text-lg font-bold font-mono text-rose-400">
                {metrics.packetLosses}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-6xl border-t border-slate-800/70 pt-4 flex justify-between items-center text-[10px] font-mono text-slate-600 relative z-10">
        <span>© 2026 VISA-BABU — Open Source Voice AI Interview Simulator</span>
        <span className="flex items-center space-x-2">
          <span className="text-emerald-500">●</span> Powered by Sarvam 105B + Bulbul · Cartesia Sonic 3.6
        </span>
      </footer>

      {/* Telemetry Analytics Modal */}
      <AnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        metricsHistory={metricsHistory}
      />
    </main>
  );
}