"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type OrbState = "idle" | "listening" | "processing" | "speaking";

interface VoiceOrbProps {
  state: OrbState;
  audioLevel?: number; // 0.0 to 1.0 for audio reactivity
  onClick?: () => void;
}

// State config: colors, scale ranges, ring behavior
const STATE_CONFIG: Record<OrbState, {
  label: string;
  gradient: string;
  shadow: string;
  ringColor: string;
  innerColor: string;
  pulseDuration: number;
  scaleMultiplier: number;
}> = {
  idle: {
    label: "Ready",
    gradient: "from-slate-400 via-slate-600 to-slate-800",
    shadow: "shadow-slate-500/30",
    ringColor: "border-slate-500/30",
    innerColor: "bg-slate-700/40",
    pulseDuration: 3,
    scaleMultiplier: 0,
  },
  listening: {
    label: "Listening",
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    shadow: "shadow-emerald-500/50",
    ringColor: "border-emerald-400/40",
    innerColor: "bg-emerald-600/30",
    pulseDuration: 1.2,
    scaleMultiplier: 0.4,
  },
  processing: {
    label: "Analyzing",
    gradient: "from-amber-400 via-orange-500 to-purple-600",
    shadow: "shadow-orange-500/50",
    ringColor: "border-amber-400/40",
    innerColor: "bg-orange-600/30",
    pulseDuration: 0.8,
    scaleMultiplier: 0,
  },
  speaking: {
    label: "Speaking",
    gradient: "from-cyan-400 via-blue-500 to-indigo-600",
    shadow: "shadow-blue-500/50",
    ringColor: "border-cyan-400/40",
    innerColor: "bg-blue-600/30",
    pulseDuration: 0.6,
    scaleMultiplier: 0.55,
  },
};

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  audioLevel = 0.2,
  onClick,
}) => {
  const config = STATE_CONFIG[state];
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;

  const scale = 1 + (state === "listening" || state === "speaking" ? config.scaleMultiplier * audioLevel : 0);

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer select-none py-14"
    >
      {/* Ambient glow layer */}
      <motion.div
        animate={{
          scale: state === "idle" ? 1 : [1, 1.5, 1],
          opacity: state === "idle" ? 0.15 : [0.15, 0.35, 0.15],
        }}
        transition={{
          duration: config.pulseDuration,
          repeat: state === "idle" ? Infinity : Infinity,
          ease: "easeInOut",
        }}
        className={`absolute w-52 h-52 rounded-full bg-gradient-to-tr ${config.gradient} opacity-20 blur-2xl`}
      />

      {/* Pulse rings - one outer, one offset */}
      <AnimatePresence>
        {(state === "listening" || state === "speaking") && (
          <>
            <motion.div
              key="ring-1"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: [1, 2.1, 1], opacity: [0.5, 0, 0.5] }}
              exit={{ scale: 1, opacity: 0 }}
              transition={{
                duration: config.pulseDuration,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className={`absolute w-44 h-44 rounded-full border-2 ${config.ringColor} bg-transparent`}
            />
            <motion.div
              key="ring-2"
              initial={{ scale: 1, opacity: 0.4 }}
              animate={{ scale: [1, 1.7, 1], opacity: [0.35, 0, 0.35] }}
              exit={{ scale: 1, opacity: 0 }}
              transition={{
                duration: config.pulseDuration * 1.3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: config.pulseDuration * 0.4,
              }}
              className={`absolute w-44 h-44 rounded-full border border-white/20 bg-white/5`}
            />
          </>
        )}
      </AnimatePresence>

      {/* Rotating dashed ring for processing */}
      <AnimatePresence>
        {state === "processing" && (
          <motion.div
            key="processing-ring"
            initial={{ opacity: 0, rotate: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
            className="absolute w-56 h-56 rounded-full border-2 border-dashed border-amber-400/60"
          />
        )}
      </AnimatePresence>

      {/* Main Orb Core with spring physics */}
      <motion.div
        animate={{
          scale: scale,
        }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 22,
        }}
        className={`relative w-44 h-44 rounded-full bg-gradient-to-br ${config.gradient} shadow-2xl ${config.shadow} flex items-center justify-center transition-shadow duration-500`}
      >
        {/* Inner liquid core */}
        <motion.div
          animate={{
            scale: [0.82, 1.06, 0.82],
            opacity: [0.7, 1, 0.7],
            rotate: state === "speaking" ? [0, 8, -8, 0] : 0,
          }}
          transition={{
            duration: state === "speaking" ? 0.7 : state === "listening" ? 1.8 : 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-32 h-32 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-inner"
        >
          {/* State label */}
          <div className="text-white text-xs font-semibold tracking-widest uppercase opacity-90 backdrop-blur-sm px-3 py-1.5 rounded-full bg-black/25 border border-white/10">
            {config.label}
          </div>
        </motion.div>

        {/* Glossy highlight */}
        <div className="absolute top-3 left-6 w-16 h-10 rounded-full bg-white/25 blur-md pointer-events-none" />
      </motion.div>

      {/* Bottom glow reflection */}
      <div
        className={`absolute bottom-2 w-24 h-3 rounded-full bg-gradient-to-r from-transparent via-slate-400/40 to-transparent blur-md`}
      />
    </div>
  );
};