import React, { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Package, Calendar } from "lucide-react";
import { motion } from "framer-motion";

export default function MerchSection({ merch, artistName }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const now = new Date();
  
  // Filter upcoming and available merch
  const upcomingMerch = merch
    .filter(m => m.release_date && new Date(m.release_date) > now && m.status !== "Archived")
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date))
    .slice(0, 12);

  const activeMerch = merch
    .filter(m => (!m.release_date || new Date(m.release_date) <= now) && m.status === "Active")
    .slice(0, 12);

  if (upcomingMerch.length === 0 && activeMerch.length === 0) return null;

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction) => {
    if (scrollRef.current) {
      const amount = 200;
      scrollRef.current.scrollBy({
        left: direction === "right" ? amount : -amount,
        behavior: "smooth"
      });
      setTimeout(handleScroll, 300);
    }
  };

  const MerchCard = ({ item, isUpcoming }) => (
    <motion.div 
      whileHover={{ scale: 1.05 }}
      className="flex-shrink-0 w-32 group cursor-pointer"
    >
      <div className="bg-gradient-to-br from-red-950/20 to-black/40 border border-red-900/20 rounded-lg overflow-hidden">
        <div className="relative aspect-square overflow-hidden bg-black/60">
          {item.cover_artwork_url ? (
            <img
              src={item.cover_artwork_url}
              alt={item.merch_type}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-8 h-8 text-gray-600" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          
          <div className="absolute bottom-1 left-1 right-1 space-y-1">
            <div className="flex items-center gap-1">
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold text-white backdrop-blur-sm ${
                item.quality >= 80 ? "bg-green-600/70" : item.quality >= 60 ? "bg-yellow-600/70" : "bg-red-600/70"
              }`}>
                {item.quality >= 80 ? "★" : item.quality >= 60 ? "◆" : "⚠"}
              </span>
              <span className="text-white text-[8px] font-bold truncate">{item.merch_type}</span>
            </div>
            <p className="text-white text-[10px] font-bold">${item.price_per_unit}</p>
          </div>

          {isUpcoming && (
            <div className="absolute top-1 right-1 bg-purple-600/80 backdrop-blur-sm px-1 py-0.5 rounded text-[7px] font-bold text-white flex items-center gap-0.5">
              <Calendar className="w-2.5 h-2.5" />
              {new Date(item.release_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  const allMerch = [
    ...upcomingMerch.map(m => ({ ...m, isUpcoming: true })),
    ...activeMerch.map(m => ({ ...m, isUpcoming: false }))
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h3 className="text-white text-xs font-bold">🛍️ Merch</h3>
        <span className="text-gray-400 text-[9px]">{allMerch.length} available</span>
      </div>

      <div className="relative group">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
        >
          {allMerch.map((item) => (
            <MerchCard key={item.id} item={item} isUpcoming={item.isUpcoming} />
          ))}
        </div>

        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 p-1 rounded-r opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-3 h-3 text-white" />
          </button>
        )}

        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 p-1 rounded-l opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-3 h-3 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}