import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  mapLiveConfigFromDb,
  mapLiveItemFromDb,
  OperationType,
} from '../firebase';
import {
  type LiveBoxTheme,
  type LiveSaleConfig,
  type LiveSaleItem,
  formatRemainingLiveTime,
  getLiveConfig,
  getLiveItems,
  getYoutubeEmbedUrl,
  mergeRemoteLiveItems,
  saveLiveConfig,
  syncDeletedLiveItemIds,
} from '../utils/storeSync';
import { getCategoryAutoImage } from '../utils/categoryArt';
import { useLanguage } from '../context/LanguageContext';
import { CardPaginationDots, MultiSlideCardMedia } from './MultiSlideCardMedia';

const BOX_THEME_STYLES: Record<LiveBoxTheme, string> = {
  crimson: 'from-rose-700 to-red-800 border-rose-500/40 text-white',
  amber: 'from-amber-400 to-yellow-400 border-amber-500 text-slate-950',
  blue: 'from-blue-700 to-indigo-800 border-blue-500/40 text-white',
  emerald: 'from-emerald-700 to-teal-800 border-emerald-500/40 text-white',
};

function LiveGridCard({
  item,
  index,
  headerLabel,
  sectionBadge,
  isPlayingVideo,
  onToggleVideo,
}: {
  item: LiveSaleItem;
  index: number;
  headerLabel: string;
  sectionBadge?: string;
  isPlayingVideo: boolean;
  onToggleVideo: () => void;
}) {
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
    <div className="flex flex-col">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs hover:shadow-md transition flex-1 flex flex-col justify-between group">
        <div>
          <MultiSlideCardMedia
            images={slides}
            alt={item.title}
            linkTo={destLink}
            fallbackImage={fallbackImg}
            aspectClass="aspect-square"
            autoScrollMs={4500}
            staggerDelayMs={(index % 5) * 650}
            activeIndex={slideIndex}
            onIndexChange={setSlideIndex}
            paused={isPlayingVideo}
            videoNode={videoNode}
          >
            {item.discountPercent > 0 && (
              <span className="absolute top-2 left-2 bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-xs tabular-nums pointer-events-none z-10">
                {item.discountPercent}% OFF
              </span>
            )}

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

            <h3 className="font-extrabold text-xs sm:text-sm text-gray-900 leading-snug line-clamp-2 min-h-[2.2rem]">
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
            className="h-9 w-full bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 text-xs font-extrabold rounded-lg transition flex items-center justify-center whitespace-nowrap shadow-2xs"
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
      />
    </div>
  );
}

