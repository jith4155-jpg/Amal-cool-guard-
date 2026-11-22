import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { Product } from '../data/mockProducts';
import { getCatalogProducts, safeJsonParse } from '../utils/storeSync';
import { ThemeSwitcher } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export default function AccountDashboard() {
  const navigate = useNavigate();
  const {
    user,
    authReady,
    profile,
    myOrders,
    myOrdersCount,
    signingIn,
    signInWithGoogle,
    logout,
    updateUserProfile,
  } = useAuth();

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [savedProducts, setSavedProducts] = useState<Product[]>([]);
  const [loginError, setLoginError] = useState('');

  const wishlistKey = user ? `amal_wishlist_${user.uid}` : '';

  const loadWishlistData = useCallback(() => {
    if (!wishlistKey) {
      setWishlistCount(0);
      setSavedProducts([]);
      return;
    }
    const savedIds: string[] = safeJsonParse<string[]>(localStorage.getItem(wishlistKey), []);
    setWishlistCount(savedIds.length);

    const catalog = getCatalogProducts();
    const items = catalog.filter(p => savedIds.includes(p.id));
    setSavedProducts(items);
  }, [wishlistKey]);

  useEffect(() => {
    loadWishlistData();
  }, [loadWishlistData]);

  const removeFromWishlist = (productId: string) => {
    if (!wishlistKey) return;
    const savedIds: string[] = safeJsonParse<string[]>(localStorage.getItem(wishlistKey), []);
    const updated = savedIds.filter(id => id !== productId);
    localStorage.setItem(wishlistKey, JSON.stringify(updated));
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

  const handleQuickLogin = async () => {
    setLoginError('');
    const res = await signInWithGoogle();
    if (res.error) setLoginError(res.error);
  };

  const savedSettings = safeJsonParse<Record<string, any>>(localStorage.getItem('amal_payment_settings'), {});
  const whatsappNum = savedSettings.whatsappNumber || '6238113451';

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-bold text-gray-600">Checking account session...</p>
        </div>
      </div>
    );
  }

  // STRICT ISOLATION: Profile is hidden until user signs in with their own Gmail ID
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 pb-20 pt-6 px-4">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">My Account</h1>
            <p className="text-xs text-gray-500">Login required to view your personal profile & orders</p>
          </div>
          <ThemeSwitcher compact />
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 max-w-md mx-auto text-center space-y-4">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 text-3xl rounded-full flex items-center justify-center mx-auto">
            🔒
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900">Profile Locked (ലോഗിൻ ചെയ്യുക)</h2>
            <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
              ഓരോരുത്തരുടെയും സ്വന്തം പ്രൊഫൈലും ഓർഡറുകളും സുരക്ഷിതമായി കാണാൻ നിങ്ങളുടെ <b>Gmail അക്കൗണ്ട്</b> ഉപയോഗിച്ച് ലോഗിൻ ചെയ്യുക.
            </p>
          </div>

          <button
            type="button"
            onClick={handleQuickLogin}
            disabled={signingIn}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-xs disabled:opacity-60"
          >
            <span>✉️</span>
            <span>
              {signingIn
                ? 'Signing in with Google...'
                : 'Sign In with Google / Gmail (ലോഗിൻ ചെയ്യുക)'}
            </span>
          </button>

          {loginError && (
            <p className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-xl">
              {loginError}
            </p>
          )}

          <button
            type="button"
            onClick={() => navigate('/login?redirect=/account')}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 rounded-xl text-xs transition"
          >
            Open Full Login Screen →
          </button>
        </div>

        {/* Generic Promoter / Store Portal Link */}
        <div className="max-w-md mx-auto mt-4">
          <Link
            to="/promoter"
            className="flex items-center justify-between p-4 bg-purple-50 rounded-2xl border border-purple-200 transition text-purple-950 hover:bg-purple-100"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🤝</span>
              <div>
                <p className="font-extrabold text-xs text-purple-950">Promoter / Affiliate Portal</p>
                <p className="text-[11px] text-purple-800">Earn ₹100 / Sale via your unique referral link</p>
              </div>
            </div>
            <span className="text-purple-700 font-bold">›</span>
          </Link>
        </div>
      </div>
    );
  }

  const confirmedCount = myOrders.filter(o => o.status?.toLowerCase() === 'confirmed').length;
  const pendingCount = myOrders.filter(
    o => !o.status || o.status === 'pending' || o.status === 'pending_verification'
  ).length;

  const allShortcuts = [
    {
      label: 'Orders',
      icon: '📦',
      badge: `${myOrdersCount} ${myOrdersCount === 1 ? 'Order' : 'Orders'}`,
      blocked: !!savedSettings.blockAccountOrders,
    },
    {
      label: 'Wishlist',
      icon: '❤️',
      badge: wishlistCount > 0 ? `${wishlistCount} Saved` : '0 Saved',
      blocked: !!savedSettings.blockAccountWishlist,
    },
    { label: 'Coupons', icon: '🎁', badge: '2 Active', blocked: !!savedSettings.blockAccountCoupons },
    { label: 'Help Center', icon: '🎧', badge: 'WhatsApp', blocked: !!savedSettings.blockAccountHelp },
  ];

  const activeShortcuts = allShortcuts.filter(item => !item.blocked);

  return (
    <div className="min-h-screen bg-gray-100 pb-20 pt-6">
      {/* Header */}
      <div className="px-4 mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-0.5">My Account</h1>
          <p className="text-xs text-gray-500 truncate max-w-[200px]">
            ✉️ {user.email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeSwitcher compact />
          <button
            onClick={() => logout()}
            className="bg-red-50 text-red-600 border border-red-200 text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-xs hover:bg-red-100 transition"
          >
            Logout 🚪
          </button>
        </div>
      </div>

      {/* Verified Gmail User Profile Summary Card */}
      <div className="mx-4 mb-4 bg-white p-4 rounded-2xl shadow-sm border border-blue-100 space-y-3">
        <div className="flex items-center gap-3">
          {profile?.photoURL || user.photoURL ? (
            <img
              src={profile?.photoURL || user.photoURL || ''}
              alt={profile?.name || user.displayName || 'Profile'}
              className="w-14 h-14 rounded-full border-2 border-blue-200 object-cover shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-blue-600 text-white font-black text-xl flex items-center justify-center shrink-0">
              {(user.email || 'U').charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="font-black text-base text-gray-900 truncate">
              {profile?.name || user.displayName || 'Customer'}
            </h2>
            <p className="text-xs font-bold text-blue-700 truncate">✉️ {user.email}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {profile?.mobile ? `📱 ${profile.mobile}` : '📱 Mobile not saved yet'}
            </p>
          </div>
        </div>

        {/* Exact Order Count Stats for this Gmail */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
          <div className="bg-blue-50 p-2 rounded-xl border border-blue-100">
            <p className="text-[10px] font-bold text-blue-700 uppercase">Total Orders</p>
            <p className="text-base font-black text-blue-900">{myOrdersCount}</p>
          </div>
          <div className="bg-amber-50 p-2 rounded-xl border border-amber-100">
            <p className="text-[10px] font-bold text-amber-700 uppercase">Pending</p>
            <p className="text-base font-black text-amber-900">{pendingCount}</p>
          </div>
          <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-700 uppercase">Approved</p>
            <p className="text-base font-black text-emerald-900">{confirmedCount}</p>
          </div>
        </div>
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
                  <p className="font-bold text-gray-900">
                    My Orders History ({myOrdersCount} {myOrdersCount === 1 ? 'Order' : 'Orders'})
                  </p>
                  <p className="text-[11px] text-gray-500">
                    View, track, cancel or delete orders placed with {user.email}
                  </p>
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

          {/* Promoter & Influencer Portal Entry */}
          <Link
            to="/promoter"
            className="flex items-center justify-between p-3 bg-purple-50 rounded-xl cursor-pointer border border-purple-200 transition text-purple-950 hover:bg-purple-100"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🤝</span>
              <div>
                <p className="font-extrabold text-purple-950 flex items-center gap-1.5">
                  <span>Promoter / Affiliate Portal</span>
                  <span className="bg-purple-600 text-white text-[9.5px] font-black px-2 py-0.5 rounded-full">
                    Earn ₹100 / Sale
                  </span>
                </p>
                <p className="text-[11px] text-purple-800">YouTubers & Influencers: Get unique link & track commission</p>
              </div>
            </div>
            <span className="text-purple-700 font-bold">›</span>
          </Link>
        </div>
      </div>

      {/* Saved Delivery Address Management Section (Scoped to logged-in user UID) */}
      <div className="mx-4 mt-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📍</span>
            <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">My Profile & Delivery Address</h3>
          </div>
          <button
            onClick={() => setActiveModal('Address')}
            className="text-xs text-blue-600 font-extrabold hover:underline"
          >
            {profile?.address ? 'Edit ✏️' : '+ Add Address'}
          </button>
        </div>

        {profile?.address ? (
          <div className="bg-gray-50 p-3.5 rounded-xl text-xs space-y-1 border border-gray-100">
            <p className="font-bold text-gray-900">{profile.name}</p>
            {profile.mobile && <p className="text-blue-700 font-bold">📱 {profile.mobile}</p>}
            <p className="text-gray-700 font-medium">{profile.address}</p>
            <p className="text-gray-500 font-semibold">PIN: {profile.pincode || 'N/A'}</p>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">
            No delivery address saved for {user.email} yet. Save an address for faster checkout.
          </p>
        )}
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
                    <p className="text-xs text-gray-500">Explore products on homepage and tap the ❤️ icon to save items here.</p>
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

            {activeModal === 'Address' && (
              <div className="text-left space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                    <span>📍</span> Manage Profile & Address
                  </h3>
                  <button onClick={() => setActiveModal(null)} className="text-gray-400 font-bold text-xl">✕</button>
                </div>

                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    const target = e.target as any;
                    await updateUserProfile({
                      name: target.fullName.value.trim(),
                      mobile: target.mobile.value.trim(),
                      address: target.address.value.trim(),
                      pincode: target.pincode.value.trim(),
                    });
                    setActiveModal(null);
                  }}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      name="fullName"
                      defaultValue={profile?.name || user.displayName || ''}
                      required
                      className="w-full p-2.5 border rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Mobile Number *</label>
                    <input
                      type="tel"
                      name="mobile"
                      defaultValue={profile?.mobile || ''}
                      required
                      placeholder="10-digit WhatsApp / Mobile number"
                      className="w-full p-2.5 border rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">House / Shop / Delivery Address *</label>
                    <textarea
                      name="address"
                      defaultValue={profile?.address || ''}
                      required
                      placeholder="e.g. Vengakkal House, Near Town Hall, Kozhikode, Kerala"
                      className="w-full p-2.5 border rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Pincode *</label>
                    <input
                      type="text"
                      name="pincode"
                      defaultValue={profile?.pincode || ''}
                      required
                      placeholder="6-digit Pincode"
                      className="w-full p-2.5 border rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl shadow transition"
                  >
                    Save Profile & Address (സേവ് ചെയ്യുക)
                  </button>
                </form>
              </div>
            )}

            {activeModal === 'Help Center' && (
              <>
                <span className="text-4xl">🎧</span>
                <h3 className="text-xl font-extrabold text-gray-900">Help Center</h3>
                <p className="text-xs text-gray-600">Need help with your order? Contact us on WhatsApp or Call.</p>
                <a
                  href={`https://wa.me/91${whatsappNum}`}
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
