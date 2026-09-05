"use client";

import React, { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";

interface ScoreGaugeProps {
  score: number;
  maxScore?: number;
  size?: number;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  maxScore = 100,
  size = 140,
}) => {
  const [displayScore, setDisplayScore] = useState(0);
  const controls = useAnimation();

  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetPercent = Math.min(score / maxScore, 1);
  const targetOffset = circumference * (1 - targetPercent);

  // Color based on score
  const getColor = (value: number) => {
    if (value >= 85) return "#34d399"; // emerald-400
    if (value >= 70) return "#fbbf24"; // amber-400
    if (value >= 50) return "#f97316"; // orange-500
    return "#f87171"; // rose-400
  };

  // Animate score counting up
  useEffect(() => {
    if (score > 0) {
      const duration = 1500;
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        setDisplayScore(Math.round(eased * score));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);

      controls.start({
        strokeDashoffset: targetOffset,
        transition: { duration: 1.5, ease: [0.22, 1, 0.36, 1] },
      });
    }
  }, [score, controls, targetOffset]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(30,41,59,0.5)"
          strokeWidth={strokeWidth}
        />
        {/* Animated progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(displayScore)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={controls}
          style={{
            filter: `drop-shadow(0 0 8px ${getColor(displayScore)}55)`,
          }}
        />
      </svg>

      {/* Center score text */}
      <div className="absolute flex flex-col items-center">
        <motion.span
          animate={{ opacity: displayScore > 0 ? 1 : 0.3 }}
          className="font-mono text-4xl font-bold tracking-tight"
          style={{ color: getColor(displayScore) }}
        >
          {displayScore}
        </motion.span>
        <span className="text-[10px] font-mono text-slate-500 mt-1">/ {maxScore}</span>
      </div>
    </div>
  );
};