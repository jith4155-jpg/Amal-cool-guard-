import { useState, useEffect } from 'react';
import { supabase, mapProductFromDb } from './supabase';
import { Link } from 'react-router-dom';
import { Product } from './data/mockProducts';
import { useLanguage, LanguageSelector } from './context/LanguageContext';
import { ThemeSwitcher } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';
import {
  getCatalogProducts,
  mergeRemoteCatalogProducts,
  syncReferralFromUrl,
  getCategories,
  saveCategories,
  calculateProductTotals,
  syncDeletedProductIds,
  safeJsonParse,
} from './utils/storeSync';

export default function AppStorefront() {
  const { t } = useLanguage();
  const { user, profile } = useAuth();

  const [products, setProducts] = useState<Product[]>(() => getCatalogProducts());
  const [customCategories, setCustomCategories] = useState<string[]>(() => getCategories());
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const wishlistKey = user ? `amal_wishlist_${user.uid}` : 'amal_wishlist_guest';
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const savedWishlistIds: string[] = safeJsonParse<string[]>(localStorage.getItem(wishlistKey), []);
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
        setCustomCategories(getCategories());
        setBrokenImages({});
      }
    };
    window.addEventListener('amal_store_updated', handleStoreSync);
    window.addEventListener('storage', handleStoreSync);

    const loadRemoteCatalogAndSettings = async () => {
      try {
        const [{ data: catRow }, { data: catalogRow }, { data: prodRows }] = await Promise.all([
          supabase.from('store_settings').select('data').eq('id', 'categories').maybeSingle(),
          supabase.from('store_settings').select('data').eq('id', 'catalog').maybeSingle(),
          supabase.from('products').select('*').order('created_at', { ascending: false }),
        ]);

        if (!isMounted) return;

        if (catalogRow?.data && Array.isArray(catalogRow.data.deletedIds)) {
          syncDeletedProductIds(catalogRow.data.deletedIds);
        }

        if (catRow?.data && Array.isArray(catRow.data.list)) {
          const synced = saveCategories(catRow.data.list);
          setCustomCategories(synced);
        }

        if (Array.isArray(prodRows)) {
          const fetched = prodRows.map(mapProductFromDb);
          const merged = mergeRemoteCatalogProducts(fetched);
          if (isMounted) {
            setProducts(merged);
            setBrokenImages({});
          }
        }
      } catch {
        // Local catalog remains active if network unavailable
      }
    };

    loadRemoteCatalogAndSettings();

    const productsChannel = supabase
      .channel('storefront-products-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          loadRemoteCatalogAndSettings();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_settings' },
        () => {
          loadRemoteCatalogAndSettings();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(productsChannel);
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

  // Categories shown: only categories that actually exist among active products (no empty ghost categories)
  const isCategoriesInitialized = typeof window !== 'undefined' && localStorage.getItem('amal_categories_initialized') === 'true';

  const validCategoryNames = (
    isCategoriesInitialized
      ? customCategories
      : Array.from(new Set(products.map(p => (p.category || '').trim()).filter(Boolean)))
  ).filter(c => Boolean(c) && products.some(p => p.category?.trim().toLowerCase() === c.trim().toLowerCase()));

  const categories = validCategoryNames.length > 0 ? ['All', ...Array.from(new Set(validCategoryNames))] : [];

  const matchingSearchedCategories = searchQuery.trim()
    ? validCategoryNames.filter(c => c.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  const filteredProducts = products.filter(p => {
    const matchesCategory =
      selectedCategory === 'All' || p.category?.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const savedSettings = safeJsonParse<Record<string, any>>(localStorage.getItem('amal_payment_settings'), {});
  const whatsappNum = savedSettings.whatsappNumber || '6238113451';
  const firstName = (profile?.name || user?.displayName || user?.email || 'Account').split(' ')[0];

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Flipkart-Style Clean Sticky Header (Zero Overlap on All Mobile & Desktop Widths) */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* Top Bar Row */}
          <div className="h-14 flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand Zone (single-line, never wraps behind controls) */}
            <Link to="/" className="flex items-center gap-2 min-w-0 shrink">
              <img
                src="/assets/aistudio/file_000000004d888211a2ae8deecb004de1_adbff682.png"
                alt="Amal Coolguard"
                className="w-8 h-8 rounded-full border border-gray-200 object-cover shrink-0"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight whitespace-nowrap truncate">
                {t('brandName')}
              </span>
            </Link>

            {/* Controls Zone (uniform h-9 controls, zero collision) */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <ThemeSwitcher compact />
              <LanguageSelector />

              {user ? (
                <Link
                  to="/account"
                  title={profile?.email || user.email || 'My Profile'}
                  className="h-9 inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-extrabold px-2 sm:px-3 rounded-lg hover:bg-blue-100 transition whitespace-nowrap shrink-0"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={firstName}
                      className="w-5 h-5 rounded-full object-cover border border-blue-300 shrink-0"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                      {firstName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[70px] sm:max-w-[115px] truncate">{firstName}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="h-9 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 sm:px-4 rounded-lg shadow-xs transition whitespace-nowrap shrink-0"
                >
                  {t('login')}
                </Link>
              )}

              <a
                href={`https://wa.me/91${whatsappNum}?text=Hello%20Amal%20Coolguard,%20I%20have%20an%20enquiry%20about%20your%20cooling%20vests.`}
                target="_blank"
                rel="noreferrer"
                title="WhatsApp Support"
                aria-label="WhatsApp Support"
                className="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center shadow-xs transition shrink-0"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.1c-.2.6-1.3 1.1-1.9 1.2-.5.1-1.1.1-1.8-.1a14 14 0 0 1-5.8-3.6 10.6 10.6 0 0 1-2.2-3.4c-.3-.8 0-1.6.5-2.1.3-.3.7-.5 1-.5h.7c.2 0 .5 0 .7.5l.9 2.1c.1.2.1.5 0 .7l-.4.6c-.2.2-.3.4-.1.7.4.7 1 1.4 1.7 2 .8.7 1.6 1.2 2.4 1.5.3.1.5 0 .7-.2l.7-.8c.2-.2.5-.3.8-.2l2 .9c.4.2.5.4.5.7 0 .3-.1.8-.4 1.3Z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Integrated Search Bar (Flipkart style) */}
          <div className="pb-2.5">
            <div className="relative flex items-center">
              <svg
                className="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none"
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
                className="w-full h-10 bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-9 text-xs sm:text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
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

      {/* Main Responsive Store Container */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 space-y-4">
        {/* Category Filter Rail (hidden if all categories cleared or single category) */}
        {categories.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {categories.map(cat => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`h-9 px-4 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 border ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {cat === 'All' ? t('allProducts') : cat}
                </button>
              );
            })}
          </div>
        )}

        {/* Matching Categories Quick-Jump when searching */}
        {matchingSearchedCategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Categories:</span>
            {matchingSearchedCategories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  setSearchQuery('');
                }}
                className="h-8 px-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold whitespace-nowrap hover:bg-blue-100 transition"
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Store Banner (shown when catalog has active products) */}
        {products.length > 0 && (
          <section className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-white px-5 py-4 sm:px-8 sm:py-6 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight leading-tight">
                {t('heroTitle')}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100 font-medium mt-1">
                {t('heroDesc')}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs font-semibold text-blue-50 shrink-0">
              <span>{t('heatBlock')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('waterproof')}</span>
            </div>
          </section>
        )}

        {/* Product Catalog Section */}
        <main className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-extrabold text-sm sm:text-lg text-gray-900 tracking-tight">
              {selectedCategory === 'All' ? t('featuredTitle') : selectedCategory}
            </h2>
            <span className="text-xs text-gray-500 font-semibold tabular-nums whitespace-nowrap shrink-0">
              {filteredProducts.length} {t('productsCount')}
            </span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="py-14 px-4 bg-white rounded-2xl border border-dashed border-gray-300 text-center space-y-4 max-w-md mx-auto my-4 shadow-2xs">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 text-3xl rounded-full flex items-center justify-center mx-auto shadow-inner">
                🛍️
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-base text-gray-900">
                  {searchQuery
                    ? `No products found matching "${searchQuery}".`
                    : 'ഉൽപ്പന്നങ്ങൾ ലഭ്യമല്ല (No Products in Store)'}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {searchQuery
                    ? 'മറ്റൊരു വാക്ക് നൽകി തിരയുക അല്ലെങ്കിൽ എല്ലാ കാറ്റഗറിയും പരിശോധിക്കുക.'
                    : 'ഡെമോ പരസ്യങ്ങളും ഫോട്ടോകളും പൂർണ്ണമായി നീക്കം ചെയ്തിട്ടുണ്ട്. അഡ്മിൻ പാനലിൽ നിന്ന് നിങ്ങൾക്ക് പുതിയ യഥാർത്ഥ പ്രോഡക്റ്റുകൾ ചേർക്കാവുന്നതാണ്.'}
                </p>
              </div>
              {!searchQuery && (
                <div className="pt-2">
                  <p className="text-[11px] text-gray-400 font-medium">
                    ഉടൻ തന്നെ പുതിയ ഉൽപ്പന്നങ്ങൾ ഇവിടെ ലഭ്യമാകുന്നതാണ്.
                  </p>
                </div>
              )}
              {selectedCategory !== 'All' && searchQuery && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className="h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 rounded-lg transition"
                >
                  {t('allProducts')}
                </button>
              )}
            </div>
          ) : (
            <div
              className={`grid gap-3 sm:gap-4 lg:gap-5 ${
                filteredProducts.length === 1
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
              }`}
            >
              {filteredProducts.map(product => {
                const totals = calculateProductTotals(product);
                const totalWithExtras = totals.finalTotal;
                const discountPercent =
                  totals.originalBase > totals.basePrice
                    ? Math.round(((totals.originalBase - totals.basePrice) / totals.originalBase) * 100)
                    : 0;
                const isSavedInWishlist = wishlist[product.id];
                const imgBroken = brokenImages[product.id] || !product.imageUrl;

                return (
                  <Link
                    to={`/product/${product.id}`}
                    key={product.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition duration-150 flex flex-col justify-between overflow-hidden group"
                  >
                    <div>
                      {/* Clean Product Photo Stage */}
                      <div className="relative aspect-[4/3] sm:aspect-square w-full bg-gray-50 overflow-hidden border-b border-gray-100">
                        {!imgBroken ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={() => setBrokenImages(prev => ({ ...prev, [product.id]: true }))}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-gray-400">
                            <svg className="w-8 h-8 mb-1.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="m21 15-5-5L5 21" />
                            </svg>
                            <span className="text-[11px] font-semibold line-clamp-1">{product.name}</span>
                          </div>
                        )}

                        {/* Wishlist Heart Toggle */}
                        <button
                          type="button"
                          onClick={e => toggleWishlist(e, product.id)}
                          title={isSavedInWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
                          aria-label={isSavedInWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
                          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm z-10 transition active:scale-110 border ${
                            isSavedInWishlist
                              ? 'bg-red-50 text-red-600 border-red-200'
                              : 'bg-white/90 text-gray-500 border-gray-200 hover:text-red-500'
                          }`}
                        >
                          {isSavedInWishlist ? '♥' : '♡'}
                        </button>
                      </div>

                      {/* Card Body: Clean Typographic Hierarchy (Flipkart style, zero badge clutter) */}
                      <div className="p-3 sm:p-4 space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate">
                          {product.category}
                        </p>

                        <h3 className="font-bold text-xs sm:text-sm text-gray-900 leading-snug line-clamp-2 min-h-[2.3rem] sm:min-h-[2.6rem]">
                          {product.name}
                        </h3>

                        {/* Rating & Delivery inline metadata */}
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-wrap">
                          <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums">
                            {product.rating || 4.8} ★
                          </span>
                          <span className="tabular-nums">({product.reviewsCount || 45})</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-emerald-700 truncate">
                            {totals.deliveryFee > 0 ? `+₹${totals.deliveryFee} Del.` : t('freeDelivery')}
                          </span>
                        </div>

                        {/* Price Row */}
                        <div className="flex items-baseline gap-1.5 pt-1 flex-wrap tabular-nums">
                          <span className="text-base sm:text-lg font-extrabold text-gray-900">
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

                        {/* Optional GST & Delivery Days crisp single line */}
                        {(totals.gstPercent > 0 || product.estimatedDeliveryDays) && (
                          <p className="text-[10.5px] text-gray-500 truncate tabular-nums">
                            {totals.gstPercent > 0 ? `Incl. ${totals.gstPercent}% GST` : ''}
                            {totals.gstPercent > 0 && product.estimatedDeliveryDays ? ' · ' : ''}
                            {product.estimatedDeliveryDays ? `Est. ${product.estimatedDeliveryDays}` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Crisp Single CTA Button */}
                    <div className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
                      <span className="h-9 w-full bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center justify-center whitespace-nowrap">
                        {t('orderNow')}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
