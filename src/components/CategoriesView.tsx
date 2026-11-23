import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, mapProductFromDb } from '../firebase';
import { Link } from 'react-router-dom';
import { Product } from '../data/mockProducts';
import { useLanguage } from '../context/LanguageContext';
import {
  getCatalogProducts,
  getCategories,
  mergeRemoteCatalogProducts,
  syncDeletedProductIds,
  calculateProductTotals,
  safeJsonParse,
} from '../utils/storeSync';

export default function CategoriesView() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>(() => getCatalogProducts());
  const [customCategories, setCustomCategories] = useState<string[]>(() => getCategories());
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [catSnap, catalogSnap, prodSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'categories')),
          getDoc(doc(db, 'settings', 'catalog')),
          getDocs(collection(db, 'products')),
        ]);

        if (!isMounted) return;

        if (catalogSnap.exists()) {
          const catData = catalogSnap.data();
          if (Array.isArray(catData?.deletedIds)) {
            syncDeletedProductIds(catData.deletedIds);
          }
        }

        if (catSnap.exists()) {
          const catData = catSnap.data();
          if (Array.isArray(catData?.list)) {
            setCustomCategories(catData.list);
          }
        }

        const fetched: Product[] = prodSnap.docs.map(d => mapProductFromDb(d.data(), d.id));
        const merged = mergeRemoteCatalogProducts(fetched);
        if (isMounted) {
          setProducts(merged);
        }
      } catch (err) {
        console.warn('Categories load error:', err);
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const validCategories = customCategories.filter(
    c => Boolean(c) && products.some(p => p.category?.trim().toLowerCase() === c.trim().toLowerCase())
  );
  const allCats = validCategories.length > 0 ? ['All', ...validCategories] : ['All'];

  const filteredProducts = products.filter(p => {
    if (selectedCategory === 'All') return true;
    return p.category?.trim().toLowerCase() === selectedCategory.trim().toLowerCase();
  });

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      {/* Flipkart Style Categories Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 px-4 py-3 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-base sm:text-xl font-extrabold text-gray-900 tracking-tight">
            {t('categories') || 'Categories'}
          </h1>
          <span className="text-xs font-semibold text-gray-500 tabular-nums">
            {filteredProducts.length} {t('productsCount')}
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 space-y-4">
        {/* Category Horizontal Selector Rail */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {allCats.map(cat => {
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

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-gray-200 shadow-2xs max-w-md mx-auto p-6 space-y-3">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-2xl mx-auto font-bold">
              📂
            </div>
            <h3 className="font-extrabold text-sm text-gray-900">No products in this category</h3>
            <p className="text-xs text-gray-500">Please choose another category or check all products.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map(product => {
              const totals = calculateProductTotals(product);
              const totalWithExtras = totals.finalTotal;
              const imgBroken = brokenImages[product.id] || !product.imageUrl;

              return (
                <Link
                  to={`/product/${product.id}`}
                  key={product.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-xs hover:shadow-md transition flex flex-col justify-between overflow-hidden group"
                >
                  <div>
                    <div className="relative aspect-[4/3] sm:aspect-square bg-gray-50 border-b border-gray-100 overflow-hidden">
                      {!imgBroken ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages(prev => ({ ...prev, [product.id]: true }))}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 p-2 text-center font-semibold">
                          {product.name}
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                        {product.category}
                      </p>
                      <h3 className="font-bold text-xs sm:text-sm text-gray-900 line-clamp-2 min-h-[2.2rem]">
                        {product.name}
                      </h3>
                      <div className="flex items-baseline gap-1 pt-1 tabular-nums">
                        <span className="text-sm sm:text-base font-extrabold text-gray-900">
                          ₹{totalWithExtras}
                        </span>
                        {totals.originalTotal > totalWithExtras && (
                          <span className="text-xs text-gray-400 line-through">
                            ₹{totals.originalTotal}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 pt-0">
                    <span className="w-full h-8 bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center justify-center transition shadow-xs">
                      {t('orderNow')}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
