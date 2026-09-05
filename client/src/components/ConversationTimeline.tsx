"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Landmark, User, MessageSquare } from "lucide-react";

export interface TimelineEntry {
  id: number;
  role: "officer" | "candidate";
  content: string;
  timestamp: number;
  score?: number;
  engineUsed?: string;
}

interface ConversationTimelineProps {
  entries: TimelineEntry[];
}

export const ConversationTimeline: React.FC<ConversationTimelineProps> = ({ entries }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div ref={scrollRef} className="w-full max-h-64 overflow-y-auto space-y-3 pr-2 relative">
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={`flex items-start space-x-3 ${
              entry.role === "officer" ? "justify-start" : "justify-end"
            }`}
          >
            {/* Officer entry (left aligned) */}
            {entry.role === "officer" && (
              <>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
                  <Landmark className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="max-w-[75%]">
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl rounded-tl-sm px-4 py-2.5">
                    <p className="text-xs font-mono text-slate-300 leading-relaxed">{entry.content}</p>
                    {entry.score !== undefined && (
                      <div className="mt-2 flex items-center space-x-2 text-[11px] font-mono">
                        <span className="text-indigo-400">Score: {entry.score}/100</span>
                        {entry.engineUsed && (
                          <span className="text-slate-500">• {entry.engineUsed}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-600 mt-1 inline-block">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </>
            )}

            {/* Candidate entry (right aligned) */}
            {entry.role === "candidate" && (
              <>
                <div className="max-w-[75%] flex flex-col items-end">
                  <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl rounded-tr-sm px-4 py-2.5">
                    <p className="text-xs font-mono text-emerald-200/90 leading-relaxed italic">
                      "{entry.content}"
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-600 mt-1">
                    You • {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                  <User className="w-4 h-4 text-emerald-400" />
                </div>
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {entries.length === 0 && (
        <div className="text-center text-xs font-mono text-slate-600 py-8">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-700" />
          Conversation will appear here as you speak...
        </div>
      )}
    </div>
  );
};