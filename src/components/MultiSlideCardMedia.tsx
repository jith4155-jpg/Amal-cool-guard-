import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

interface CardPaginationDotsProps {
  total: number;
  activeIndex: number;
  onSelect: (index: number) => void;
  variant?: 'default' | 'onDark';
  className?: string;
}

export function CardPaginationDots({
  total,
  activeIndex,
  onSelect,
  variant = 'default',
  className = '',
}: CardPaginationDotsProps) {
  if (total <= 1) return null;
  const safeActive = ((activeIndex % total) + total) % total;

  return (
    <div
      className={`flex items-center justify-center gap-1.5 py-1.5 ${className}`}
      role="tablist"
      aria-label="Card slides"
    >
      {Array.from({ length: total }).map((_, idx) => {
        const isActive = idx === safeActive;
        return (
          <button
            key={idx}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`Go to slide ${idx + 1} of ${total}`}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(idx);
            }}
            className="p-0.5 cursor-pointer flex items-center justify-center focus:outline-none"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-200 ${
                variant === 'onDark'
                  ? isActive
                    ? 'w-5 bg-sky-400 shadow-xs'
                    : 'w-1.5 bg-white/45 hover:bg-white/75'
                  : isActive
                  ? 'w-5 bg-blue-600 shadow-2xs'
                  : 'w-1.5 bg-slate-400/60 hover:bg-slate-500'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

interface MultiSlideCardMediaProps {
  images: string[];
  alt: string;
  linkTo?: string;
  fallbackImage?: string;
  aspectClass?: string;
  autoScrollMs?: number;
  staggerDelayMs?: number;
  activeIndex: number;
  onIndexChange: (index: number) => void;
  paused?: boolean;
  videoNode?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function MultiSlideCardMedia({
  images,
  alt,
  linkTo,
  fallbackImage,
  aspectClass = 'aspect-square',
  autoScrollMs = 4500,
  staggerDelayMs = 0,
  activeIndex,
  onIndexChange,
  paused = false,
  videoNode,
  children,
  className = '',
}: MultiSlideCardMediaProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const manualLockUntilRef = useRef<number>(0);
  const isScrollEventDrivenRef = useRef<boolean>(false);
  const [brokenSlides, setBrokenSlides] = useState<Record<number, boolean>>({});
  const [isHovered, setIsHovered] = useState(false);

  const safeImages =
    images && images.length > 0
      ? images.filter(Boolean)
      : fallbackImage
      ? [fallbackImage]
      : [];
  const total = safeImages.length;
  const clampedActive = total > 0 ? Math.max(0, Math.min(activeIndex, total - 1)) : 0;

  // Reset broken slide tracking if images array changes
  useEffect(() => {
    setBrokenSlides({});
  }, [images]);

  // Sync horizontal scroll container whenever activeIndex changes from dot click / auto-scroll
  useEffect(() => {
    if (isScrollEventDrivenRef.current) {
      isScrollEventDrivenRef.current = false;
      return;
    }
    const el = scrollRef.current;
    if (!el || total <= 1 || videoNode) return;
    const targetLeft = clampedActive * el.clientWidth;
    if (Math.abs(el.scrollLeft - targetLeft) > 4) {
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
  }, [clampedActive, total, videoNode]);

  // Auto-scroll slides gently when > 1 slide and not interacting or playing video
  useEffect(() => {
    if (total <= 1 || autoScrollMs <= 0 || paused || isHovered || Boolean(videoNode)) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startTimer = setTimeout(() => {
      intervalId = setInterval(() => {
        if (Date.now() < manualLockUntilRef.current) return;
        onIndexChange((clampedActive + 1) % total);
      }, autoScrollMs);
    }, Math.max(0, staggerDelayMs));

    return () => {
      clearTimeout(startTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [total, autoScrollMs, staggerDelayMs, paused, isHovered, videoNode, clampedActive, onIndexChange]);

  const handleManualJump = (nextIdx: number) => {
    manualLockUntilRef.current = Date.now() + 6500;
    const wrapped = ((nextIdx % total) + total) % total;
    onIndexChange(wrapped);
  };

  const handleContainerScroll = () => {
    const el = scrollRef.current;
    if (!el || total <= 1) return;
    const width = el.clientWidth || 1;
    const nextIdx = Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / width)));
    if (nextIdx !== clampedActive) {
      manualLockUntilRef.current = Date.now() + 5000;
      isScrollEventDrivenRef.current = true;
      onIndexChange(nextIdx);
    }
  };

  return (
    <div
      className={`relative ${aspectClass} w-full bg-transparent overflow-hidden select-none ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => {
        manualLockUntilRef.current = Date.now() + 6500;
      }}
    >
      {videoNode ? (
        <div className="w-full h-full">{videoNode}</div>
      ) : total === 0 ? (
        <div className="w-full h-full flex items-center justify-center p-3 text-center text-xs text-gray-400 font-semibold">
          {alt}
        </div>
      ) : total === 1 ? (
        linkTo ? (
          <Link to={linkTo} className="block w-full h-full">
            <img
              src={brokenSlides[0] && fallbackImage ? fallbackImage : safeImages[0]}
              alt={alt}
              referrerPolicy="no-referrer"
              onError={() => setBrokenSlides(prev => ({ ...prev, 0: true }))}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
            />
          </Link>
        ) : (
          <img
            src={brokenSlides[0] && fallbackImage ? fallbackImage : safeImages[0]}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={() => setBrokenSlides(prev => ({ ...prev, 0: true }))}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
          />
        )
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={handleContainerScroll}
            className="flex w-full h-full overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth"
          >
            {safeImages.map((src, idx) => {
              const resolvedSrc = brokenSlides[idx] && fallbackImage ? fallbackImage : src;
              const imgEl = (
                <img
                  src={resolvedSrc}
                  alt={`${alt} ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  onError={() => setBrokenSlides(prev => ({ ...prev, [idx]: true }))}
                  className="w-full h-full object-cover object-center"
                />
              );

              return linkTo ? (
                <Link
                  key={`${idx}_${src.slice(0, 32)}`}
                  to={linkTo}
                  className="w-full h-full shrink-0 snap-center block"
                >
                  {imgEl}
                </Link>
              ) : (
                <div
                  key={`${idx}_${src.slice(0, 32)}`}
                  className="w-full h-full shrink-0 snap-center"
                >
                  {imgEl}
                </div>
              );
            })}
          </div>

          {/* Subtle Left / Right Slide Controls */}
          <button
            type="button"
            aria-label="Previous slide"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              handleManualJump(clampedActive - 1);
            }}
            className="hidden sm:flex opacity-0 group-hover:opacity-100 absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white text-xs font-bold items-center justify-center transition z-10 cursor-pointer"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              handleManualJump(clampedActive + 1);
            }}
            className="hidden sm:flex opacity-0 group-hover:opacity-100 absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white text-xs font-bold items-center justify-center transition z-10 cursor-pointer"
          >
            ›
          </button>
        </>
      )}

      {children}
    </div>
  );
}
