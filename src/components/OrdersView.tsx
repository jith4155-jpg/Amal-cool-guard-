import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeSwitcher } from '../context/ThemeContext';
import { useLanguage, LanguageSelector } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { safeJsonParse } from '../utils/storeSync';

export default function OrdersView() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const {
    user,
    authReady,
    myOrders,
    loadingOrders,
    signingIn,
    signInWithGoogle,
    refreshMyOrders,
    cancelMyOrder,
    deleteMyOrder,
  } = useAuth();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmCancelModal, setConfirmCancelModal] = useState<any | null>(null);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<any | null>(null);
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (authReady && user) {
      refreshMyOrders();
    }
  }, [authReady, user, refreshMyOrders]);

  const handleConfirmCancel = async (order: any) => {
    const targetOrderId = String(order.orderId || order.id);
    setCancellingId(targetOrderId);
    await cancelMyOrder(order);
    setCancellingId(null);
    setConfirmCancelModal(null);
  };

  const handleConfirmDelete = async (order: any) => {
    const targetOrderId = String(order.orderId || order.id);
    setDeletingId(targetOrderId);
    await deleteMyOrder(order);
    setDeletingId(null);
    setConfirmDeleteModal(null);
  };

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

  // STRICT ISOLATION: Orders cannot be viewed without logging into your Gmail account
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 pb-24">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
            <h1 className="text-lg font-extrabold text-gray-900">{t('myOrders')}</h1>
            <div className="flex items-center gap-1.5 shrink-0">
              <ThemeSwitcher compact />
              <LanguageSelector />
            </div>
          </div>
        </div>

        <div className="p-4 max-w-xl mx-auto mt-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 text-center space-y-4">
            <div className="w-14 h-14 bg-blue-100 text-blue-600 text-2xl rounded-full flex items-center justify-center mx-auto">
              🔐
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-gray-900">{t('profileLocked')}</h2>
              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                {t('ordersLockedDesc')}
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                setLoginError('');
                const res = await signInWithGoogle();
                if (res.error) setLoginError(res.error);
              }}
              disabled={signingIn}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 rounded-xl shadow-sm transition text-xs sm:text-sm disabled:opacity-60"
            >
              {signingIn ? 'Signing in...' : 'Sign In with Google / Gmail'}
            </button>

            {loginError && (
              <p className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-xl">
                {loginError}
              </p>
            )}

            <button
              type="button"
              onClick={() => navigate('/login?redirect=/orders')}
              className="w-full h-10 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition"
            >
              Open Login Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
      case 'approved':
        return <span className="bg-green-100 text-green-800 text-[11px] font-extrabold px-2.5 py-1 rounded-md">APPROVED</span>;
      case 'cancelled':
      case 'canceled':
        return <span className="bg-red-100 text-red-800 text-[11px] font-extrabold px-2.5 py-1 rounded-md">CANCELLED</span>;
      case 'rejected':
        return <span className="bg-red-100 text-red-800 text-[11px] font-extrabold px-2.5 py-1 rounded-md">REJECTED</span>;
      case 'pending':
      case 'pending_verification':
      default:
        return <span className="bg-amber-100 text-amber-800 text-[11px] font-extrabold px-2.5 py-1 rounded-md">PENDING VERIFICATION</span>;
    }
  };

  const approvedCount = myOrders.filter(
    o => o.status?.toLowerCase() === 'confirmed' || o.status?.toLowerCase() === 'approved'
  ).length;
  const pendingCount = myOrders.filter(
    o => !o.status || o.status === 'pending' || o.status === 'pending_verification'
  ).length;

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-gray-900 leading-tight">{t('myOrders')}</h1>
            <p className="text-[11px] font-semibold text-blue-700 truncate">{user.email}</p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refreshMyOrders()}
              className="h-9 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-extrabold transition"
              title="Refresh Order Status"
            >
              🔄 Refresh
            </button>
            <ThemeSwitcher compact />
            <LanguageSelector />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Exact Gmail Order Count Summary Banner */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-gray-200 grid grid-cols-3 gap-2 text-center">
          <div className="bg-blue-50 p-2 rounded-xl">
            <p className="text-[10px] font-bold text-blue-700 uppercase">Total Orders</p>
            <p className="text-base font-black text-blue-900">{myOrders.length}</p>
          </div>
          <div className="bg-amber-50 p-2 rounded-xl">
            <p className="text-[10px] font-bold text-amber-700 uppercase">Pending</p>
            <p className="text-base font-black text-amber-900">{pendingCount}</p>
          </div>
          <div className="bg-emerald-50 p-2 rounded-xl">
            <p className="text-[10px] font-bold text-emerald-700 uppercase">Approved</p>
            <p className="text-base font-black text-emerald-900">{approvedCount}</p>
          </div>
        </div>

        {loadingOrders && myOrders.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl text-center shadow-sm">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs font-bold text-gray-500">Loading orders for {user.email}...</p>
          </div>
        ) : myOrders.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl text-center shadow-sm my-4">
            <p className="text-4xl mb-3">📦</p>
            <h3 className="font-bold text-lg text-gray-800 mb-1">No Orders Placed Yet</h3>
            <p className="text-xs text-gray-500 mb-4">
              You have 0 orders on {user.email}. Explore products to place your first booking.
            </p>
            <Link to="/" className="inline-block bg-blue-600 text-white font-bold text-xs px-6 py-3 rounded-full shadow">
              Explore Products
            </Link>
          </div>
        ) : (
          myOrders.map((order, idx) => {
            const isCancelled = order.status?.toLowerCase() === 'cancelled';
            const targetId = String(order.orderId || order.id || `AC-${idx}`);

            return (
              <div
                key={targetId}
                className={`bg-white p-4 rounded-2xl shadow-sm border transition relative ${
                  isCancelled ? 'border-red-200 bg-gray-50/50 opacity-95' : 'border-gray-100'
                }`}
              >
                {/* Header info */}
                <div className="flex items-center justify-between border-b pb-2 mb-3">
                  <div>
                    <p className="text-xs font-bold text-gray-500">ORDER #{targetId}</p>
                    <p className="text-[11px] text-gray-400">
                      {order.createdAt?.seconds
                        ? new Date(order.createdAt.seconds * 1000).toLocaleDateString()
                        : order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString()
                        : 'Recently'}
                    </p>
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                {/* Product details */}
                <div className="flex items-center gap-3 relative">
                  <div className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 relative">
                    <img
                      src={order.imageUrl || 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=200'}
                      alt="product"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <h4 className="font-bold text-sm text-gray-900 truncate">{order.productName || 'Amal Coolguard Vest'}</h4>
                    <p className="text-xs text-gray-500 truncate">Customer: {order.customerName}</p>
                    <p className="text-sm font-extrabold text-blue-700 mt-0.5">
                      ₹{order.price || 2499}
                      {Number(order.gstPercent || 0) > 0 && (
                        <span className="text-[10px] font-bold text-amber-700 ml-1">
                          (+{order.gstPercent}% GST)
                        </span>
                      )}
                      {Number(order.deliveryCharge || 0) > 0 && (
                        <span className="text-[10px] font-bold text-gray-500 ml-1">
                          (Incl. ₹{order.deliveryCharge} Delivery)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Estimated Delivery Time Banner (Set by Admin) */}
                {order.estimatedDeliveryDays && (
                  <div className="bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-2xl mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-emerald-800 flex items-center gap-1.5">
                      <span>⏱️</span> Estimated Delivery Time:
                    </span>
                    <span className="text-xs font-black text-emerald-900 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-200">
                      {order.estimatedDeliveryDays}
                    </span>
                  </div>
                )}

                {/* Live Tracking ID Card when added by Admin */}
                {order.trackingId && (
                  <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl mt-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-extrabold text-blue-800 uppercase tracking-wider">
                          🚚 Order Tracking ID {order.courierName ? `(${order.courierName})` : ''}
                        </p>
                        <a
                          href={
                            order.trackingUrl?.trim()
                              ? order.trackingUrl
                              : `https://www.google.com/search?q=${encodeURIComponent(`${order.trackingId} tracking`)}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono font-black text-sm text-blue-700 underline hover:text-blue-900 inline-flex items-center gap-1 mt-0.5"
                        >
                          <span>{order.trackingId}</span>
                          <span className="text-xs">↗</span>
                        </a>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(String(order.trackingId));
                          setCopiedTrackingId(targetId);
                          setTimeout(() => setCopiedTrackingId(prev => (prev === targetId ? null : prev)), 2500);
                        }}
                        className="bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 font-extrabold text-[11px] px-3 py-1.5 rounded-xl shadow-xs shrink-0 transition"
                      >
                        {copiedTrackingId === targetId ? '✓ Copied!' : '📋 Copy ID'}
                      </button>
                    </div>

                    <a
                      href={
                        order.trackingUrl?.trim()
                          ? order.trackingUrl
                          : `https://www.google.com/search?q=${encodeURIComponent(`${order.trackingId} tracking`)}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
                    >
                      <span>🌐</span>
                      <span>Track Order in Google / Browser</span>
                    </a>
                  </div>
                )}

                {/* Address & Payment Info */}
                <div className="bg-gray-50 p-3 rounded-xl text-xs text-gray-600 space-y-1 mt-3">
                  <p><span className="font-bold">Phone:</span> {order.phoneNumber}</p>
                  {order.address && <p><span className="font-bold">Address:</span> {order.address}, {order.pincode}</p>}
                  <p><span className="font-bold">Payment Mode:</span> {order.paymentMethod || 'Cash on Delivery'}</p>
                  {Number(order.gstPercent || 0) > 0 && (
                    <p>
                      <span className="font-bold">GST ({order.gstPercent}%):</span> ₹{order.gstAmount || 0}
                      {order.gstNumber ? ` • GSTIN: ${order.gstNumber}` : ''}
                    </p>
                  )}
                  <p>
                    <span className="font-bold">Delivery Charge:</span>{' '}
                    {Number(order.deliveryCharge || 0) > 0 ? `₹${order.deliveryCharge}` : 'Free Delivery'}
                  </p>
                </div>

                {/* Payment Screenshot Preview if present */}
                {(order.screenshot || order.paymentScreenshot) && (
                  <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 mt-3">
                    <p className="text-[11px] font-bold text-amber-900 mb-1.5 flex items-center gap-1">
                      <span>📷</span> Payment Screenshot Uploaded:
                    </p>
                    <div className="w-full h-36 bg-gray-900 rounded-lg overflow-hidden">
                      <img
                        src={order.screenshot || order.paymentScreenshot}
                        alt="Payment screenshot"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {(!order.status || order.status === 'pending' || order.status === 'pending_verification') && (
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 text-center mt-3">
                    <p className="font-bold">⏳ Verification Pending</p>
                    <p className="text-[11px] text-amber-800">Admin is verifying your order & payment screenshot.</p>
                  </div>
                )}

                {/* Customer Cancel & Delete Actions */}
                <div className="flex gap-2 mt-3">
                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelModal(order)}
                      disabled={cancellingId === targetId}
                      className="flex-1 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white border border-amber-200 font-extrabold text-xs py-2.5 rounded-xl transition shadow-xs"
                    >
                      {cancellingId === targetId ? 'Cancelling...' : '🚫 Cancel Order'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteModal(order)}
                    disabled={deletingId === targetId}
                    className="flex-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 font-extrabold text-xs py-2.5 rounded-xl transition shadow-xs"
                  >
                    {deletingId === targetId ? 'Deleting...' : '🗑️ Delete Order (ഡിലീറ്റ്)'}
                  </button>
                </div>

                {/* Direct WhatsApp Contact Button for this order */}
                {(() => {
                  const savedSettings = safeJsonParse<Record<string, any>>(
                    localStorage.getItem('amal_payment_settings'),
                    {}
                  );
                  const whatsappNum = savedSettings.whatsappNumber || '6238113451';
                  return (
                    <a
                      href={`https://wa.me/91${whatsappNum}?text=${encodeURIComponent(
                        `Hello Amal Coolguard Customer Support,\nI have a question about my booking:\n\nOrder ID: #${targetId}\nProduct: ${order.productName || 'Cooling Coat'}\nAmount: ₹${order.price || 2499}\nCustomer: ${order.customerName}\nPhone: ${order.phoneNumber}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition mt-2.5"
                    >
                      <span className="text-base">💬</span>
                      <span>Send Order details to Customer Care WhatsApp ({whatsappNum})</span>
                    </a>
                  );
                })()}

                {isCancelled && (
                  <div className="p-2.5 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800 text-center font-bold mt-3">
                    🚫 Order Cancelled By You
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Modal for Cancel Order */}
      {confirmCancelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150 text-center">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 text-2xl rounded-full flex items-center justify-center mx-auto">
              🚫
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-gray-900">Cancel Order?</h3>
              <p className="text-xs text-gray-600 mt-1">
                Are you sure you want to cancel order{' '}
                <span className="font-bold">#{confirmCancelModal.orderId || confirmCancelModal.id}</span> for{' '}
                <span className="font-bold">{confirmCancelModal.productName || 'Cooling Vest'}</span>?
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleConfirmCancel(confirmCancelModal)}
                className="flex-1 bg-amber-600 text-white font-extrabold py-3 rounded-xl text-xs shadow hover:bg-amber-700"
              >
                Yes, Cancel Order
              </button>
              <button
                onClick={() => setConfirmCancelModal(null)}
                className="flex-1 bg-gray-100 text-gray-800 font-bold py-3 rounded-xl text-xs hover:bg-gray-200"
              >
                Keep Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Permanently Deleting Customer Order */}
      {confirmDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150 text-center">
            <div className="w-14 h-14 bg-red-100 text-red-600 text-2xl rounded-full flex items-center justify-center mx-auto">
              🗑️
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-gray-900">Delete Order? (ഓർഡർ ഡിലീറ്റ് ചെയ്യുക)</h3>
              <p className="text-xs text-gray-600 mt-1">
                നിങ്ങളുടെ ഓർഡർ <span className="font-bold">#{confirmDeleteModal.orderId || confirmDeleteModal.id}</span> ({confirmDeleteModal.productName || 'Product'}) സ്ഥിരമായി ഡിലീറ്റ് ചെയ്യണോ?
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleConfirmDelete(confirmDeleteModal)}
                className="flex-1 bg-red-600 text-white font-extrabold py-3 rounded-xl text-xs shadow hover:bg-red-700"
              >
                Yes, Delete Permanently
              </button>
              <button
                onClick={() => setConfirmDeleteModal(null)}
                className="flex-1 bg-gray-100 text-gray-800 font-bold py-3 rounded-xl text-xs hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
