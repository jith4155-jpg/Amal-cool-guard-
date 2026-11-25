import { useState, useEffect, useMemo } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import {
  db,
  mapProductFromDb,
  mapCategoryFromDb,
  OperationType,
  handleFirestoreError,
} from '../firebase';
import { Product } from '../data/mockProducts';
import { useLanguage } from '../context/LanguageContext';
import { type CategoryItem, getCategoryAutoImage } from '../utils/categoryArt';
import {
  getCatalogProducts,
  getCategoryItems,
  mergeRemoteCatalogProducts,
  mergeRemoteCategoryItems,
  syncDeletedProductIds,
  syncDeletedCategoryIds,
  calculateProductTotals,
} from '../utils/storeSync';
import { CardPaginationDots, MultiSlideCardMedia } from './MultiSlideCardMedia';

const FOR_YOU_ID = '__FOR_YOU__';

export default function CategoriesView() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>(() => getCatalogProducts());
  const [categoryItems, setCategoryItems] = useState<CategoryItem[]>(() => getCategoryItems());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(FOR_YOU_ID);
  const [selectedSubTag, setSelectedSubTag] = useState<string>('All');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;

    const handleStoreSync = () => {
      if (!isMounted) return;
      setProducts(getCatalogProducts());
      setCategoryItems(getCategoryItems());
    };
    window.addEventListener('amal_store_updated', handleStoreSync);
    window.addEventListener('storage', handleStoreSync);

    const loadData = async () => {
      try {
        const [catSettingsSnap, catalogSnap, catCollSnap, prodSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'categories')),
          getDoc(doc(db, 'settings', 'catalog')),
          getDocs(collection(db, 'categories')),
          getDocs(collection(db, 'products')),
        ]);

        if (!isMounted) return;

        if (catalogSnap.exists()) {
          const catalogData = catalogSnap.data();
          if (Array.isArray(catalogData?.deletedIds)) {
            syncDeletedProductIds(catalogData.deletedIds);
          }
        }

        if (catSettingsSnap.exists()) {
          const catSettingsData = catSettingsSnap.data();
          if (Array.isArray(catSettingsData?.deletedCategoryIds)) {
            syncDeletedCategoryIds(catSettingsData.deletedCategoryIds);
          }
        }

        if (!catCollSnap.empty) {
          const fetchedCats = catCollSnap.docs.map(d => mapCategoryFromDb(d.data(), d.id));
          setCategoryItems(mergeRemoteCategoryItems(fetchedCats));
        } else {
          setCategoryItems(getCategoryItems());
        }

        const fetchedProds: Product[] = prodSnap.docs.map(d => mapProductFromDb(d.data(), d.id));
        setProducts(mergeRemoteCatalogProducts(fetchedProds));
      } catch (err) {
        console.warn('Categories load warning:', err);
      }
    };

    loadData();

    const unsubCategories = onSnapshot(
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
      err => handleFirestoreError(err, OperationType.LIST, 'categories')
    );

    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      snap => {
        if (!isMounted) return;
        const fetched = snap.docs.map(d => mapProductFromDb(d.data(), d.id));
        setProducts(mergeRemoteCatalogProducts(fetched));
      },
      err => handleFirestoreError(err, OperationType.LIST, 'products')
    );

    const unsubCatSettings = onSnapshot(
      doc(db, 'settings', 'categories'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        const data = snap.data();
        if (Array.isArray(data?.deletedCategoryIds)) {
          syncDeletedCategoryIds(data.deletedCategoryIds);
          setCategoryItems(getCategoryItems());
        }
      },
      err => handleFirestoreError(err, OperationType.GET, 'settings/categories')
    );

    return () => {
      isMounted = false;
      unsubCategories();
      unsubProducts();
      unsubCatSettings();
      window.removeEventListener('amal_store_updated', handleStoreSync);
      window.removeEventListener('storage', handleStoreSync);
    };
  }, []);

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

  const visibleProducts = useMemo(
    () =>
      products.filter(
        p =>
          p.visible !== false &&
          !hiddenCategoryNames.has((p.category || '').trim().toLowerCase())
      ),
    [products, hiddenCategoryNames]
  );

  // If currently selected category got hidden or deleted, revert cleanly to For You
  useEffect(() => {
    if (
      selectedCategoryId !== FOR_YOU_ID &&
      !visibleCategories.some(c => c.id === selectedCategoryId)
    ) {
      setSelectedCategoryId(FOR_YOU_ID);
      setSelectedSubTag('All');
    }
  }, [selectedCategoryId, visibleCategories]);

  const selectedCategory = useMemo(
    () =>
      selectedCategoryId === FOR_YOU_ID
        ? null
        : visibleCategories.find(c => c.id === selectedCategoryId) || null,
    [selectedCategoryId, visibleCategories]
  );

  const handleSelectCategory = (catId: string) => {
    setSelectedCategoryId(catId);
    setSelectedSubTag('All');
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const categoryProducts = useMemo(() => {
    if (trimmedQuery) {
      return visibleProducts.filter(
        p =>
          p.name?.toLowerCase().includes(trimmedQuery) ||
          p.category?.toLowerCase().includes(trimmedQuery) ||
          p.tag?.toLowerCase().includes(trimmedQuery) ||
          p.description?.toLowerCase().includes(trimmedQuery)
      );
    }

    if (!selectedCategory) {
      return visibleProducts;
    }

    const catLower = selectedCategory.name.trim().toLowerCase();
    return visibleProducts.filter(p => {
      const matchesCat = (p.category || '').trim().toLowerCase() === catLower;
      if (!matchesCat) return false;
      if (selectedSubTag === 'All') return true;
      const subLower = selectedSubTag.toLowerCase();
      return (
        p.name?.toLowerCase().includes(subLower) ||
        p.description?.toLowerCase().includes(subLower) ||
        p.tag?.toLowerCase().includes(subLower)
      );
    });
  }, [trimmedQuery, visibleProducts, selectedCategory, selectedSubTag]);

  const matchingCategoriesInSearch = useMemo(() => {
    if (!trimmedQuery) return [];
    return visibleCategories.filter(
      c =>
        c.name.toLowerCase().includes(trimmedQuery) ||
        (c.subTags || []).some(st => st.toLowerCase().includes(trimmedQuery))
    );
  }, [trimmedQuery, visibleCategories]);

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-white overflow-hidden">
      {/* Flipkart-Style Split Categories Top Header */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-5 h-14 flex items-center justify-between gap-2 shrink-0 z-30">
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
          <h1 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight truncate">
            {t('categories') || 'All Categories'}
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSearchOpen(prev => !prev);
              if (searchOpen) setSearchQuery('');
            }}
            aria-label="Search categories or products"
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
              searchOpen ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>

          <Link
            to="/orders"
            aria-label="My Orders"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-700 hover:bg-gray-100 transition"
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </Link>
        </div>
      </header>

      {/* Optional Expandable Search Strip */}
      {searchOpen && (
        <div className="bg-gray-50 border-b border-gray-200 px-3 sm:px-5 py-2 shrink-0">
          <div className="max-w-7xl mx-auto relative flex items-center">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search categories or products..."
              className="w-full h-9 bg-white border border-gray-300 rounded-lg pl-3 pr-8 text-xs sm:text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-xs font-bold text-gray-400 hover:text-gray-700 px-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Split Left-Sidebar + Right-Panel Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden max-w-7xl w-full mx-auto">
        {/* LEFT VERTICAL SCROLLABLE SIDEBAR — COMPACT ROUNDED SLATE/NAVY CATEGORY CARDS */}
        <aside
          aria-label="Category list"
          className="w-[92px] sm:w-28 md:w-36 bg-[#0B1324] border-r-[1px] border-slate-800 overflow-y-auto no-scrollbar shrink-0 py-2.5 px-2 space-y-2"
        >
          {/* "For You" Compact Small Card */}
          <button
            type="button"
            onClick={() => {
              handleSelectCategory(FOR_YOU_ID);
              setSearchQuery('');
            }}
            className={`w-full flex flex-col items-center gap-1.5 p-2 rounded-2xl border-[1.5px] transition cursor-pointer ${
              selectedCategoryId === FOR_YOU_ID && !trimmedQuery
                ? 'bg-[#1E293B] border-sky-400 text-white shadow-md ring-1 ring-sky-400/40 font-extrabold'
                : 'bg-[#151F32] border-slate-700/80 text-slate-200 hover:border-sky-400/60 hover:bg-[#19253B] font-semibold'
            }`}
          >
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center border-[1px] shrink-0 transition ${
                selectedCategoryId === FOR_YOU_ID && !trimmedQuery
                  ? 'bg-sky-500 border-sky-300/70 text-white'
                  : 'bg-[#0F172A] border-slate-700/70 text-sky-300'
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <span className="text-[10.5px] sm:text-[11px] text-center leading-tight line-clamp-2">
              For You
            </span>
          </button>

          {/* Dynamic Visible Compact Small Category Cards */}
          {visibleCategories.map(cat => {
            const active = selectedCategoryId === cat.id && !trimmedQuery;
            const imgSrc = brokenImages[cat.id]
              ? getCategoryAutoImage(cat.name)
              : cat.imageUrl || getCategoryAutoImage(cat.name);

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  handleSelectCategory(cat.id);
                  setSearchQuery('');
                }}
                className={`w-full flex flex-col items-center gap-1.5 p-2 rounded-2xl border-[1.5px] transition cursor-pointer ${
                  active
                    ? 'bg-[#1E293B] border-sky-400 text-white shadow-md ring-1 ring-sky-400/40 font-extrabold'
                    : 'bg-[#151F32] border-slate-700/80 text-slate-200 hover:border-sky-400/60 hover:bg-[#19253B] font-semibold'
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
                <span className="text-[10.5px] sm:text-[11px] text-center leading-tight line-clamp-2">
                  {cat.name}
                </span>
              </button>
            );
          })}
        </aside>

        {/* RIGHT VERTICAL SCROLLABLE PANEL */}
        <main className="flex-1 bg-white overflow-y-auto p-3 sm:p-5 space-y-6">
          {/* Case 1: Active Search Results */}
          {trimmedQuery ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h2 className="text-sm sm:text-base font-extrabold text-gray-900">
                  Search: &ldquo;{searchQuery.trim()}&rdquo;
                </h2>
                <span className="text-xs text-gray-500 font-semibold tabular-nums">
                  {categoryProducts.length} {t('productsCount')}
                </span>
              </div>

              {matchingCategoriesInSearch.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                    Matching Categories
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                    {matchingCategoriesInSearch.map(cat => {
                      const imgSrc = brokenImages[cat.id]
                        ? getCategoryAutoImage(cat.name)
                        : cat.imageUrl || getCategoryAutoImage(cat.name);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            handleSelectCategory(cat.id);
                            setSearchQuery('');
                          }}
                          className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#151F32] border-[1.5px] border-slate-700/80 hover:border-sky-400/70 hover:bg-[#1E293B] text-slate-100 shadow-xs transition text-center cursor-pointer"
                        >
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-[#0F172A] border-[1px] border-slate-700/70 shrink-0">
                            <img
                              src={imgSrc}
                              alt={cat.name}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenImages(prev => ({ ...prev, [cat.id]: true }))
                              }
                              className="w-full h-full object-cover object-center"
                            />
                          </div>
                          <span className="text-[10.5px] sm:text-[11px] font-bold text-slate-100 leading-tight line-clamp-2">
                            {cat.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <ProductResultGrid
                products={categoryProducts}
                brokenImages={brokenImages}
                onImageError={id => setBrokenImages(prev => ({ ...prev, [id]: true }))}
                emptyTitle="No matching items found"
                emptyBody="Try a different keyword or select a category on the left."
              />
            </div>
          ) : selectedCategory ? (
            /* Case 2: Specific Category Selected — ONLY show this category's own image, subTags & matching products */
            <div className="space-y-5">
              {/* Single Selected Category Showcase Header */}
              <div className="bg-[#151F32] border-[1.5px] border-slate-700/80 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 sm:gap-4 shadow-sm">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[#0F172A] border-[1px] border-slate-700/70 overflow-hidden shrink-0">
                  <img
                    src={
                      brokenImages[selectedCategory.id]
                        ? getCategoryAutoImage(selectedCategory.name)
                        : selectedCategory.imageUrl || getCategoryAutoImage(selectedCategory.name)
                    }
                    alt={selectedCategory.name}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setBrokenImages(prev => ({ ...prev, [selectedCategory.id]: true }))
                    }
                    className="w-full h-full object-cover object-center"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-xl font-extrabold text-white truncate">
                    {selectedCategory.name}
                  </h2>
                  <p className="text-xs text-sky-300 font-semibold tabular-nums mt-0.5">
                    {categoryProducts.length}{' '}
                    {categoryProducts.length === 1 ? 'Product' : 'Products'} available
                  </p>
                </div>
              </div>

              {/* Interactive Sub-Tag Filter Buttons for this Category Only */}
              {selectedCategory.subTags && selectedCategory.subTags.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {['All', ...selectedCategory.subTags].map(sub => {
                    const active = selectedSubTag === sub;
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setSelectedSubTag(sub)}
                        className={`h-8 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border-[1px] transition cursor-pointer ${
                          active
                            ? 'bg-sky-600 text-white border-sky-400 shadow-xs'
                            : 'bg-[#151F32] text-slate-200 border-slate-700/80 hover:border-sky-400/60 hover:bg-[#1E293B]'
                        }`}
                      >
                        {sub}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Matching Products for Selected Category */}
              <ProductResultGrid
                products={categoryProducts}
                brokenImages={brokenImages}
                onImageError={id => setBrokenImages(prev => ({ ...prev, [id]: true }))}
                emptyTitle={`No products in ${selectedCategory.name} yet`}
                emptyBody="Add products to this category from the Admin Panel or browse other categories."
                onBrowseAll={() => handleSelectCategory(FOR_YOU_ID)}
              />
            </div>
          ) : (
            /* Case 3: "For You" Selected — Popular Categories Grid + Trending Products */
            <div className="space-y-6">
              {visibleCategories.length > 0 && (
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight">
                      Popular Categories
                    </h2>
                    <span className="text-xs text-gray-500 font-semibold tabular-nums">
                      {visibleCategories.length} Categories
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
                    {visibleCategories.map(cat => {
                      const imgSrc = brokenImages[cat.id]
                        ? getCategoryAutoImage(cat.name)
                        : cat.imageUrl || getCategoryAutoImage(cat.name);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleSelectCategory(cat.id)}
                          className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-[#151F32] border-[1.5px] border-slate-700/80 hover:border-sky-400/70 hover:bg-[#1E293B] text-slate-100 shadow-xs transition group cursor-pointer"
                        >
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#0F172A] border-[1px] border-slate-700/70 overflow-hidden shrink-0">
                            <img
                              src={imgSrc}
                              alt={cat.name}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenImages(prev => ({ ...prev, [cat.id]: true }))
                              }
                              className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-200"
                            />
                          </div>
                          <span className="text-[10.5px] sm:text-[11px] font-bold text-slate-100 text-center leading-tight line-clamp-2">
                            {cat.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight">
                    Featured &amp; Trending
                  </h2>
                  <span className="text-xs text-gray-500 font-semibold tabular-nums">
                    {visibleProducts.length} {t('productsCount')}
                  </span>
                </div>

                <ProductResultGrid
                  products={visibleProducts}
                  brokenImages={brokenImages}
                  onImageError={id => setBrokenImages(prev => ({ ...prev, [id]: true }))}
                  emptyTitle="No products available yet"
                  emptyBody="Products added in the Admin Panel will appear here automatically."
                />
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

interface ProductResultGridProps {
  products: Product[];
  brokenImages: Record<string, boolean>;
  onImageError: (id: string) => void;
  emptyTitle: string;
  emptyBody: string;
  onBrowseAll?: () => void;
}

function CategoryResultCard({ product, index }: { product: Product; index: number }) {
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
      <div className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition flex-1 flex flex-col justify-between overflow-hidden group">
        <div>
          <MultiSlideCardMedia
            images={slides}
            alt={product.name}
            linkTo={destLink}
            fallbackImage={fallbackImg}
            aspectClass="aspect-square"
            autoScrollMs={4600}
            staggerDelayMs={(index % 5) * 650}
            activeIndex={slideIndex}
            onIndexChange={setSlideIndex}
          >
            {product.tag && (
              <div className="absolute bottom-0 inset-x-0 bg-emerald-600 text-white text-[10px] font-extrabold text-center py-0.5 px-1.5 truncate pointer-events-none z-10">
                {product.tag}
              </div>
            )}
          </MultiSlideCardMedia>

          <Link to={destLink} className="block p-2.5 space-y-1">
            <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-gray-500">
              <span className="uppercase tracking-wider truncate">
                {product.sectionLabel ? `${product.category} · ${product.sectionLabel}` : product.category}
              </span>
              {slides.length > 1 && (
                <span className="shrink-0 tabular-nums">{slides.length} photos</span>
              )}
            </div>

            <h3 className="font-bold text-xs text-gray-900 line-clamp-2 min-h-[2rem]">
              {product.name}
            </h3>

            <div className="flex items-baseline gap-1.5 pt-0.5 flex-wrap tabular-nums">
              <span className="text-sm font-extrabold text-gray-900">₹{totalWithExtras}</span>
              {totals.originalTotal > totalWithExtras && (
                <span className="text-[11px] text-gray-400 line-through">
                  ₹{totals.originalTotal}
                </span>
              )}
              {discountPercent > 0 && (
                <span className="text-[10px] font-bold text-emerald-700">
                  {discountPercent}% off
                </span>
              )}
            </div>
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

function ProductResultGrid({
  products,
  emptyTitle,
  emptyBody,
  onBrowseAll,
}: ProductResultGridProps) {
  if (products.length === 0) {
    return (
      <div className="py-12 px-4 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 space-y-3">
        <h3 className="font-extrabold text-sm text-gray-900">{emptyTitle}</h3>
        <p className="text-xs text-gray-500 max-w-xs mx-auto">{emptyBody}</p>
        {onBrowseAll && (
          <button
            type="button"
            onClick={onBrowseAll}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition whitespace-nowrap"
          >
            View All Products
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
      {products.map((product, idx) => (
        <CategoryResultCard key={product.id} product={product} index={idx} />
      ))}
    </div>
  );
}
