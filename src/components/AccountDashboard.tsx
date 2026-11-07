import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { MOCK_PRODUCTS, Product } from '../data/mockProducts';

export default function AccountDashboard() {
  const navigate = useNavigate();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [savedProducts, setSavedProducts] = useState<Product[]>([]);

  useEffect(() => {
    loadWishlistData();
  }, []);

  const loadWishlistData = () => {
    const savedIds: string[] = JSON.parse(localStorage.getItem('amal_wishlist') || '[]');
    setWishlistCount(savedIds.length);

    // Find saved products matching IDs or fallback to MOCK_PRODUCTS
    const items = MOCK_PRODUCTS.filter(p => savedIds.includes(p.id));
    setSavedProducts(items.length > 0 ? items : (savedIds.length > 0 ? [MOCK_PRODUCTS[0]] : []));
  };

  const removeFromWishlist = (productId: string) => {
    const savedIds: string[] = JSON.parse(localStorage.getItem('amal_wishlist') || '[]');
    const updated = savedIds.filter(id => id !== productId);
    localStorage.setItem('amal_wishlist', JSON.stringify(updated));
    setWishlistCount(updated.length);
    setSavedProducts(prev => prev.filter(p => p.id !== productId));
  };

  const handleItemClick = (label: string) => {
    if (label === 'Orders') {
      navigate('/orders');
    } else {
      loadWishlistData();
      setActiveModal(label);
    }
  };

  // Read admin settings for block status & whatsapp number
  const savedSettings = JSON.parse(localStorage.getItem('amal_payment_settings') || '{}');
  const whatsappNum = savedSettings.whatsappNumber || '6238113451';

  const allShortcuts = [
    { label: 'Orders', icon: '📦', badge: 'View All', blocked: !!savedSettings.blockAccountOrders },
    { label: 'Wishlist', icon: '❤️', badge: wishlistCount > 0 ? `${wishlistCount} Saved` : '0 Saved', blocked: !!savedSettings.blockAccountWishlist },
    { label: 'Coupons', icon: '🎁', badge: '2 Active', blocked: !!savedSettings.blockAccountCoupons },
    { label: 'Help Center', icon: '🎧', badge: 'WhatsApp', blocked: !!savedSettings.blockAccountHelp },
  ];

  const activeShortcuts = allShortcuts.filter(item => !item.blocked);

  return (
    <div className="min-h-screen bg-gray-100 pb-20 pt-6">
      <div className="px-4 mb-4">
        <h1 className="text-xl font-extrabold text-gray-900 mb-1">My Account</h1>
        <p className="text-xs text-gray-500">Manage orders, wishlist, coupons and customer support.</p>
      </div>

      {activeShortcuts.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 px-4 mb-6">
          {activeShortcuts.map(item => (
            <button 
              key={item.label} 
              onClick={() => handleItemClick(item.label)}
              className="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md border border-gray-100 flex flex-col justify-between items-start text-left transition active:scale-98 relative group"
            >
              <span className="text-3xl mb-2 group-hover:scale-110 transition">{item.icon}</span>
              <div>
                <span className="font-extrabold text-sm text-gray-900 block">{item.label}</span>
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-full inline-block mt-1">
                  {item.badge}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mx-4 mb-6 p-4 bg-white rounded-2xl text-center text-xs text-gray-500 border">
          No shortcuts active at this time.
        </div>
      )}

      {/* Additional Settings & Customer Support Box */}
      <div className="mx-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Account Info</h3>
        <div className="space-y-3 text-xs text-gray-700">
          {!savedSettings.blockAccountOrders && (
            <div 
              onClick={() => navigate('/orders')}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-blue-50 transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">📦</span>
                <div>
                  <p className="font-bold text-gray-900">My Orders History</p>
                  <p className="text-[11px] text-gray-500">Check pending and confirmed orders</p>
                </div>
              </div>
              <span className="text-gray-400 font-bold">›</span>
            </div>
          )}

          {!savedSettings.blockAccountWishlist && (
            <div 
              onClick={() => {
                loadWishlistData();
                setActiveModal('Wishlist');
              }}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-red-50 transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg text-red-500">❤️</span>
                <div>
                  <p className="font-bold text-gray-900">Saved Wishlist ({wishlistCount})</p>
                  <p className="text-[11px] text-gray-500">View items saved for later</p>
                </div>
              </div>
              <span className="text-gray-400 font-bold">›</span>
            </div>
          )}

          {!savedSettings.blockAccountHelp && (
            <a 
              href={`https://wa.me/91${whatsappNum}`} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center justify-between p-3 bg-green-50 rounded-xl cursor-pointer border border-green-200 transition text-green-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">💬</span>
                <div>
                  <p className="font-bold">WhatsApp Customer Support ({whatsappNum})</p>
                  <p className="text-[11px] text-green-700">Chat directly with Amal Coolguard team</p>
                </div>
              </div>
              <span className="text-green-700 font-bold">›</span>
            </a>
          )}
        </div>
      </div>

      {/* Info & Wishlist Modals */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150 text-center max-h-[85vh] overflow-y-auto">
            {activeModal === 'Wishlist' && (
              <div className="text-left space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                    <span className="text-red-500">❤️</span> My Saved Wishlist ({savedProducts.length})
                  </h3>
                  <button onClick={() => setActiveModal(null)} className="text-gray-400 font-bold text-xl">✕</button>
                </div>

                {savedProducts.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 space-y-2">
                    <span className="text-4xl block mb-2">♡</span>
                    <p className="font-bold text-sm text-gray-800">Your Wishlist is Empty</p>
                    <p className="text-xs text-gray-500">Explore vests on homepage and tap the ❤️ icon to save items here.</p>
                    <button 
                      onClick={() => {
                        setActiveModal(null);
                        navigate('/');
                      }}
                      className="bg-blue-600 text-white font-bold text-xs px-5 py-2.5 rounded-full mt-2 inline-block shadow"
                    >
                      Browse Products
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    {savedProducts.map(p => (
                      <div key={p.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                        <img src={p.imageUrl} alt={p.name} className="w-14 h-14 object-cover rounded-xl flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs font-extrabold text-blue-700">₹{p.discountPrice || p.price}</p>
                          <div className="flex gap-2 mt-2">
                            <Link 
                              to={`/product/${p.id}`} 
                              onClick={() => setActiveModal(null)}
                              className="bg-orange-500 text-white font-bold text-[10px] px-3 py-1 rounded-lg"
                            >
                              Order Now
                            </Link>
                            <button 
                              onClick={() => removeFromWishlist(p.id)}
                              className="text-red-600 font-bold text-[10px] underline"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeModal === 'Coupons' && (
              <>
                <span className="text-4xl">🎁</span>
                <h3 className="text-xl font-extrabold text-gray-900">Active Coupons</h3>
                <div className="bg-blue-50 p-4 rounded-2xl text-left border border-blue-200 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-blue-900 bg-white px-2 py-1 rounded border">COOL20</span>
                    <span className="text-green-700 font-bold">₹500 OFF</span>
                  </div>
                  <p className="text-gray-600">Valid on Amal Heat-Reflective Overcoats & Vests.</p>
                </div>
              </>
            )}

            {activeModal === 'Help Center' && (
              <>
                <span className="text-4xl">🎧</span>
                <h3 className="text-xl font-extrabold text-gray-900">Help Center</h3>
                <p className="text-xs text-gray-600">Need help with your order? Contact us on WhatsApp or Call.</p>
                <a 
                  href="https://wa.me/916238113451" 
                  target="_blank" 
                  rel="noreferrer"
                  className="block w-full bg-green-600 text-white font-extrabold py-3 rounded-xl text-xs shadow"
                >
                  💬 Open WhatsApp Helpline
                </a>
              </>
            )}

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-gray-200 text-gray-800 font-bold py-2.5 rounded-xl text-xs mt-2"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
