import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MiniCard } from "./FestivalCards";

export default function FestivalCarousel({ title, festivals, onCardClick, showNavButtons = true }) {
  const scrollRef = React.useRef(null);
  const [showLeftBtn, setShowLeftBtn] = React.useState(false);
  const [showRightBtn, setShowRightBtn] = React.useState(true);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const amount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    }
  };

  const checkScroll = () => {
    if (scrollRef.current) {
      setShowLeftBtn(scrollRef.current.scrollLeft > 0);
      setShowRightBtn(
        scrollRef.current.scrollLeft < scrollRef.current.scrollWidth - scrollRef.current.clientWidth - 10
      );
    }
  };

  React.useEffect(() => {
    checkScroll();
    const element = scrollRef.current;
    if (element) element.addEventListener('scroll', checkScroll);
    return () => element?.removeEventListener('scroll', checkScroll);
  }, []);

  return (
    <div className="amp-carousel-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 18, paddingRight: 18, marginBottom: 10 }}>
        <div className="amp-section-label">{title}</div>
        {showNavButtons && (
          <div className="amp-carousel-nav">
            <button
              className="amp-carousel-btn"
              onClick={() => scroll('left')}
              disabled={!showLeftBtn}
              style={{ opacity: showLeftBtn ? 1 : 0.3 }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="amp-carousel-btn"
              onClick={() => scroll('right')}
              disabled={!showRightBtn}
              style={{ opacity: showRightBtn ? 1 : 0.3 }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="amp-carousel-scroll" ref={scrollRef}>
        {festivals.map((festivalObj) => (
          <MiniCard
            key={festivalObj.instance?.id || `${festivalObj.festival.id}:${festivalObj.originalItem?.id || festivalObj.originalItem?.name || 'catalog'}`}
            festival={festivalObj.festival}
            instance={festivalObj.instance}
            onClick={() => onCardClick(festivalObj)}
          />
        ))}
      </div>
    </div>
  );
}
