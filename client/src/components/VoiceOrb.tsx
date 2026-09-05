"use client";

import React from "react";
import { motion } from "framer-motion";

export type OrbState = "idle" | "listening" | "processing" | "speaking";

interface VoiceOrbProps {
  state: OrbState;
  audioLevel?: number; // 0.0 to 1.0 for audio reactivity
  onClick?: () => void;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  audioLevel = 0.2,
  onClick,
}) => {
  // Dynamic scaling based on state and audio volume
  const getScale = () => {
    switch (state) {
      case "listening":
        return 1 + audioLevel * 0.45;
      case "speaking":
        return 1 + audioLevel * 0.6;
      case "processing":
        return 1.05;
      default:
        return 1;
    }
  };

  // State-based color gradients
  const getGradient = () => {
    switch (state) {
      case "listening":
        return "from-emerald-400 via-teal-500 to-cyan-600 shadow-emerald-500/50";
      case "processing":
        return "from-amber-400 via-orange-500 to-purple-600 shadow-orange-500/50";
      case "speaking":
        return "from-cyan-400 via-blue-500 to-indigo-600 shadow-blue-500/50";
      default:
        return "from-slate-400 via-slate-600 to-slate-800 shadow-slate-500/30";
    }
  };

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer select-none py-12"
    >
      {/* Outer Pulse Rings */}
      {(state === "listening" || state === "speaking") && (
        <>
          <motion.div
            animate={{
              scale: [1, 1.8 + audioLevel, 1],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: state === "speaking" ? 0.8 : 1.4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className={`absolute w-44 h-44 rounded-full bg-gradient-to-tr ${getGradient()} opacity-30 blur-xl`}
          />
          <motion.div
            animate={{
              scale: [1, 2.2 + audioLevel * 0.5, 1],
              opacity: [0.4, 0, 0.4],
            }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.2,
            }}
            className={`absolute w-44 h-44 rounded-full bg-gradient-to-tr ${getGradient()} opacity-20 blur-2xl`}
          />
        </>
      )}

      {/* Rotating Ring for Processing / Thinking state */}
      {state === "processing" && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute w-52 h-52 rounded-full border-2 border-dashed border-amber-400/60 blur-[1px]"
        />
      )}

      {/* Core Glowing Orb */}
      <motion.div
        animate={{
          scale: getScale(),
          rotate: state === "processing" ? [0, 180, 360] : 0,
        }}
        transition={{
          scale: { type: "spring", stiffness: 300, damping: 20 },
          rotate: { duration: 4, repeat: Infinity, ease: "easeInOut" },
        }}
        className={`w-40 h-40 rounded-full bg-gradient-to-br ${getGradient()} shadow-2xl flex items-center justify-center transition-all duration-500 backdrop-blur-3xl border border-white/20`}
      >
        {/* Inner Liquid Core Effect */}
        <motion.div
          animate={{
            scale: [0.85, 1.05, 0.85],
            opacity: [0.7, 0.95, 0.7],
          }}
          transition={{
            duration: state === "speaking" ? 0.6 : 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-28 h-28 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-inner"
        >
          <div className="text-white text-xs font-semibold tracking-wider uppercase opacity-90 backdrop-blur-sm px-2 py-1 rounded-full bg-black/20">
            {state}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};