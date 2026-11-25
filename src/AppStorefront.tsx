import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import {
  db,
  mapProductFromDb,
  mapCategoryFromDb,
  mapLiveConfigFromDb,
  mapLiveItemFromDb,
  OperationType,
  handleFirestoreError,
} from './firebase';
import { Link } from 'react-router-dom';
import { Product } from './data/mockProducts';
import { useLanguage, LanguageSelector } from './context/LanguageContext';
import { ThemeSwitcher } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';
import LiveShowcaseSection from './components/LiveShowcaseSection';
import LocationPickerModal from './components/LocationPickerModal';
import { CardPaginationDots, MultiSlideCardMedia } from './components/MultiSlideCardMedia';
import { getSavedLocationDisplayLabel } from './utils/locationSync';
import { type CategoryItem, getCategoryAutoImage } from './utils/categoryArt';
import {
  getCatalogProducts,
  mergeRemoteCatalogProducts,
  syncReferralFromUrl,
  getCategoryItems,
  mergeRemoteCategoryItems,
  syncDeletedCategoryIds,
  calculateProductTotals,
  syncDeletedProductIds,
  safeJsonParse,
  getLiveConfig,
  saveLiveConfig,
  getLiveItems,
  mergeRemoteLiveItems,
  syncDeletedLiveItemIds,
  getPaymentSettings,
  savePaymentSettingsSync,
  type StorePaymentSettings,
  type LiveSaleConfig,
  type LiveSaleItem,
} from './utils/storeSync';

