import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Music2, Target, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const TIPS = [
  {
    icon: Music2,
    title: "Hit the Studio",
    desc: "Record your first single to start building streams and fans.",
    color: "#f472b6",
  },
  {
    icon: Target,
    title: "Choose Your Moves",
    desc: "Every turn you pick actions — record, tour, post, or hustle brand deals.",
    color: "#a78bfa",
  },
  {
    icon: Users,
    title: "Grow Your Fanbase",
    desc: "Post on LoopTok, InstaVibe & Xpress to build a loyal following.",
    color: "#67e8f9",
  },
  {
    icon: Zap,
    title: "Stay Active",
    desc: "The industry moves fast. Release music and engage fans to keep your hype up.",
    color: "#34d399",
  },
];

export default function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const justOnboarded = localStorage.getItem("xf_just_onboarded");
    const dismissed = localStorage.getItem("xf_welcome_dismissed");
    if (justOnboarded === "true" && !dismissed) {
      setOpen(true);
    }
  }, []);

  const handleDismiss = () => {
    setOpen(false);
    localStorage.setItem("xf_welcome_dismissed", "true");
    localStorage.removeItem("xf_just_onboarded");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="w-full max-w-sm rounded-[24px] p-6 relative overflow-hidden"
            style={{
              background: "linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(244,114,182,0.08)",
            }}
          >
            {/* Ambient glow */}
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-[80px] opacity-[0.1] pointer-events-none" style={{ background: "#f472b6" }} />
            <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full blur-[60px] opacity-[0.06] pointer-events-none" style={{ background: "#a78bfa" }} />

            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all z-10"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Header */}
            <div className="text-center mb-5">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
              >
                <Sparkles className="w-10 h-10 mx-auto mb-3 text-pink-400/80" />
              </motion.div>
              <h2 className="text-xl font-black text-white mb-1" style={{ textShadow: "0 0 24px rgba(244,114,182,0.2)" }}>
                Welcome to X-Factor
              </h2>
              <p className="text-white/35 text-[11px]">Your career starts now. Here are some quick tips.</p>
            </div>

            {/* Tips */}
            <div className="space-y-2.5 mb-5">
              {TIPS.map((tip, i) => (
                <motion.div
                  key={tip.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className="flex items-start gap-3 rounded-[14px] p-3"
                  style={{
                    background: `${tip.color}08`,
                    border: `1px solid ${tip.color}15`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{ background: `${tip.color}15` }}
                  >
                    <tip.icon className="w-4 h-4" style={{ color: tip.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-white">{tip.title}</p>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">{tip.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <Button
              onClick={handleDismiss}
              className="w-full h-12 rounded-[14px] text-white font-bold text-sm"
              style={{
                background: "linear-gradient(135deg, #f472b6, #a78bfa)",
                boxShadow: "0 8px 24px rgba(244,114,182,0.2)",
              }}
            >
              Let&apos;s Go <Zap className="w-4 h-4 ml-1.5" />
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
