import { useState, useEffect, useRef } from "react";

const TEA_ITEMS = [
  "☕ The Algorithm is running HOT — experimental sounds are eating right now.",
  "💬 Fan wars are erupting between two rising drill artists. Engagement up 300%.",
  "📡 Platform spotlight shifted to Reel-O. Short clips going viral faster than ever.",
  "🤝 A surprise collab announcement just sent ripples through the charts.",
  "📉 Brand deals being pulled from artists with active scandals. Watch your rep.",
  "🔥 Underground scene heating up — authenticity is clocking more plays than polish.",
  "👀 A new trend just emerged. First movers will clean up.",
];

export default function TeaTicker({ newsItems = [] }) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  // Merge live news headlines with static tea items
  const liveHeadlines = newsItems.slice(0, 5).map(n => `${n.impact_score > 0 ? "📈" : "📉"} ${n.headline}`);
  const allItems = [...liveHeadlines, ...TEA_ITEMS];

  // Use a ref so the interval callback always reads the current length
  const lengthRef = useRef(allItems.length);
  useEffect(() => { lengthRef.current = allItems.length; }, [allItems.length]);

  useEffect(() => {
    setIdx(0); // reset position when list changes
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % lengthRef.current);
        setFade(true);
      }, 400);
    }, 4000);
    return () => clearInterval(t);
  }, [allItems.length]);

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-2xl overflow-hidden"
      style={{ background: "rgba(244,114,182,0.06)", border: "1px solid rgba(244,114,182,0.12)" }}
    >
      <div className="shrink-0 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#f472b6" }} />
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#f472b6" }}>
          TEA
        </span>
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <p
          className="text-xs truncate transition-opacity duration-300"
          style={{ color: "#9ca3af", opacity: fade ? 1 : 0 }}
        >
          {allItems[idx % allItems.length]}
        </p>
      </div>
    </div>
  );
}
