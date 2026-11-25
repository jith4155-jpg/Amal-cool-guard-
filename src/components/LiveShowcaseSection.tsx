import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type LiveBoxTheme,
  type LiveSaleConfig,
  type LiveSaleItem,
  formatRemainingLiveTime,
  getYoutubeEmbedUrl,
} from '../utils/storeSync';
import { getCategoryAutoImage } from '../utils/categoryArt';
import { CardPaginationDots, MultiSlideCardMedia } from './MultiSlideCardMedia';

interface LiveShowcaseSectionProps {
  config: LiveSaleConfig;
  items: LiveSaleItem[];
  variant?: 'home' | 'profile';
}

const BOX_THEME_STYLES: Record<LiveBoxTheme, string> = {
  crimson: 'from-rose-700 to-red-800 border-rose-500/40 text-white',
  amber: 'from-amber-400 to-yellow-400 border-amber-500 text-slate-950',
  blue: 'from-blue-700 to-indigo-800 border-blue-500/40 text-white',
  emerald: 'from-emerald-700 to-teal-800 border-emerald-500/40 text-white',
};

interface LiveCarouselCardProps {
  item: LiveSaleItem;
  index: number;
  headerLabel: string;
  sectionBadge?: string;
  isProfile: boolean;
  isPlayingVideo: boolean;
  onToggleVideo: () => void;
}

function LiveCarouselCard({
  item,
  index,
  headerLabel,
  sectionBadge,
  isProfile,
  isPlayingVideo,
  onToggleVideo,
}: LiveCarouselCardProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const fallbackImg = getCategoryAutoImage(item.category || 'Coats');
  const slides =
    item.images && item.images.length > 0 ? item.images.filter(Boolean) : [fallbackImg];
  const hasVideos = (item.videos || []).length > 0;
  const firstVideo = item.videos?.[0] || '';
  const ytEmbed = hasVideos ? getYoutubeEmbedUrl(firstVideo) : null;
  const destLink = `/product/live_${item.id}`;

  const videoNode =
    isPlayingVideo && hasVideos ? (
      ytEmbed ? (
        <iframe
          src={`${ytEmbed}?autoplay=1`}
          title={item.title}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="w-full h-full border-0"
        />
      ) : (
        <video
          src={firstVideo}
          controls
          autoPlay
          playsInline
          className="w-full h-full object-cover object-center bg-black"
        />
      )
    ) : undefined;

  return (
    <div className="w-44 sm:w-52 shrink-0 snap-start flex flex-col">
      <div className="bg-white text-gray-900 rounded-xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-md transition flex-1 flex flex-col justify-between group">
        <div>
          <MultiSlideCardMedia
            images={slides}
            alt={item.title}
            linkTo={destLink}
            fallbackImage={fallbackImg}
            aspectClass="aspect-square"
            autoScrollMs={4500}
            staggerDelayMs={(index % 5) * 700}
            activeIndex={slideIndex}
            onIndexChange={setSlideIndex}
            paused={isPlayingVideo}
            videoNode={videoNode}
          >
            {/* Discount % Badge */}
            {item.discountPercent > 0 && (
              <div className="absolute top-2 left-2 flex flex-col gap-1 items-start pointer-events-none z-10">
                <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-xs tabular-nums">
                  {item.discountPercent}% OFF
                </span>
              </div>
            )}

            {/* Video Toggle */}
            {hasVideos && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleVideo();
                }}
                className="absolute bottom-2 right-2 bg-slate-900/90 hover:bg-black text-white text-[10px] font-extrabold px-2 py-1 rounded-lg shadow flex items-center gap-1 z-10 cursor-pointer"
              >
                <span>{isPlayingVideo ? '✕ Photo' : '▶ Video'}</span>
              </button>
            )}

            {slides.length > 1 && !isPlayingVideo && (
              <span className="absolute bottom-2 left-2 bg-white/95 text-gray-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-200 tabular-nums pointer-events-none z-10">
                {slideIndex + 1}/{slides.length}
              </span>
            )}
          </MultiSlideCardMedia>

          <Link to={destLink} className="block p-2.5 sm:p-3 space-y-1">
            <div className="flex items-center gap-1 text-[10px] font-bold text-rose-700 truncate">
              <span className="uppercase shrink-0">{headerLabel || 'LIVE'}</span>
              {(sectionBadge || item.modelName) && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-blue-700 truncate">
                    {sectionBadge || item.modelName}
                  </span>
                </>
              )}
            </div>

            <h3 className="font-extrabold text-xs text-gray-900 leading-snug line-clamp-2 min-h-[2.1rem]">
              {item.title}
            </h3>

            <div className="flex items-baseline gap-1.5 pt-0.5 flex-wrap tabular-nums">
              <span className="text-sm sm:text-base font-black text-gray-900">
                ₹{item.offerPrice}
              </span>
              {item.originalPrice > item.offerPrice && (
                <span className="text-[11px] text-gray-400 line-through">
                  ₹{item.originalPrice}
                </span>
              )}
              {item.offerAmount > 0 && (
                <span className="text-[10px] font-extrabold text-emerald-700">
                  Save ₹{item.offerAmount}
                </span>
              )}
            </div>
          </Link>
        </div>

        <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3">
          <Link
            to={destLink}
            className="h-8 w-full bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 text-[11px] font-extrabold rounded-lg transition flex items-center justify-center whitespace-nowrap shadow-2xs"
          >
            Order Live Deal →
          </Link>
        </div>
      </div>

      {/* Pagination Dots Directly Underneath Single Multi-Slide Card */}
      <CardPaginationDots
        total={slides.length}
        activeIndex={slideIndex}
        onSelect={setSlideIndex}
        variant={isProfile ? 'default' : 'onDark'}
      />
    </div>
  );
}

