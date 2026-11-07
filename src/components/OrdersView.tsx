import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

export default function OrdersView() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelModal, setConfirmCancelModal] = useState<any | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    let combined: any[] = [];
    try {
      const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const remote = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      combined = [...remote];
    } catch (err) {
      console.warn('Firestore fetch orders fallback:', err);
    }

    // Merge local storage orders
    const localOrders = JSON.parse(localStorage.getItem('amal_orders') || '[]');
    const localIds = new Set(combined.map(o => o.orderId || o.id));
    for (const loc of localOrders) {
      if (!localIds.has(loc.orderId)) {
        combined.push(loc);
      }
    }

    setOrders(combined);
    setLoading(false);
  };

  const handleCancelOrder = async (order: any) => {
    const targetOrderId = order.orderId || order.id;
    setCancellingId(targetOrderId);

    // Update local state
    setOrders(prev => prev.map(o => 
      (o.orderId === targetOrderId || o.id === targetOrderId) ? { ...o, status: 'cancelled' } : o
    ));

    // Update local storage
    const localOrders = JSON.parse(localStorage.getItem('amal_orders') || '[]');
    const updatedLocal = localOrders.map((o: any) => 
      (o.orderId === targetOrderId || o.id === targetOrderId) ? { ...o, status: 'cancelled' } : o
    );
    localStorage.setItem('amal_orders', JSON.stringify(updatedLocal));

    // Update Firestore document if available
    const docId = order.id || order.docId;
    if (docId) {
      try {
        await updateDoc(doc(db, 'bookings', docId), { status: 'cancelled' });
      } catch (err) {
        console.warn('Firestore cancel order err:', err);
      }
    }

    setCancellingId(null);
    setConfirmCancelModal(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600 text-sm">Loading your orders...</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
      case 'approved':
        return <span className="bg-green-100 text-green-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full">APPROVED ✓</span>;
      case 'cancelled':
      case 'canceled':
        return <span className="bg-red-100 text-red-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full">CANCELLED 🚫</span>;
      case 'rejected':
        return <span className="bg-red-100 text-red-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full">REJECTED ✕</span>;
      case 'pending':
      case 'pending_verification':
      default:
        return <span className="bg-amber-100 text-amber-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full animate-pulse">PENDING VERIFICATION ⏳</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-40 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">My Orders</h1>
        <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold">
          {orders.length} Orders
        </span>
      </div>

      <div className="p-4 space-y-4">
        {orders.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl text-center shadow-sm my-6">
            <p className="text-4xl mb-3">📦</p>
            <h3 className="font-bold text-lg text-gray-800 mb-1">No Orders Placed Yet</h3>
            <p className="text-xs text-gray-500 mb-4">You haven't ordered any cooling vests yet.</p>
            <Link to="/" className="inline-block bg-blue-600 text-white font-bold text-xs px-6 py-3 rounded-full shadow">
              Explore Products
            </Link>
          </div>
        ) : (
          orders.map((order, idx) => {
            const isCancelled = order.status?.toLowerCase() === 'cancelled';
            const targetId = order.orderId || order.id || `AC-${idx}`;

            return (
              <div 
                key={targetId} 
                className={`bg-white p-4 rounded-2xl shadow-sm border transition relative ${
                  isCancelled ? 'border-red-200 bg-gray-50/50 opacity-90' : 'border-gray-100'
                }`}
              >
                {/* Header info */}
                <div className="flex items-center justify-between border-b pb-2 mb-3">
                  <div>
                    <p className="text-xs font-bold text-gray-500">ORDER #{targetId}</p>
                    <p className="text-[11px] text-gray-400">
                      {order.createdAt?.seconds 
                        ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() 
                        : (order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Recently')}
                    </p>
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                {/* Product details & Cancel button */}
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
                    <p className="text-sm font-extrabold text-blue-700 mt-0.5">₹{order.price || 2499}</p>
                  </div>

                  {/* Cancel Order Action Button */}
                  {!isCancelled && (
                    <button
                      onClick={() => setConfirmCancelModal(order)}
                      disabled={cancellingId === targetId}
                      className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 font-extrabold text-[11px] px-3 py-2 rounded-xl transition shadow-xs flex-shrink-0"
                    >
                      {cancellingId === targetId ? 'Cancelling...' : '🚫 Cancel Order'}
                    </button>
                  )}
                </div>

                {/* Address & Payment Info */}
                <div className="bg-gray-50 p-3 rounded-xl text-xs text-gray-600 space-y-1 mt-3">
                  <p><span className="font-bold">Phone:</span> {order.phoneNumber}</p>
                  {order.address && <p><span className="font-bold">Address:</span> {order.address}, {order.pincode}</p>}
                  <p><span className="font-bold">Payment Mode:</span> {order.paymentMethod || 'Cash on Delivery'}</p>
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

                {order.status === 'pending_verification' && (
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 text-center mt-3">
                    <p className="font-bold">⏳ Verification Pending</p>
                    <p className="text-[11px] text-amber-800">Admin is verifying your order & payment screenshot.</p>
                  </div>
                )}

                {/* Direct WhatsApp Contact Button for this order */}
                {(() => {
                  const savedSettings = JSON.parse(localStorage.getItem('amal_payment_settings') || '{}');
                  const whatsappNum = savedSettings.whatsappNumber || '6238113451';
                  return (
                    <a 
                      href={`https://wa.me/91${whatsappNum}?text=${encodeURIComponent(
                        `Hello Amal Coolguard Customer Support,\nI have a question about my booking:\n\nOrder ID: #${targetId}\nProduct: ${order.productName || 'Cooling Coat'}\nAmount: ₹${order.price || 2499}\nCustomer: ${order.customerName}\nPhone: ${order.phoneNumber}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition mt-3"
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
            <div className="w-14 h-14 bg-red-100 text-red-600 text-2xl rounded-full flex items-center justify-center mx-auto">
              🚫
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-gray-900">Cancel Order?</h3>
              <p className="text-xs text-gray-600 mt-1">
                Are you sure you want to cancel order <span className="font-bold">#{confirmCancelModal.orderId || confirmCancelModal.id}</span> for <span className="font-bold">{confirmCancelModal.productName || 'Cooling Vest'}</span>?
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleCancelOrder(confirmCancelModal)}
                className="flex-1 bg-red-600 text-white font-extrabold py-3 rounded-xl text-xs shadow hover:bg-red-700"
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
    </div>
  );
}
