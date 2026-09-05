"use client";

import React from "react";
import { BarChart3, X, Zap, Cpu, ShieldAlert, Radio } from "lucide-react";

interface AnalyticsProps {
  isOpen: boolean;
  onClose: () => void;
  metricsHistory: {
    ttfb: number;
    evalLatency: number;
    ttsLatency: number;
    engineUsed: string;
    packetLosses: number;
  }[];
}

export const AnalyticsModal: React.FC<AnalyticsProps> = ({ isOpen, onClose, metricsHistory }) => {
  if (!isOpen) return null;

  const totalRuns = metricsHistory.length;
  const avgTTFB = totalRuns
    ? Math.round(metricsHistory.reduce((acc, m) => acc + m.ttfb, 0) / totalRuns)
    : 0;
  const avgEval = totalRuns
    ? Math.round(metricsHistory.reduce((acc, m) => acc + m.evalLatency, 0) / totalRuns)
    : 0;
  const avgTTS = totalRuns
    ? Math.round(metricsHistory.reduce((acc, m) => acc + m.ttsLatency, 0) / totalRuns)
    : 0;
  const totalLosses = metricsHistory.reduce((acc, m) => acc + m.packetLosses, 0);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <BarChart3 className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold tracking-tight">System Telemetry & Latency Analytics</h2>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1 flex items-center space-x-1">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Avg TTFB</span>
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-400">{avgTTFB} ms</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1 flex items-center space-x-1">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Avg Eval Time</span>
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-400">{avgEval} ms</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1 flex items-center space-x-1">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Avg TTS Time</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">{avgTTS} ms</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1 flex items-center space-x-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Packet Losses</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400">{totalLosses}</div>
          </div>
        </div>

        {/* Execution Log Table */}
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
          <div className="bg-slate-900 px-4 py-2 text-xs font-mono text-slate-400 font-semibold border-b border-slate-800 flex justify-between">
            <span>RUN #</span>
            <span>EVAL LATENCY</span>
            <span>TTS LATENCY</span>
            <span>TTFB</span>
            <span>ENGINE</span>
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/50">
            {metricsHistory.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 font-mono">No telemetry runs recorded yet. Submit responses in dashboard.</div>
            ) : (
              metricsHistory.map((m, idx) => (
                <div key={idx} className="px-4 py-2.5 text-xs font-mono flex justify-between text-slate-300">
                  <span className="text-slate-500">#{idx + 1}</span>
                  <span>{m.evalLatency} ms</span>
                  <span>{m.ttsLatency} ms</span>
                  <span className="text-cyan-400 font-bold">{m.ttfb} ms</span>
                  <span className="text-indigo-400">{m.engineUsed}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};