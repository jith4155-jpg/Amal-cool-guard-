import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { MOCK_PRODUCTS, Product } from './data/mockProducts';

export default function AppStorefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;

    // Load wishlist from localStorage
    const savedWishlistIds: string[] = JSON.parse(localStorage.getItem('amal_wishlist') || '[]');
    const wishMap: Record<string, boolean> = {};
    savedWishlistIds.forEach(id => { wishMap[id] = true; });
    setWishlist(wishMap);

    const fetchProducts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'products'));
        if (!querySnapshot.empty && isMounted) {
          const fetched = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || 'Amal Coolguard Vest',
              price: data.price || 2499,
              discountPrice: data.discountPrice || data.price || 1999,
              description: data.description || 'Cooling coat for heat protection.',
              imageUrl: data.imageUrl || 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500',
              category: data.category || 'Coats',
              rating: data.rating || 4.7,
              reviewsCount: data.reviewsCount || 85,
            };
          });
          setProducts(fetched);
          return;
        }
      } catch (error) {
        console.warn('Firestore fetch fallback:', error);
      }

      if (isMounted) {
        const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
        setProducts([...customLocal, ...MOCK_PRODUCTS]);
      }
    };

    fetchProducts();
    return () => { isMounted = false; };
  }, []);

  const toggleWishlist = (e: React.MouseEvent, productId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const isSaved = wishlist[productId];
    const newWishlist = { ...wishlist, [productId]: !isSaved };
    setWishlist(newWishlist);

    // Sync to localStorage
    const activeIds = Object.keys(newWishlist).filter(id => newWishlist[id]);
    localStorage.setItem('amal_wishlist', JSON.stringify(activeIds));
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Header with centered Logo & Title */}
      <nav className="bg-white px-4 py-3 shadow-sm sticky top-0 z-50 flex items-center justify-center">
        <div className="flex items-center gap-2.5">
          <img 
            src="/assets/aistudio/file_000000004d888211a2ae8deecb004de1_adbff682.png" 
            alt="Amal Coolguard Logo" 
            className="w-10 h-10 rounded-full border shadow-sm object-cover" 
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-1">
            <span>🛡️</span>
            <span>Amal Coolguard</span>
            <span className="text-xs text-blue-600 font-extrabold ml-1 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">അമൽ കൂൾഗാർഡ്</span>
          </span>
        </div>
      </nav>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 text-white p-5 mx-4 mt-4 rounded-2xl shadow-md">
        <span className="bg-white/20 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">
          Official Sun Protection Gear
        </span>
        <h2 className="text-xl font-extrabold leading-tight mb-1">AMAL COOLGUARD VESTS</h2>
        <p className="text-xs text-blue-100 mb-3">Beats Kerala Sun Heat • Heat Reflective Coat for Bike Riders & Outdoor Workers</p>
        <div className="flex gap-2">
          <span className="text-[11px] bg-white text-blue-800 font-bold px-3 py-1 rounded-lg">✓ 90% Heat Block</span>
          <span className="text-[11px] bg-white text-blue-800 font-bold px-3 py-1 rounded-lg">✓ Waterproof</span>
        </div>
      </div>

      {/* Products Section */}
      <main className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-base text-gray-900">Featured Cooling Vests & Coats</h3>
          <span className="text-xs text-gray-500 font-medium">{products.length} Products</span>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {products.map(product => {
            const discountPercent = product.price && product.discountPrice 
              ? Math.round(((product.price - product.discountPrice) / product.price) * 100) 
              : 0;

            const isSavedInWishlist = wishlist[product.id];

            return (
              <Link 
                to={`/product/${product.id}`} 
                key={product.id} 
                className="bg-white p-3 rounded-2xl shadow-sm hover:shadow-md transition border border-gray-100 relative flex flex-col justify-between group"
              >
                {/* Prominent Heart / Wishlist Button */}
                <button 
                  onClick={e => toggleWishlist(e, product.id)}
                  title={isSavedInWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
                  className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-full flex items-center justify-center text-lg shadow-md z-10 transition transform active:scale-125 ${
                    isSavedInWishlist 
                      ? 'bg-red-50 text-red-600 border border-red-200 scale-105' 
                      : 'bg-white/90 text-gray-400 hover:text-red-500'
                  }`}
                >
                  {isSavedInWishlist ? '❤️' : '♡'}
                </button>

                <div>
                  <div className="w-full h-36 bg-gray-50 rounded-xl overflow-hidden mb-2.5">
                    <img 
                      src={product.imageUrl} 
                      alt={product.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                    />
                  </div>

                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full uppercase">
                    {product.category}
                  </span>

                  <h4 className="font-bold text-xs text-gray-900 mt-1.5 leading-snug line-clamp-2">
                    {product.name}
                  </h4>

                  <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-600">
                    <span className="bg-green-600 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded">
                      {product.rating || 4.8} ★
                    </span>
                    <span className="text-[10px] text-gray-400">({product.reviewsCount || 45})</span>
                  </div>

                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-sm font-extrabold text-gray-900">₹{product.discountPrice || product.price}</span>
                    {product.price && product.price > (product.discountPrice || 0) && (
                      <span className="text-[11px] text-gray-400 line-through">₹{product.price}</span>
                    )}
                  </div>

                  {discountPercent > 0 && (
                    <span className="text-[10px] font-bold text-green-700 block mt-0.5">
                      {discountPercent}% SPECIAL DISCOUNT
                    </span>
                  )}
                </div>

                <button 
                  className="w-full mt-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white text-xs font-bold py-2 px-3 rounded-xl shadow hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-1"
                >
                  <span>Order Now</span>
                </button>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
