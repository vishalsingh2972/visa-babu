"use client";

import React, { useEffect, useRef, useState } from "react";

interface ConsularFace2DProps {
  analyserNode: AnalyserNode | null;
  isSpeaking: boolean;
  isListening: boolean;
  isProcessing: boolean;
}

export const ConsularFace2D: React.FC<ConsularFace2DProps> = ({
  analyserNode,
  isSpeaking,
  isListening,
  isProcessing,
}) => {
  const [mouthOpen, setMouthOpen] = useState(0);
  const [headTilt, setHeadTilt] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const animate = () => {
      if (analyserNode && isSpeaking) {
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length / 255;
        setMouthOpen(Math.min(avg * 100, 100));
      } else {
        setMouthOpen(0);
      }
      if (isSpeaking) {
        setHeadTilt(Math.sin(Date.now() * 0.003) * 2);
      } else {
        setHeadTilt(0);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [analyserNode, isSpeaking]);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, []);

  const mouthHeight = 2 + (mouthOpen / 100) * 14;
  const mouthWidth = 24 + (mouthOpen / 100) * 8;
  const eyeHeight = isBlinking ? 0.5 : 6;
  const eyebrowRaise = isProcessing ? 4 : 0;

  return (
    <div className="w-full flex flex-col items-center">
      <svg width="200" height="240" viewBox="0 0 200 240" className="drop-shadow-2xl" style={{ transform: `rotate(${headTilt}deg)`, transition: "transform 0.1s ease" }}>
        <defs>
          <radialGradient id="faceGlow" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="suitGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="120" r="120" fill="url(#faceGlow)" />
        <path d="M50 180 Q100 160 150 180 L160 240 L40 240 Z" fill="url(#suitGradient)" stroke="#334155" strokeWidth="1" />
        <path d="M85 175 L100 195 L115 175" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
        <path d="M95 178 L100 210 L105 178" fill="#8b0000" stroke="#6b0000" strokeWidth="0.5" />
        <ellipse cx="100" cy="178" rx="6" ry="4" fill="#8b0000" />
        <rect x="88" y="150" width="24" height="30" rx="8" fill="#e8c4a0" />
        <ellipse cx="100" cy="110" rx="52" ry="60" fill="#e8c4a0" />
        <path d="M48 95 Q50 50 100 45 Q150 50 152 95 Q148 70 100 65 Q52 70 48 95" fill="#2a1a0a" />
        <path d="M55 90 Q60 65 100 60 Q140 65 145 90 Q140 75 100 70 Q60 75 55 90" fill="#3a2a1a" />
        <ellipse cx="48" cy="110" rx="8" ry="12" fill="#d4a574" />
        <ellipse cx="152" cy="110" rx="8" ry="12" fill="#d4a574" />
        <rect x="68" y={82 - eyebrowRaise} width="22" height="3.5" rx="1.5" fill="#2a1a0a" style={{ transition: "y 0.2s ease" }} />
        <rect x="110" y={82 - eyebrowRaise} width="22" height="3.5" rx="1.5" fill="#2a1a0a" style={{ transition: "y 0.2s ease" }} />
        <ellipse cx="79" cy="95" rx="10" ry={eyeHeight} fill="#ffffff" style={{ transition: "ry 0.1s ease" }} />
        <ellipse cx="79" cy="95" rx="5" ry={Math.min(eyeHeight, 5)} fill="#1a1a2e" />
        <circle cx="81" cy="93" r="1.5" fill="#ffffff" opacity="0.8" />
        <ellipse cx="121" cy="95" rx="10" ry={eyeHeight} fill="#ffffff" style={{ transition: "ry 0.1s ease" }} />
        <ellipse cx="121" cy="95" rx="5" ry={Math.min(eyeHeight, 5)} fill="#1a1a2e" />
        <circle cx="123" cy="93" r="1.5" fill="#ffffff" opacity="0.8" />
        <path d="M100 95 Q96 112 100 118 Q104 112 100 95" fill="#d4a574" stroke="#c49a6c" strokeWidth="0.5" />
        <ellipse cx="100" cy="135" rx={mouthWidth / 2} ry={mouthHeight / 2} fill="#8b4040" style={{ transition: "ry 0.05s ease, rx 0.05s ease" }} />
        {mouthOpen > 20 && <ellipse cx="100" cy="135" rx={mouthWidth / 2 - 3} ry={Math.max(mouthHeight / 2 - 2, 1)} fill="#2a0a0a" />}
        {mouthOpen > 40 && <rect x={100 - mouthWidth / 2 + 4} y="131" width={mouthWidth - 8} height="3" rx="1" fill="#ffffff" opacity="0.7" />}
        <path d="M70 145 Q100 165 130 145" fill="none" stroke="#c49a6c" strokeWidth="0.5" opacity="0.5" />
      </svg>
      <div className="mt-3 flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${isSpeaking ? "bg-cyan-400 animate-pulse" : isListening ? "bg-emerald-400 animate-pulse" : isProcessing ? "bg-amber-400 animate-pulse" : "bg-slate-500"}`} />
        <span className="text-[10px] font-mono text-slate-400">{isSpeaking ? "Speaking..." : isListening ? "Listening..." : isProcessing ? "Analyzing..." : "Ready"}</span>
      </div>
    </div>
  );
};