export default function LiveShowcaseSection({
  config,
  items,
  variant = 'home',
}: LiveShowcaseSectionProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('ALL');

  useEffect(() => {
    if (!config.active) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [config.active]);

  const visibleItems = items.filter(i => i.visible !== false);
  const liveBoxes = config.liveBoxes || [];
  const hasBoxes = liveBoxes.length > 0;

  if (!config.active) {
    return null;
  }

  if (
    visibleItems.length === 0 &&
    !hasBoxes &&
    !config.defaultDiscountPercent &&
    !config.defaultOfferAmount
  ) {
    return null;
  }

  const timeInfo = formatRemainingLiveTime(config, nowMs);
  const isProfile = variant === 'profile';

  const activeBox =
    selectedBoxId === 'ALL' ? null : liveBoxes.find(b => b.id === selectedBoxId) || null;
  const displayedItems = activeBox
    ? visibleItems.filter(
        it =>
          it.boxId === activeBox.id ||
          (activeBox.sectionName &&
            it.sectionName?.trim().toLowerCase() === activeBox.sectionName.trim().toLowerCase())
      )
    : visibleItems;

  return (
    <section
      className={`rounded-2xl overflow-hidden border shadow-sm ${
        isProfile
          ? 'bg-white border-rose-200'
          : 'bg-gradient-to-br from-rose-950 via-red-900 to-slate-900 border-rose-700/40 text-white'
      }`}
    >
      {/* Top LIVE Header + Timer + Active Offer Summary */}
      <div
        className={`px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
          isProfile ? 'bg-gradient-to-r from-rose-700 to-red-700 text-white' : 'border-b border-white/10'
        }`}
      >
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-white text-rose-700 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-md shadow-2xs shrink-0">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
              <span>{config.headerLabel || 'LIVE'}</span>
            </span>

            {config.defaultDiscountPercent > 0 && (
              <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded-md whitespace-nowrap">
                Up to {config.defaultDiscountPercent}% OFF
              </span>
            )}

            {config.defaultOfferAmount > 0 && (
              <span className="bg-emerald-500 text-white text-[11px] font-black px-2 py-0.5 rounded-md whitespace-nowrap">
                Extra ₹{config.defaultOfferAmount} Deal
              </span>
            )}
          </div>

          {config.subtitle && (
            <p className="text-xs text-rose-100 font-medium line-clamp-1 pt-0.5">{config.subtitle}</p>
          )}
        </div>

        {/* Countdown Timer / Duration */}
        <div className="flex items-center gap-2 shrink-0">
          {timeInfo.durationSummary && (
            <span className="text-[11px] font-bold text-rose-100 hidden sm:inline">
              {timeInfo.durationSummary}
            </span>
          )}
          <div className="bg-slate-950/80 border border-white/20 px-3 py-1.5 rounded-xl flex items-center gap-2 tabular-nums">
            <span className="text-[10px] font-bold text-rose-300 uppercase">
              {timeInfo.expired ? 'Ended' : 'Ends In'}
            </span>
            <span className="text-xs sm:text-sm font-black font-mono text-amber-300 tracking-wider">
              {timeInfo.countdownText}
            </span>
          </div>
        </div>
      </div>

      {/* Horizontal Side-by-Side Named Live Offer Boxes */}
      {hasBoxes && (
        <div className={`px-4 pt-3.5 ${visibleItems.length > 0 ? 'pb-1' : 'pb-4'}`}>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {liveBoxes.map(box => {
              const themeCls = BOX_THEME_STYLES[box.theme || 'crimson'] || BOX_THEME_STYLES.crimson;
              const boxLabel = box.sectionName || box.title;
              const assignedCount = visibleItems.filter(
                it =>
                  it.boxId === box.id ||
                  (box.sectionName &&
                    it.sectionName?.trim().toLowerCase() === box.sectionName.trim().toLowerCase())
              ).length;
              const isSelected = selectedBoxId === box.id;

              if (assignedCount > 0) {
                return (
                  <button
                    key={box.id}
                    type="button"
                    onClick={() => setSelectedBoxId(prev => (prev === box.id ? 'ALL' : box.id))}
                    className={`min-w-[205px] sm:min-w-[235px] shrink-0 rounded-xl bg-gradient-to-r ${themeCls} border p-3 flex items-center justify-between gap-2.5 shadow-xs hover:opacity-95 transition text-left cursor-pointer ${
                      isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900' : ''
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block text-[10px] font-black uppercase bg-black/25 px-1.5 py-0.5 rounded">
                          {box.offerBadge}
                        </span>
                        <span className="text-[10px] font-bold opacity-85 truncate">
                          {boxLabel}
                        </span>
                      </div>
                      <p className="text-xs font-extrabold truncate">{box.title}</p>
                      {box.subtitle && (
                        <p className="text-[10px] opacity-85 truncate">{box.subtitle}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-extrabold bg-white/95 text-slate-900 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">
                      {isSelected ? 'All' : `${assignedCount} Items`}
                    </span>
                  </button>
                );
              }

              const firstItem = visibleItems[0];
              const dest = firstItem ? `/product/live_${firstItem.id}` : '/categories';
              return (
                <Link
                  key={box.id}
                  to={dest}
                  className={`min-w-[205px] sm:min-w-[235px] shrink-0 rounded-xl bg-gradient-to-r ${themeCls} border p-3 flex items-center justify-between gap-2.5 shadow-xs hover:opacity-95 transition`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="inline-block text-[10px] font-black uppercase bg-black/25 px-1.5 py-0.5 rounded">
                      {box.offerBadge}
                    </span>
                    <p className="text-xs font-extrabold truncate">{box.title}</p>
                    {box.subtitle && (
                      <p className="text-[10px] opacity-85 truncate">{box.subtitle}</p>
                    )}
                  </div>
                  <span className="text-[11px] font-extrabold bg-white/95 text-slate-900 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">
                    {box.ctaText || 'Shop'} →
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Multiple Horizontal Scrollable Live Cards with Pagination Dots Underneath */}
      {visibleItems.length > 0 && (
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`text-xs font-extrabold uppercase tracking-wider truncate ${
                  isProfile ? 'text-gray-800' : 'text-rose-100'
                }`}
              >
                {activeBox
                  ? `${activeBox.sectionName || activeBox.title} (${displayedItems.length})`
                  : `Live Models & Offers (${displayedItems.length})`}
              </span>
              {activeBox && (
                <button
                  type="button"
                  onClick={() => setSelectedBoxId('ALL')}
                  className="text-[10px] font-extrabold bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded cursor-pointer shrink-0"
                >
                  Show All
                </button>
              )}
            </div>
            <span
              className={`text-[11px] font-semibold shrink-0 ${
                isProfile ? 'text-gray-500' : 'text-rose-200'
              }`}
            >
              Swipe side-by-side →
            </span>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 snap-x">
            {displayedItems.map((item, idx) => {
              const matchedBox = item.boxId
                ? liveBoxes.find(b => b.id === item.boxId)
                : undefined;
              const badge =
                item.sectionName?.trim() ||
                matchedBox?.sectionName?.trim() ||
                matchedBox?.title ||
                undefined;
              return (
                <LiveCarouselCard
                  key={item.id}
                  item={item}
                  index={idx}
                  headerLabel={config.headerLabel || 'LIVE'}
                  sectionBadge={badge}
                  isProfile={isProfile}
                  isPlayingVideo={playingVideoId === item.id}
                  onToggleVideo={() =>
                    setPlayingVideoId(prev => (prev === item.id ? null : item.id))
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