export default function LiveView() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [liveConfig, setLiveConfig] = useState<LiveSaleConfig>(() => getLiveConfig());
  const [liveItems, setLiveItems] = useState<LiveSaleItem[]>(() => getLiveItems());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('ALL');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    if (!liveConfig.active) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [liveConfig.active]);

  useEffect(() => {
    let isMounted = true;

    const syncLocal = () => {
      if (!isMounted) return;
      setLiveConfig(getLiveConfig());
      setLiveItems(getLiveItems());
    };
    window.addEventListener('amal_store_updated', syncLocal);
    window.addEventListener('storage', syncLocal);

    const loadInitialLive = async () => {
      try {
        const [cfgSnap, itemsSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'live')),
          getDocs(collection(db, 'live_items')),
        ]);
        if (!isMounted) return;
        if (cfgSnap.exists()) {
          const data = cfgSnap.data();
          if (Array.isArray(data?.deletedLiveIds)) {
            syncDeletedLiveItemIds(data.deletedLiveIds);
          }
          setLiveConfig(saveLiveConfig(mapLiveConfigFromDb(data), false));
        }
        if (!itemsSnap.empty) {
          setLiveItems(
            mergeRemoteLiveItems(itemsSnap.docs.map(d => mapLiveItemFromDb(d.data(), d.id)))
          );
        }
      } catch (err) {
        console.warn('Live view load warning:', err);
      }
    };
    loadInitialLive();

    const unsubCfg = onSnapshot(
      doc(db, 'settings', 'live'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        const data = snap.data();
        if (Array.isArray(data?.deletedLiveIds)) {
          syncDeletedLiveItemIds(data.deletedLiveIds);
        }
        setLiveConfig(saveLiveConfig(mapLiveConfigFromDb(data), false));
        setLiveItems(getLiveItems());
      },
      err => handleFirestoreError(err, OperationType.GET, 'settings/live')
    );

    const unsubItems = onSnapshot(
      collection(db, 'live_items'),
      snap => {
        if (!isMounted) return;
        if (!snap.empty) {
          setLiveItems(
            mergeRemoteLiveItems(snap.docs.map(d => mapLiveItemFromDb(d.data(), d.id)))
          );
        } else {
          setLiveItems(getLiveItems());
        }
      },
      err => handleFirestoreError(err, OperationType.LIST, 'live_items')
    );

    return () => {
      isMounted = false;
      unsubCfg();
      unsubItems();
      window.removeEventListener('amal_store_updated', syncLocal);
      window.removeEventListener('storage', syncLocal);
    };
  }, []);

  const visibleItems = liveItems.filter(item => item.visible !== false);
  const liveBoxes = liveConfig.liveBoxes || [];
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

  const hasLiveShowcase =
    liveConfig.active &&
    (visibleItems.length > 0 ||
      liveBoxes.length > 0 ||
      liveConfig.defaultDiscountPercent > 0 ||
      liveConfig.defaultOfferAmount > 0);

  const timeInfo = formatRemainingLiveTime(liveConfig, nowMs);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Back to Home"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-700 hover:bg-gray-100 transition shrink-0"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 bg-rose-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-md shrink-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full bg-white ${
                    liveConfig.active ? 'animate-ping' : 'opacity-70'
                  }`}
                />
                <span>{liveConfig.active ? liveConfig.headerLabel || 'LIVE' : t('live')}</span>
              </span>
              <h1 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight truncate">
                Live Offers &amp; Sale Deals
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/orders"
              className="h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-bold text-gray-800 inline-flex items-center whitespace-nowrap transition"
            >
              {t('orders')}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 space-y-5">
        {!hasLiveShowcase ? (
          <div className="max-w-md mx-auto my-8 bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center space-y-4 shadow-2xs">
            <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                <path d="M16.24 7.76a6 6 0 0 1 0 8.48" />
                <path d="M7.76 16.24a6 6 0 0 1 0-8.48" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base sm:text-lg font-extrabold text-gray-900">
                No Live Sale Active Right Now
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Check back soon for live flash offers, limited-time countdown discounts, and special model deals from Amal Coolguard.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-1">
              <Link
                to="/"
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl inline-flex items-center justify-center whitespace-nowrap transition"
              >
                Explore Store
              </Link>
              <Link
                to="/categories"
                className="h-10 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl inline-flex items-center justify-center whitespace-nowrap transition"
              >
                Browse Categories
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Active Live Session Hero Banner with Countdown Timer & Percentage/Price Offers */}
            <section className="rounded-2xl overflow-hidden bg-gradient-to-br from-rose-950 via-red-900 to-slate-900 text-white border border-rose-700/40 shadow-sm">
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 bg-white text-rose-700 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-md shadow-2xs shrink-0">
                      <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                      <span>{liveConfig.headerLabel || 'LIVE'}</span>
                    </span>

                    {liveConfig.defaultDiscountPercent > 0 && (
                      <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2.5 py-0.5 rounded-md whitespace-nowrap">
                        Up to {liveConfig.defaultDiscountPercent}% OFF
                      </span>
                    )}

                    {liveConfig.defaultOfferAmount > 0 && (
                      <span className="bg-emerald-500 text-white text-[11px] font-black px-2.5 py-0.5 rounded-md whitespace-nowrap">
                        Extra ₹{liveConfig.defaultOfferAmount} Deal
                      </span>
                    )}
                  </div>

                  {liveConfig.subtitle && (
                    <p className="text-xs sm:text-sm text-rose-100 font-medium">
                      {liveConfig.subtitle}
                    </p>
                  )}
                </div>

                {/* Live Countdown Clock */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {timeInfo.durationSummary && (
                    <span className="text-[11px] font-bold text-rose-100">
                      {timeInfo.durationSummary}
                    </span>
                  )}
                  <div className="bg-slate-950/85 border border-white/20 px-3.5 py-2 rounded-xl flex items-center gap-2 tabular-nums">
                    <span className="text-[10px] font-bold text-rose-300 uppercase">
                      {timeInfo.expired ? 'Ended' : 'Ends In'}
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-amber-300 tracking-wider">
                      {timeInfo.countdownText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Horizontal Live Offer Boxes */}
              {liveBoxes.length > 0 && (
                <div className="px-4 sm:px-5 pb-4 pt-1">
                  <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                    {liveBoxes.map(box => {
                      const themeCls =
                        BOX_THEME_STYLES[box.theme || 'crimson'] || BOX_THEME_STYLES.crimson;
                      const boxLabel = box.sectionName || box.title;
                      const assignedCount = visibleItems.filter(
                        it =>
                          it.boxId === box.id ||
                          (box.sectionName &&
                            it.sectionName?.trim().toLowerCase() ===
                              box.sectionName.trim().toLowerCase())
                      ).length;
                      const isSelected = selectedBoxId === box.id;

                      if (assignedCount > 0) {
                        return (
                          <button
                            key={box.id}
                            type="button"
                            onClick={() =>
                              setSelectedBoxId(prev => (prev === box.id ? 'ALL' : box.id))
                            }
                            className={`min-w-[210px] sm:min-w-[240px] shrink-0 rounded-xl bg-gradient-to-r ${themeCls} border p-3 flex items-center justify-between gap-2.5 shadow-xs hover:opacity-95 transition text-left cursor-pointer ${
                              isSelected ? 'ring-2 ring-white' : ''
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
                              {isSelected ? 'Show All' : `${assignedCount} Items`}
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
                          className={`min-w-[210px] sm:min-w-[240px] shrink-0 rounded-xl bg-gradient-to-r ${themeCls} border p-3 flex items-center justify-between gap-2.5 shadow-xs hover:opacity-95 transition`}
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
            </section>

            {/* Live Models & Product Cards Grid */}
            {visibleItems.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight truncate">
                      {activeBox
                        ? activeBox.sectionName || activeBox.title
                        : 'Live Deals & Featured Models'}
                    </h2>
                    {activeBox && (
                      <button
                        type="button"
                        onClick={() => setSelectedBoxId('ALL')}
                        className="text-[11px] font-bold text-blue-600 hover:underline shrink-0 cursor-pointer"
                      >
                        Show All
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 font-semibold tabular-nums shrink-0">
                    {displayedItems.length} {displayedItems.length === 1 ? 'Deal' : 'Deals'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
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
                      <LiveGridCard
                        key={item.id}
                        item={item}
                        index={idx}
                        headerLabel={liveConfig.headerLabel || 'LIVE'}
                        sectionBadge={badge}
                        isPlayingVideo={playingVideoId === item.id}
                        onToggleVideo={() =>
                          setPlayingVideoId(prev => (prev === item.id ? null : item.id))
                        }
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