export default function AppStorefront() {
  const { t } = useLanguage();
  const { user, profile, updateUserProfile } = useAuth();

  const [products, setProducts] = useState<Product[]>(() => getCatalogProducts());
  const [categoryItems, setCategoryItems] = useState<CategoryItem[]>(() => getCategoryItems());
  const [liveConfig, setLiveConfig] = useState<LiveSaleConfig>(() => getLiveConfig());
  const [liveItems, setLiveItems] = useState<LiveSaleItem[]>(() => getLiveItems());
  const [paymentSettings, setPaymentSettings] = useState<StorePaymentSettings>(() =>
    getPaymentSettings()
  );
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerManualLockRef = useRef<number>(0);
  const bannerTouchStartXRef = useRef<number | null>(null);

  const wishlistKey = user ? `amal_wishlist_${user.uid}` : 'amal_wishlist_guest';
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  // Location selector state
  const [selectedLocation, setSelectedLocation] = useState<string>(() =>
    getSavedLocationDisplayLabel()
  );
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [profileAvatarFailed, setProfileAvatarFailed] = useState(false);

  useEffect(() => {
    setProfileAvatarFailed(false);
  }, [user?.photoURL]);

  useEffect(() => {
    try {
      const savedWishlistIds: string[] = safeJsonParse<string[]>(
        localStorage.getItem(wishlistKey),
        []
      );
      const wishMap: Record<string, boolean> = {};
      savedWishlistIds.forEach(id => {
        wishMap[id] = true;
      });
      setWishlist(wishMap);
    } catch {
      setWishlist({});
    }
  }, [wishlistKey]);

  useEffect(() => {
    let isMounted = true;

    syncReferralFromUrl(true);

    const handleStoreSync = () => {
      if (isMounted) {
        setProducts(getCatalogProducts());
        setCategoryItems(getCategoryItems());
        setLiveConfig(getLiveConfig());
        setLiveItems(getLiveItems());
        setPaymentSettings(getPaymentSettings());
        setSelectedLocation(getSavedLocationDisplayLabel());
        setBrokenImages({});
      }
    };
    window.addEventListener('amal_store_updated', handleStoreSync);
    window.addEventListener('storage', handleStoreSync);

    const loadRemoteCatalogAndSettings = async () => {
      try {
        const [
          catSettingsSnap,
          catalogSnap,
          catCollSnap,
          prodSnap,
          liveSettingsSnap,
          liveItemsSnap,
          paymentSettingsSnap,
        ] = await Promise.all([
          getDoc(doc(db, 'settings', 'categories')),
          getDoc(doc(db, 'settings', 'catalog')),
          getDocs(collection(db, 'categories')),
          getDocs(collection(db, 'products')),
          getDoc(doc(db, 'settings', 'live')),
          getDocs(collection(db, 'live_items')),
          getDoc(doc(db, 'settings', 'payment')),
        ]);

        if (!isMounted) return;

        if (paymentSettingsSnap.exists()) {
          setPaymentSettings(
            savePaymentSettingsSync({
              ...getPaymentSettings(),
              ...(paymentSettingsSnap.data() as Partial<StorePaymentSettings>),
            })
          );
        }

        if (liveSettingsSnap.exists()) {
          const lData = liveSettingsSnap.data();
          if (Array.isArray(lData?.deletedLiveIds)) {
            syncDeletedLiveItemIds(lData.deletedLiveIds);
          }
          setLiveConfig(saveLiveConfig(mapLiveConfigFromDb(lData), false));
        }

        if (!liveItemsSnap.empty) {
          const fetchedLive = liveItemsSnap.docs.map(d => mapLiveItemFromDb(d.data(), d.id));
          setLiveItems(mergeRemoteLiveItems(fetchedLive));
        } else {
          setLiveItems(getLiveItems());
        }

        if (catalogSnap.exists()) {
          const catData = catalogSnap.data();
          if (Array.isArray(catData?.deletedIds)) {
            syncDeletedProductIds(catData.deletedIds);
          }
        }

        if (catSettingsSnap.exists()) {
          const catData = catSettingsSnap.data();
          if (Array.isArray(catData?.deletedCategoryIds)) {
            syncDeletedCategoryIds(catData.deletedCategoryIds);
          }
        }

        if (!catCollSnap.empty) {
          const fetchedCats = catCollSnap.docs.map(d => mapCategoryFromDb(d.data(), d.id));
          setCategoryItems(mergeRemoteCategoryItems(fetchedCats));
        } else {
          setCategoryItems(getCategoryItems());
        }

        const fetched: Product[] = prodSnap.docs.map(d => mapProductFromDb(d.data(), d.id));
        const merged = mergeRemoteCatalogProducts(fetched);
        if (isMounted) {
          setProducts(merged);
          setBrokenImages({});
        }
      } catch (err) {
        console.warn('Firestore storefront load warning:', err);
      }
    };

    loadRemoteCatalogAndSettings();

    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      snap => {
        if (!isMounted) return;
        const fetched = snap.docs.map(d => mapProductFromDb(d.data(), d.id));
        const merged = mergeRemoteCatalogProducts(fetched);
        setProducts(merged);
        setBrokenImages({});
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'products');
      }
    );

    const unsubCategoriesColl = onSnapshot(
      collection(db, 'categories'),
      snap => {
        if (!isMounted) return;
        if (!snap.empty) {
          const fetchedCats = snap.docs.map(d => mapCategoryFromDb(d.data(), d.id));
          setCategoryItems(mergeRemoteCategoryItems(fetchedCats));
        } else {
          setCategoryItems(getCategoryItems());
        }
        setBrokenImages({});
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'categories');
      }
    );

    const unsubCategoriesSettings = onSnapshot(
      doc(db, 'settings', 'categories'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        const data = snap.data();
        if (Array.isArray(data?.deletedCategoryIds)) {
          syncDeletedCategoryIds(data.deletedCategoryIds);
          setCategoryItems(getCategoryItems());
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'settings/categories');
      }
    );

    const unsubCatalog = onSnapshot(
      doc(db, 'settings', 'catalog'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        const data = snap.data();
        if (Array.isArray(data?.deletedIds)) {
          syncDeletedProductIds(data.deletedIds);
          setProducts(getCatalogProducts());
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'settings/catalog');
      }
    );

    const unsubLiveConfig = onSnapshot(
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
      error => {
        console.warn('Firestore live config warning:', error);
      }
    );

    const unsubLiveItems = onSnapshot(
      collection(db, 'live_items'),
      snap => {
        if (!isMounted) return;
        const fetchedLive = snap.docs.map(d => mapLiveItemFromDb(d.data(), d.id));
        setLiveItems(mergeRemoteLiveItems(fetchedLive));
      },
      error => {
        console.warn('Firestore live items warning:', error);
      }
    );

    const unsubPaymentSettings = onSnapshot(
      doc(db, 'settings', 'payment'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        setPaymentSettings(
          savePaymentSettingsSync({
            ...getPaymentSettings(),
            ...(snap.data() as Partial<StorePaymentSettings>),
          })
        );
      },
      error => {
        console.warn('Firestore payment settings warning:', error);
      }
    );

    return () => {
      isMounted = false;
      unsubProducts();
      unsubCategoriesColl();
      unsubCategoriesSettings();
      unsubCatalog();
      unsubLiveConfig();
      unsubLiveItems();
      unsubPaymentSettings();
      window.removeEventListener('amal_store_updated', handleStoreSync);
      window.removeEventListener('storage', handleStoreSync);
    };
  }, []);

  const toggleWishlist = (e: React.MouseEvent, productId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const isSaved = wishlist[productId];
    const newWishlist = { ...wishlist, [productId]: !isSaved };
    setWishlist(newWishlist);

    const activeIds = Object.keys(newWishlist).filter(id => newWishlist[id]);
    localStorage.setItem(wishlistKey, JSON.stringify(activeIds));
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const visibleCategories = useMemo(
    () => categoryItems.filter(c => c.visible !== false),
    [categoryItems]
  );

  const hiddenCategoryNames = useMemo(
    () =>
      new Set(
        categoryItems
          .filter(c => c.visible === false)
          .map(c => c.name.trim().toLowerCase())
      ),
    [categoryItems]
  );

  // If currently selected category becomes hidden or deleted, reset to All
  useEffect(() => {
    if (
      selectedCategory !== 'All' &&
      !visibleCategories.some(
        c => c.name.trim().toLowerCase() === selectedCategory.trim().toLowerCase()
      )
    ) {
      setSelectedCategory('All');
    }
  }, [selectedCategory, visibleCategories]);

  const visibleProducts = useMemo(
    () =>
      products.filter(
        p =>
          p.visible !== false &&
          !hiddenCategoryNames.has((p.category || '').trim().toLowerCase())
      ),
    [products, hiddenCategoryNames]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleProducts.filter(p => {
      const matchesCategory =
        selectedCategory === 'All' ||
        (p.category || '').trim().toLowerCase() === selectedCategory.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.tag?.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [visibleProducts, selectedCategory, searchQuery]);

  // Flipkart-style Home sections when unfiltered
  const bannerProducts = useMemo(() => {
    const explicitlyPlaced = visibleProducts.filter(p => p.placement === 'banner');
    return explicitlyPlaced.length > 0 ? explicitlyPlaced : visibleProducts.slice(0, 3);
  }, [visibleProducts]);

  const bannerSlides = useMemo(() => {
    if (bannerProducts.length === 0) return [];
    if (bannerProducts.length === 1) {
      const p = bannerProducts[0];
      const imgs = (p.galleryImages || []).filter(Boolean);
      const uniqueImgs = imgs.length > 1 ? imgs : [p.imageUrl || imgs[0] || getCategoryAutoImage(p.category || 'Coats')];
      return uniqueImgs.map((img, idx) => ({
        key: `${p.id}_${idx}`,
        product: p,
        image: img,
      }));
    }
    return bannerProducts.map(p => ({
      key: p.id,
      product: p,
      image: p.imageUrl || (p.galleryImages?.[0] ?? '') || getCategoryAutoImage(p.category || 'Coats'),
    }));
  }, [bannerProducts]);

  const safeBannerIndex =
    bannerSlides.length > 0 ? ((bannerIndex % bannerSlides.length) + bannerSlides.length) % bannerSlides.length : 0;
  const activeBannerSlide = bannerSlides.length > 0 ? bannerSlides[safeBannerIndex] : null;
  const activeBanner = activeBannerSlide ? activeBannerSlide.product : null;

  const dealProducts = useMemo(() => {
    const explicitlyPlaced = visibleProducts.filter(p => p.placement === 'deals');
    if (explicitlyPlaced.length > 0) return explicitlyPlaced.slice(0, 8);
    return visibleProducts.slice(0, 6);
  }, [visibleProducts]);

  const spotlightProducts = useMemo(() => {
    const explicitlyPlaced = visibleProducts.filter(p => p.placement === 'spotlight');
    if (explicitlyPlaced.length > 0) return explicitlyPlaced.slice(0, 6);
    return visibleProducts.slice(0, 3);
  }, [visibleProducts]);

  const selectedCategoryObj = useMemo(
    () =>
      selectedCategory === 'All'
        ? null
        : visibleCategories.find(
            c => c.name.trim().toLowerCase() === selectedCategory.trim().toLowerCase()
          ) || null,
    [selectedCategory, visibleCategories]
  );

  const isFilteredView = selectedCategory !== 'All' || Boolean(searchQuery.trim());

  // Gentle auto-scroll for single-card Hero Banner slider
  useEffect(() => {
    if (isFilteredView || bannerSlides.length <= 1) return;
    const timer = setInterval(() => {
      if (Date.now() < bannerManualLockRef.current) return;
      setBannerIndex(prev => (prev + 1) % bannerSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isFilteredView, bannerSlides.length]);

  const handleSelectBannerSlide = (nextIdx: number) => {
    if (bannerSlides.length === 0) return;
    bannerManualLockRef.current = Date.now() + 6500;
    setBannerIndex(((nextIdx % bannerSlides.length) + bannerSlides.length) % bannerSlides.length);
  };

  const whatsappNum = paymentSettings.whatsappNumber || '6238113451';
  const bannerSectionHeading = paymentSettings.sectionTitleBanner?.trim() || '';
  const dealsHeading = paymentSettings.sectionTitleDeals?.trim() || 'Amal Value Deals';
  const spotlightHeading = paymentSettings.sectionTitleSpotlight?.trim() || 'In the Spotlight';
  const gridHeading = paymentSettings.sectionTitleGrid?.trim() || 'Suggested For You';

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Location Selector Bar (Compact GPS / Google Maps Trigger) */}
      {paymentSettings.enableLocationBar !== false && (
        <div className="bg-[#0B1324] border-b-[1px] border-slate-800 px-3 sm:px-6 lg:px-8 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowLocationModal(true)}
              className="flex items-center gap-1.5 min-w-0 text-left group cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5 text-sky-400 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                aria-hidden="true"
              >
                <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
                <circle cx="12" cy="11" r="2.2" />
              </svg>
              <span className="text-slate-400 shrink-0">Deliver to:</span>
              <span className="text-sky-300 font-bold group-hover:text-sky-200 underline underline-offset-2 truncate">
                {selectedLocation}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowLocationModal(true)}
              className="text-[10.5px] sm:text-[11px] font-bold text-sky-300 hover:text-white bg-[#151F32] hover:bg-[#1E293B] border-[1px] border-slate-700/80 px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0 transition cursor-pointer"
            >
              GPS / Map
            </button>
          </div>
        </div>
      )}

      {/* Compact, Clean Header with Brand Logo & Round Profile Icon */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5">
          <div className="flex items-center justify-between gap-2">
            <Link to="/" className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              <img
                src="/assets/aistudio/file_000000004d888211a2ae8deecb004de1_adbff682.png"
                alt="Amal Coolguard"
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 border-blue-600 object-cover shadow-xs shrink-0"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-sm sm:text-lg font-extrabold text-blue-700 tracking-tight whitespace-nowrap truncate leading-tight">
                  {t('brandName')}
                </span>
                <span className="text-[10px] sm:text-xs font-semibold text-gray-500 truncate leading-tight">
                  {t('tagline') || 'Sun Protection Gear'}
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <ThemeSwitcher compact />
              <LanguageSelector compact />

              {user ? (
                <Link
                  to="/account"
                  title={profile?.email || user.email || 'My Profile'}
                  aria-label="My Profile"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-[1.5px] border-sky-400/80 bg-[#151F32] text-sky-300 flex items-center justify-center shadow-xs hover:ring-2 hover:ring-sky-400/40 transition shrink-0"
                >
                  {user.photoURL && !profileAvatarFailed ? (
                    <img
                      src={user.photoURL}
                      alt="Profile"
                      referrerPolicy="no-referrer"
                      onError={() => setProfileAvatarFailed(true)}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <svg
                      className="w-4 h-4 sm:w-[18px] sm:h-[18px]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.1"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="8.5" r="4" />
                      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
                    </svg>
                  )}
                </Link>
              ) : (
                paymentSettings.enableLoginButton !== false && (
                  <Link
                    to="/login"
                    className="h-8 sm:h-9 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 rounded-full shadow-xs transition whitespace-nowrap shrink-0"
                  >
                    {t('login')}
                  </Link>
                )
              )}

              {paymentSettings.enableWhatsAppWidget !== false && (
                <a
                  href={`https://wa.me/91${whatsappNum}?text=Hello%20Amal%20Coolguard,%20I%20have%20an%20enquiry.`}
                  target="_blank"
                  rel="noreferrer"
                  title="WhatsApp Support"
                  aria-label="WhatsApp Support"
                  className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center shadow-xs transition shrink-0"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.1c-.2.6-1.3 1.1-1.9 1.2-.5.1-1.1.1-1.8-.1a14 14 0 0 1-5.8-3.6 10.6 10.6 0 0 1-2.2-3.4c-.3-.8 0-1.6.5-2.1.3-.3.7-.5 1-.5h.7c.2 0 .5 0 .7.5l.9 2.1c.1.2.1.5 0 .7l-.4.6c-.2.2-.3.4-.1.7.4.7 1 1.4 1.7 2 .8.7 1.6 1.2 2.4 1.5.3.1.5 0 .7-.2l.7-.8c.2-.2.5-.3.8-.2l2 .9c.4.2.5.4.5.7 0 .3-.1.8-.4 1.3Z" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="pt-2">
            <div className="relative flex items-center">
              <svg
                className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-9 sm:h-10 bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-8 text-xs sm:text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Clean Rounded Category Cards Rail (Unified Dark Slate/Navy) */}
      <div className="bg-[#0B1324] border-b-[1px] border-slate-800/90 px-3 py-3 overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto flex items-stretch gap-2.5 sm:gap-3 min-w-max">
          {/* For You / All Compact Card */}
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`w-[78px] sm:w-[86px] shrink-0 rounded-2xl border-[1.5px] p-2 flex flex-col items-center justify-start gap-1.5 transition cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-[#1E293B] border-sky-400 ring-1 ring-sky-400/40 shadow-md text-white'
                : 'bg-[#151F32] border-slate-700/80 hover:border-sky-400/60 hover:bg-[#19253B] text-slate-200'
            }`}
          >
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center border-[1px] shrink-0 transition ${
                selectedCategory === 'All'
                  ? 'bg-sky-500 border-sky-300/70 text-white shadow-xs'
                  : 'bg-[#0F172A] border-slate-700/70 text-sky-300'
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <span
              className={`text-[10.5px] sm:text-[11px] font-bold text-center leading-tight line-clamp-2 ${
                selectedCategory === 'All' ? 'text-white' : 'text-slate-200'
              }`}
            >
              For You
            </span>
          </button>

          {visibleCategories.map(cat => {
            const active =
              selectedCategory.trim().toLowerCase() === cat.name.trim().toLowerCase();
            const imgSrc = brokenImages[cat.id]
              ? getCategoryAutoImage(cat.name)
              : cat.imageUrl || getCategoryAutoImage(cat.name);

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                className={`w-[78px] sm:w-[86px] shrink-0 rounded-2xl border-[1.5px] p-2 flex flex-col items-center justify-start gap-1.5 transition cursor-pointer ${
                  active
                    ? 'bg-[#1E293B] border-sky-400 ring-1 ring-sky-400/40 shadow-md text-white'
                    : 'bg-[#151F32] border-slate-700/80 hover:border-sky-400/60 hover:bg-[#19253B] text-slate-200'
                }`}
              >
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-[#0F172A] border-[1px] border-slate-700/70 shrink-0">
                  <img
                    src={imgSrc}
                    alt={cat.name}
                    referrerPolicy="no-referrer"
                    onError={() => setBrokenImages(prev => ({ ...prev, [cat.id]: true }))}
                    className="w-full h-full object-cover object-center"
                  />
                </div>
                <span
                  className={`text-[10.5px] sm:text-[11px] font-bold text-center leading-tight line-clamp-2 ${
                    active ? 'text-white' : 'text-slate-200'
                  }`}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Store Container */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 space-y-5">
        {!isFilteredView && liveConfig.active && (
          <LiveShowcaseSection config={liveConfig} items={liveItems} variant="home" />
        )}

        {visibleProducts.length === 0 ? (
          liveConfig.active && liveItems.some(i => i.visible !== false) ? null : (
            <div className="py-16 px-4 bg-white rounded-2xl border border-dashed border-gray-300 text-center space-y-4 max-w-md mx-auto my-4 shadow-2xs">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-base text-gray-900">
                  ഉൽപ്പന്നങ്ങൾ ലഭ്യമല്ല (No Products Yet)
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Add or enable products and categories from the Admin Panel.
                </p>
              </div>
            </div>
          )
        ) : isFilteredView ? (
          /* Filtered Category or Search View */
          <main className="space-y-4">
            {selectedCategoryObj && !searchQuery.trim() && (
              <div className="bg-[#151F32] border-[1.5px] border-slate-700/80 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#0F172A] border-[1px] border-slate-700/70 shrink-0">
                    <img
                      src={
                        selectedCategoryObj.imageUrl ||
                        getCategoryAutoImage(selectedCategoryObj.name)
                      }
                      alt={selectedCategoryObj.name}
                      className="w-full h-full object-cover object-center"
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-extrabold text-sm sm:text-lg text-white truncate">
                      {selectedCategoryObj.name}
                    </h2>
                    <p className="text-xs text-sky-300 font-semibold tabular-nums">
                      {filteredProducts.length} {t('productsCount')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className="h-8 px-3.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 border-[1px] border-slate-600 text-slate-100 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition"
                >
                  Show All
                </button>
              </div>
            )}

            {searchQuery.trim() && (
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-sm sm:text-base text-gray-900">
                  Results for &ldquo;{searchQuery.trim()}&rdquo;
                </h2>
                <span className="text-xs text-gray-500 font-semibold tabular-nums">
                  {filteredProducts.length} {t('productsCount')}
                </span>
              </div>
            )}

            {filteredProducts.length === 0 ? (
              <div className="py-12 px-4 bg-white rounded-2xl border border-gray-200 text-center space-y-3 max-w-md mx-auto">
                <h3 className="font-extrabold text-sm text-gray-900">
                  No matching products found
                </h3>
                <p className="text-xs text-gray-500">
                  Try another category or clear your search filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSearchQuery('');
                  }}
                  className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition whitespace-nowrap"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <StoreProductGrid
                products={filteredProducts}
                wishlist={wishlist}
                brokenImages={brokenImages}
                onToggleWishlist={toggleWishlist}
                onImageError={id => setBrokenImages(prev => ({ ...prev, [id]: true }))}
                t={t}
              />
            )}
          </main>
        ) : (
          /* Home Storefront Flipkart-Style Curated Layout */
          <>
            {/* 1. Hero Promo Showcase Single-Card Slider + Dots Underneath */}
            {paymentSettings.enableHeroBanner !== false && activeBanner && activeBannerSlide && (() => {
              const bTotals = calculateProductTotals(activeBanner);
              const bDiscount =
                bTotals.originalBase > bTotals.basePrice
                  ? Math.round(
                      ((bTotals.originalBase - bTotals.basePrice) / bTotals.originalBase) * 100
                    )
                  : 0;
              return (
                <div className="space-y-1">
                  <section
                    onTouchStart={e => {
                      bannerTouchStartXRef.current = e.touches[0]?.clientX ?? null;
                      bannerManualLockRef.current = Date.now() + 6500;
                    }}
                    onTouchEnd={e => {
                      const startX = bannerTouchStartXRef.current;
                      const endX = e.changedTouches[0]?.clientX ?? null;
                      bannerTouchStartXRef.current = null;
                      if (startX !== null && endX !== null && bannerSlides.length > 1) {
                        const diff = startX - endX;
                        if (Math.abs(diff) > 40) {
                          handleSelectBannerSlide(
                            diff > 0 ? safeBannerIndex + 1 : safeBannerIndex - 1
                          );
                        }
                      }
                    }}
                    className="relative w-full rounded-2xl overflow-hidden shadow-xs border border-gray-200/80 bg-transparent group"
                  >
                    <Link
                      to={`/product/${activeBanner.id}`}
                      className="relative block w-full aspect-[21/9] sm:aspect-[24/9] md:aspect-[3/1] min-h-[160px] sm:min-h-[220px] md:min-h-[270px] overflow-hidden bg-transparent"
                    >
                      <img
                        src={activeBannerSlide.image}
                        alt={activeBanner.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-center group-hover:scale-[1.01] transition duration-300"
                      />

                      {/* Clean non-intrusive floating badge if label/tag exists */}
                      {(activeBanner.sectionLabel || bannerSectionHeading || activeBanner.tag) && (
                        <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
                          <span className="bg-[#FFC200] text-slate-950 text-[11px] sm:text-xs font-black px-2.5 py-1 rounded-lg shadow-md uppercase tracking-wide">
                            {activeBanner.sectionLabel || bannerSectionHeading || activeBanner.tag}
                          </span>
                        </div>
                      )}
                    </Link>

                    {bannerSlides.length > 1 && (
                      <>
                        <button
                          type="button"
                          aria-label="Previous featured slide"
                          onClick={() => handleSelectBannerSlide(safeBannerIndex - 1)}
                          className="hidden sm:flex opacity-0 group-hover:opacity-100 absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950/70 hover:bg-slate-950 text-white text-sm font-bold items-center justify-center transition cursor-pointer z-20"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          aria-label="Next featured slide"
                          onClick={() => handleSelectBannerSlide(safeBannerIndex + 1)}
                          className="hidden sm:flex opacity-0 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950/70 hover:bg-slate-950 text-white text-sm font-bold items-center justify-center transition cursor-pointer z-20"
                        >
                          ›
                        </button>
                      </>
                    )}
                  </section>

                  {/* Dots Indicator Directly Underneath Hero Slider Card */}
                  <CardPaginationDots
                    total={bannerSlides.length}
                    activeIndex={safeBannerIndex}
                    onSelect={handleSelectBannerSlide}
                  />
                </div>
              );
            })()}

            {/* 2. Amal Value Deals Strip (Dark Emerald Strip) */}
            {paymentSettings.enableValueDeals !== false && dealProducts.length > 0 && (
              <section className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 rounded-2xl p-4 sm:p-5 text-white shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                      {dealsHeading}
                    </h2>
                    <p className="text-[11px] text-emerald-200">
                      Top heat-protection &amp; daily essentials at special prices
                    </p>
                  </div>
                  <Link
                    to="/categories"
                    className="h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center whitespace-nowrap transition"
                  >
                    Explore →
                  </Link>
                </div>

                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {dealProducts.map(deal => {
                    const dTotals = calculateProductTotals(deal);
                    const dPercent =
                      dTotals.originalBase > dTotals.basePrice
                        ? Math.round(
                            ((dTotals.originalBase - dTotals.basePrice) / dTotals.originalBase) * 100
                          )
                        : 0;
                    const dealRibbon =
                      deal.tag || (dPercent > 0 ? `Min. ${dPercent}% Off` : `Just ₹${dTotals.finalTotal}`);
                    return (
                      <Link
                        key={deal.id}
                        to={`/product/${deal.id}`}
                        className="w-36 sm:w-44 shrink-0 bg-white text-gray-900 rounded-xl overflow-hidden shadow-xs hover:-translate-y-0.5 transition group flex flex-col"
                      >
                        <div className="aspect-square w-full bg-transparent overflow-hidden">
                          <img
                            src={deal.imageUrl}
                            alt={deal.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-200"
                          />
                        </div>
                        <div className="bg-emerald-600 text-white text-[11px] font-extrabold text-center py-1 px-1.5 truncate">
                          {dealRibbon}
                        </div>
                        <div className="p-2 text-center bg-white">
                          <p className="text-xs font-bold text-gray-900 truncate">{deal.name}</p>
                          <p className="text-[11px] font-extrabold text-emerald-700 tabular-nums mt-0.5">
                            ₹{dTotals.finalTotal}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 3. Spotlight Collections Strip */}
            {paymentSettings.enableSpotlight !== false && spotlightProducts.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-sm sm:text-lg text-gray-900 tracking-tight">
                    {spotlightHeading}
                  </h2>
                  <Link
                    to="/categories"
                    className="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap"
                  >
                    See All
                  </Link>
                </div>

                <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                  {spotlightProducts.slice(0, 3).map(item => {
                    const sTotals = calculateProductTotals(item);
                    const sPercent =
                      sTotals.originalBase > sTotals.basePrice
                        ? Math.round(
                            ((sTotals.originalBase - sTotals.basePrice) / sTotals.originalBase) * 100
                          )
                        : 0;
                    const caption =
                      item.tag || (sPercent > 0 ? `Up to ${sPercent}% Off` : `₹${sTotals.finalTotal}`);
                    return (
                      <Link
                        key={item.id}
                        to={`/product/${item.id}`}
                        className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs hover:shadow-md transition group flex flex-col"
                      >
                        <div className="relative aspect-[4/5] sm:aspect-square bg-transparent overflow-hidden">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
                          />
                          <div className="absolute bottom-2 inset-x-2 pointer-events-none flex justify-center z-10">
                            <span className="bg-[#FFC200] text-slate-950 text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-md shadow-md truncate">
                              {caption}
                            </span>
                          </div>
                        </div>
                        <div className="p-2 sm:p-3 text-center">
                          <p className="text-[11px] sm:text-xs font-bold text-gray-900 truncate">
                            {item.name}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 4. Suggested For You / Complete Catalog Grid */}
            {paymentSettings.enableSuggestedGrid !== false && (
              <main className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-extrabold text-sm sm:text-lg text-gray-900 tracking-tight">
                    {gridHeading}
                  </h2>
                  <span className="text-xs text-gray-500 font-semibold tabular-nums whitespace-nowrap shrink-0">
                    {visibleProducts.length} {t('productsCount')}
                  </span>
                </div>

                <StoreProductGrid
                  products={visibleProducts}
                  wishlist={wishlist}
                  onToggleWishlist={toggleWishlist}
                  t={t}
                />
              </main>
            )}
          </>
        )}
      </div>

      {/* Interactive Live GPS & Google Maps Location Modal */}
      <LocationPickerModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onSaved={loc => {
          setSelectedLocation(loc.displayName);
          if (user) {
            void updateUserProfile({
              address: loc.fullAddress,
              pincode: loc.pincode || undefined,
            }).catch(() => {});
          }
        }}
      />
    </div>
  );
}

interface StoreProductGridProps {
  products: Product[];
  wishlist: Record<string, boolean>;
  brokenImages?: Record<string, boolean>;
  onToggleWishlist: (e: React.MouseEvent, id: string) => void;
  onImageError?: (id: string) => void;
  t: (key: any) => string;
}

function StoreProductCard({
  product,
  index,
  isSavedInWishlist,
  onToggleWishlist,
  t,
}: {
  product: Product;
  index: number;
  isSavedInWishlist: boolean;
  onToggleWishlist: (e: React.MouseEvent, id: string) => void;
  t: (key: any) => string;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const totals = calculateProductTotals(product);
  const totalWithExtras = totals.finalTotal;
  const discountPercent =
    totals.originalBase > totals.basePrice
      ? Math.round(((totals.originalBase - totals.basePrice) / totals.originalBase) * 100)
      : 0;
  const fallbackImg = getCategoryAutoImage(product.category || 'Coats');
  const slides =
    product.galleryImages && product.galleryImages.length > 0
      ? product.galleryImages.filter(Boolean)
      : product.imageUrl
      ? [product.imageUrl]
      : [fallbackImg];
  const destLink = `/product/${product.id}`;

  return (
    <div className="flex flex-col">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition duration-150 flex-1 flex flex-col justify-between overflow-hidden group">
        <div>
          <div className="relative">
            <MultiSlideCardMedia
              images={slides}
              alt={product.name}
              linkTo={destLink}
              fallbackImage={fallbackImg}
              aspectClass="aspect-[4/3] sm:aspect-square"
              autoScrollMs={4700}
              staggerDelayMs={(index % 5) * 650}
              activeIndex={slideIndex}
              onIndexChange={setSlideIndex}
            >
              <button
                type="button"
                onClick={e => onToggleWishlist(e, product.id)}
                title={isSavedInWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
                aria-label={isSavedInWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
                className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md z-10 transition active:scale-110 border ${
                  isSavedInWishlist
                    ? 'bg-red-50 text-red-600 border-red-200'
                    : 'bg-white/95 text-gray-500 border-gray-200 hover:text-red-500'
                }`}
              >
                {isSavedInWishlist ? '♥' : '♡'}
              </button>

              {slides.length > 1 && (
                <span className="absolute bottom-3 left-2.5 bg-slate-950/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs tabular-nums pointer-events-none z-10">
                  {slides.length} photos
                </span>
              )}
            </MultiSlideCardMedia>

            {/* Prominent Offer / Discount Badge Near Bottom of Image - Clean, No Dark Overlay */}
            <div className="absolute bottom-2.5 left-2.5 right-2.5 pointer-events-none flex items-center justify-between gap-1.5 z-10">
              <span className="inline-block bg-[#FFC200] text-slate-950 text-[10.5px] sm:text-xs font-black px-2.5 py-1 rounded-md shadow-md uppercase tracking-wide truncate max-w-[85%]">
                {product.tag || (discountPercent > 0 ? `${discountPercent}% Off` : `From ₹${totalWithExtras}`)}
              </span>
              {product.sectionLabel && (
                <span className="inline-block bg-blue-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-sm truncate max-w-[45%]">
                  {product.sectionLabel}
                </span>
              )}
            </div>
          </div>

          <Link to={destLink} className="block p-3.5 sm:p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 truncate">
              <span className="uppercase tracking-wider truncate text-blue-700 font-extrabold">{product.category}</span>
            </div>

            <h3 className="font-extrabold text-xs sm:text-sm text-gray-900 leading-snug line-clamp-2 min-h-[2.3rem] sm:min-h-[2.6rem]">
              {product.name}
            </h3>

            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-wrap">
              <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded tabular-nums">
                {product.rating || 4.8} ★
              </span>
              <span className="tabular-nums">({product.reviewsCount || 45})</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-emerald-700 truncate">
                {totals.deliveryFee > 0 ? `+₹${totals.deliveryFee} Del.` : t('freeDelivery')}
              </span>
            </div>

            <div className="flex items-baseline gap-1.5 pt-1 flex-wrap tabular-nums">
              <span className="text-base sm:text-lg font-black text-gray-900">
                ₹{totalWithExtras}
              </span>
              {totals.originalTotal > totalWithExtras && (
                <span className="text-xs text-gray-400 line-through">
                  ₹{totals.originalTotal}
                </span>
              )}
              {discountPercent > 0 && (
                <span className="text-[11px] font-bold text-emerald-700">
                  {discountPercent}% {t('specialDiscount')}
                </span>
              )}
            </div>
          </Link>
        </div>

        <Link to={destLink} className="block px-3.5 pb-3.5 sm:px-4 sm:pb-4 pt-0">
          <span className="h-9 w-full bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center whitespace-nowrap">
            {t('orderNow')}
          </span>
        </Link>
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

function StoreProductGrid({
  products,
  wishlist,
  onToggleWishlist,
  t,
}: StoreProductGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
      {products.map((product, idx) => (
        <StoreProductCard
          key={product.id}
          product={product}
          index={idx}
          isSavedInWishlist={Boolean(wishlist[product.id])}
          onToggleWishlist={onToggleWishlist}
          t={t}
        />
      ))}
    </div>
  );
}
