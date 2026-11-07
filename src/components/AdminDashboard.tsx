import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, setDoc, getDoc } from 'firebase/firestore';
import { MOCK_PRODUCTS, Product } from '../data/mockProducts';

export interface PaymentSettings {
  enableCOD: boolean;
  enableUPI: boolean;
  enableCard: boolean;
  merchantUpiId: string;
  whatsappNumber?: string;
  blockAccountOrders?: boolean;
  blockAccountWishlist?: boolean;
  blockAccountCoupons?: boolean;
  blockAccountHelp?: boolean;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'products' | 'payments' | 'promoters' | 'analytics'>('orders');

  // Synchronous initial product list from cache / local storage so dashboard opens immediately
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const cachedRemote = localStorage.getItem('amal_cached_products');
      if (cachedRemote) {
        const parsed = JSON.parse(cachedRemote);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
      return [...customLocal, ...MOCK_PRODUCTS];
    } catch {
      return MOCK_PRODUCTS;
    }
  });

  // Synchronous initial orders from local cache
  const [orders, setOrders] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('amal_cached_orders');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return JSON.parse(localStorage.getItem('amal_orders') || '[]');
    } catch {
      return [];
    }
  });

  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Payment settings state with instant local fallback
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(() => {
    try {
      const local = JSON.parse(localStorage.getItem('amal_payment_settings') || 'null');
      if (local) return local;
    } catch {}
    return {
      enableCOD: true,
      enableUPI: true,
      enableCard: true,
      merchantUpiId: 'amalcoolguard@upi',
      whatsappNumber: '6238113451',
      blockAccountOrders: false,
      blockAccountWishlist: false,
      blockAccountCoupons: false,
      blockAccountHelp: false,
    };
  });
  const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

  // Product Creation state
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: 2499,
    discountPrice: 1999,
    description: '',
    imageUrl: '',
    galleryImages: [] as string[],
    stock: 25,
    category: 'Coats',
    gstPercent: 0,
    features: ['Heat Reflective Fabric', 'UV Sun Protection', 'Water Resistant']
  });
  const [newGalleryInput, setNewGalleryInput] = useState('');

  // Product Edit state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchOrders();
    fetchPaymentSettings();
  }, []);

  const fetchPaymentSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'payment');
      const fetchPromise = getDoc(docRef);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 1200)
      );
      const docSnap = await Promise.race([fetchPromise, timeoutPromise]);
      if (docSnap.exists()) {
        const data = docSnap.data() as PaymentSettings;
        setPaymentSettings(data);
        localStorage.setItem('amal_payment_settings', JSON.stringify(data));
      }
    } catch (err) {
      // Local settings already initialized synchronously
    }
  };

  const savePaymentSettings = async () => {
    localStorage.setItem('amal_payment_settings', JSON.stringify(paymentSettings));
    try {
      await setDoc(doc(db, 'settings', 'payment'), paymentSettings);
    } catch (err) {
      console.warn('Firestore set settings err:', err);
    }
    setSettingsSavedMsg(true);
    setTimeout(() => setSettingsSavedMsg(false), 3000);
  };

  const fetchProducts = async () => {
    try {
      const fetchPromise = getDocs(collection(db, 'products'));
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 1200)
      );
      const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Product));
        setProducts(fetched);
        try {
          localStorage.setItem('amal_cached_products', JSON.stringify(fetched));
        } catch {}
        return;
      }
    } catch (err) {
      // Handled silently - already rendered from instant local cache
    }

    // Fallback to MOCK_PRODUCTS + localStorage custom products
    const customLocalProducts = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
    setProducts([...customLocalProducts, ...MOCK_PRODUCTS]);
  };

  const fetchOrders = async () => {
    let combined: any[] = [];
    try {
      const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
      const fetchPromise = getDocs(q);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 1200)
      );
      const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
      combined = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (err) {
      // Fallback
    }

    // Merge local storage orders
    const localOrders = JSON.parse(localStorage.getItem('amal_orders') || '[]');
    const localIds = new Set(combined.map(o => o.orderId || o.id));
    for (const loc of localOrders) {
      if (!localIds.has(loc.orderId)) {
        combined.push(loc);
      }
    }

    if (combined.length > 0) {
      setOrders(combined);
      try {
        localStorage.setItem('amal_cached_orders', JSON.stringify(combined));
      } catch {}
    }
  };

  // Image file handler for product upload
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'newMain' | 'newGallery' | 'editMain' | 'editGallery') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (target === 'newMain') {
          setNewProduct(prev => ({ ...prev, imageUrl: base64 }));
        } else if (target === 'newGallery') {
          setNewProduct(prev => ({ ...prev, galleryImages: [...prev.galleryImages, base64] }));
        } else if (target === 'editMain' && editingProduct) {
          setEditingProduct(prev => prev ? { ...prev, imageUrl: base64 } : null);
        } else if (target === 'editGallery' && editingProduct) {
          const current = editingProduct.galleryImages || [editingProduct.imageUrl];
          setEditingProduct(prev => prev ? { ...prev, galleryImages: [...current, base64] } : null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price) return;

    const finalMainImage = newProduct.imageUrl || 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600';
    const finalGallery = newProduct.galleryImages.length > 0 ? newProduct.galleryImages : [finalMainImage];

    const prodData = {
      name: newProduct.name,
      price: Number(newProduct.price),
      discountPrice: Number(newProduct.discountPrice || newProduct.price),
      description: newProduct.description || 'Premium heat protection cooling coat by Amal Coolguard.',
      imageUrl: finalMainImage,
      galleryImages: finalGallery,
      stock: Number(newProduct.stock || 20),
      category: newProduct.category || 'Coats',
      gstPercent: Number(newProduct.gstPercent || 0),
      rating: 4.9,
      reviewsCount: 1,
      features: newProduct.features
    };

    try {
      const docRef = await addDoc(collection(db, 'products'), prodData);
      const createdProd = { id: docRef.id, ...prodData };
      setProducts(prev => [createdProd, ...prev]);

      // Save to localStorage custom products so storefront reflects immediately
      const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
      customLocal.unshift(createdProd);
      localStorage.setItem('amal_custom_products', JSON.stringify(customLocal));
    } catch (err) {
      console.warn('Saved product locally:', err);
      const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
      const localProd = { id: 'prod_' + Date.now(), ...prodData };
      customLocal.unshift(localProd);
      localStorage.setItem('amal_custom_products', JSON.stringify(customLocal));
      setProducts(prev => [localProd, ...prev]);
    }

    setNewProduct({
      name: '',
      price: 2499,
      discountPrice: 1999,
      description: '',
      imageUrl: '',
      galleryImages: [],
      stock: 25,
      category: 'Coats',
      gstPercent: 0,
      features: ['Heat Reflective Fabric', 'UV Sun Protection', 'Water Resistant']
    });
    alert('✓ New Product added successfully!');
  };

  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const updated = {
      ...editingProduct,
      price: Number(editingProduct.price),
      discountPrice: Number(editingProduct.discountPrice || editingProduct.price),
      stock: Number(editingProduct.stock || 0),
      gstPercent: Number(editingProduct.gstPercent || 0)
    };

    // Update in state
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));

    // Update in local storage if present
    const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
    const updatedCustom = customLocal.map((p: any) => p.id === updated.id ? updated : p);
    localStorage.setItem('amal_custom_products', JSON.stringify(updatedCustom));

    // Update in Firestore
    try {
      await updateDoc(doc(db, 'products', updated.id), {
        name: updated.name,
        price: updated.price,
        discountPrice: updated.discountPrice,
        description: updated.description,
        imageUrl: updated.imageUrl,
        galleryImages: updated.galleryImages || [updated.imageUrl],
        stock: updated.stock,
        category: updated.category,
        gstPercent: updated.gstPercent
      });
    } catch (err) {
      console.warn('Firestore edit product err:', err);
    }

    setEditingProduct(null);
    alert('✓ Product updated successfully!');
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;

    setProducts(prev => prev.filter(p => p.id !== productId));

    // Remove from local custom products
    const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
    const filteredCustom = customLocal.filter((p: any) => p.id !== productId);
    localStorage.setItem('amal_custom_products', JSON.stringify(filteredCustom));

    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (err) {
      console.warn('Firestore delete product err:', err);
    }
  };

  const updateOrderStatus = async (orderId: string, docId: string | null, newStatus: 'confirmed' | 'rejected' | 'cancelled') => {
    // Update local storage
    const localOrders = JSON.parse(localStorage.getItem('amal_orders') || '[]');
    const updatedLocal = localOrders.map((o: any) => 
      o.orderId === orderId || o.id === orderId ? { ...o, status: newStatus } : o
    );
    localStorage.setItem('amal_orders', JSON.stringify(updatedLocal));

    // Update state
    setOrders(prev => prev.map(o => (o.orderId === orderId || o.id === orderId ? { ...o, status: newStatus } : o)));

    // Update Firestore document
    const targetDocId = docId || orderId;
    if (targetDocId) {
      try {
        await updateDoc(doc(db, 'bookings', targetDocId), { status: newStatus });
      } catch (err) {
        console.warn('Firestore update order status err:', err);
      }
    }
  };

  const handlePrintShippingLabel = (order: any) => {
    const printWindow = window.open('', '_blank', 'width=600,height=750');
    if (!printWindow) return;

    const labelHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shipping Label - ${order.orderId || order.id}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 25px; background: #fff; color: #111; }
          .label-card { border: 3px solid #1e293b; padding: 24px; border-radius: 16px; max-width: 520px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { text-align: center; border-bottom: 2px dashed #94a3b8; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 20px; font-weight: 900; margin: 0; color: #0f172a; text-transform: uppercase; tracking: 0.5px; }
          .subtitle { font-size: 12px; margin-top: 4px; font-weight: bold; color: #475569; }
          .section-title { font-size: 11px; font-weight: 900; text-transform: uppercase; margin-top: 16px; margin-bottom: 8px; background: #f1f5f9; padding: 6px 10px; border-radius: 6px; color: #334155; }
          .info { font-size: 14px; line-height: 1.7; }
          .bold { font-weight: 800; color: #0f172a; }
          .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; pt: 12px; font-size: 11px; text-align: center; color: #64748b; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            .label-card { border: 2px solid #000; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="text-align: center; margin-bottom: 20px;">
          <button onclick="window.print()" style="padding: 12px 24px; font-weight: 800; background: #2563eb; color: #fff; border: none; border-radius: 12px; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
            🖨️ Click to Print / Save as PDF
          </button>
        </div>

        <div class="label-card">
          <div class="header">
            <h1 class="title">AMAL COOLGUARD VESTS</h1>
            <p class="subtitle">COURIER SHIPPING LABEL • ORDER #${order.orderId || order.id}</p>
          </div>

          <div class="section-title">📦 SHIP TO / DELIVERY ADDRESS (കസ്റ്റമർ അഡ്രസ്സ്)</div>
          <div class="info">
            <p><span class="bold">CUSTOMER NAME:</span> ${order.customerName || 'N/A'}</p>
            <p><span class="bold">PHONE NUMBER:</span> +91 ${order.phoneNumber || 'N/A'}</p>
            <p><span class="bold">FULL ADDRESS:</span> ${order.address || 'N/A'}</p>
            <p><span class="bold">PINCODE:</span> ${order.pincode || 'N/A'}</p>
          </div>

          <div class="section-title">🛒 ORDER DETAILS</div>
          <div class="info">
            <p><span class="bold">ITEM:</span> ${order.productName || 'Amal Coolguard Vest'}</p>
            <p><span class="bold">TOTAL AMOUNT:</span> ₹${order.price || 2499} ${order.gstPercent ? `(Includes GST ${order.gstPercent}%)` : ''}</p>
            ${order.gstPercent ? `<p><span class="bold">TAX DETAILS:</span> GST Rate ${order.gstPercent}% Included</p>` : ''}
            <p><span class="bold">PAYMENT MODE:</span> ${order.paymentMethod || 'UPI'}</p>
            <p><span class="bold">STATUS:</span> ${(order.status || 'pending').toUpperCase()}</p>
          </div>

          <div class="footer">
            Amal Coolguard • Official Heat Protection Gear • Customer Support: 6238113451
          </div>
        </div>

        <script>
          setTimeout(() => { window.print(); }, 400);
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(labelHtml);
    printWindow.document.close();
  };

  const handleCopyAddressForWhatsApp = (order: any) => {
    const text = `📦 AMAL COOLGUARD COURIER ADDRESS
Order ID: #${order.orderId || order.id}
----------------------------------------
NAME: ${order.customerName || 'N/A'}
PHONE: ${order.phoneNumber || 'N/A'}
ADDRESS: ${order.address || 'N/A'}
PINCODE: ${order.pincode || 'N/A'}

ITEM: ${order.productName || 'Amal Coolguard Vest'}
AMOUNT: ₹${order.price || 2499} (${order.paymentMethod || 'UPI'})`;

    navigator.clipboard.writeText(text);
    alert('✓ Customer address & booking details copied to clipboard! You can paste directly into WhatsApp.');
  };

  // Analytics counters
  const totalRevenue = orders
    .filter(o => o.status === 'confirmed')
    .reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  const pendingCount = orders.filter(o => !o.status || o.status === 'pending' || o.status === 'pending_verification').length;

  return (
    <div className="min-h-screen bg-gray-100 p-3 md:p-8 pb-20">
      {/* Top Bar */}
      <header className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <h1 className="text-xl md:text-2xl font-black tracking-tight">AMAL COOLGUARD ADMIN PANEL</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">Full Control Panel: Products, Images, Orders, UPI Screenshots & Payment Gateways</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { fetchProducts(); fetchOrders(); fetchPaymentSettings(); }}
            className="bg-slate-800 hover:bg-slate-700 text-xs font-bold px-3 py-2 rounded-xl text-slate-200 border border-slate-700"
          >
            🔄 Sync Data
          </button>
          <a href="/" className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow">
            🏠 Visit Storefront
          </a>
        </div>
      </header>

      {/* Analytics Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg font-bold">📦</div>
          <div>
            <p className="text-[11px] font-bold text-gray-500">Total Bookings</p>
            <p className="text-xl font-extrabold text-gray-900">{orders.length}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-200 bg-amber-50/40 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center text-lg font-bold animate-pulse">⏳</div>
          <div>
            <p className="text-[11px] font-bold text-amber-800">Pending Approval</p>
            <p className="text-xl font-extrabold text-amber-900">{pendingCount}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-green-200 bg-green-50/40 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 text-green-700 rounded-xl flex items-center justify-center text-lg font-bold">💰</div>
          <div>
            <p className="text-[11px] font-bold text-green-800">Confirmed Revenue</p>
            <p className="text-xl font-extrabold text-green-900">₹{totalRevenue}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-lg font-bold">🏷️</div>
          <div>
            <p className="text-[11px] font-bold text-gray-500">Active Products</p>
            <p className="text-xl font-extrabold text-gray-900">{products.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {[
          { id: 'orders', label: '📦 Customer Orders', badge: pendingCount ? `${pendingCount} Pending` : `${orders.length}` },
          { id: 'customers', label: '👥 Registered Customers', badge: 'Logins' },
          { id: 'products', label: '🏷️ Products & Multi-Images', badge: `${products.length}` },
          { id: 'promoters', label: '🤝 Affiliates & Promoters', badge: '₹100/Sale' },
          { id: 'payments', label: '💳 Payment Gateway Settings', badge: 'Block/Allow' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-3 rounded-2xl font-bold text-xs shadow-sm transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-blue-600 text-white ring-2 ring-blue-300' 
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
              activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {tab.badge}
            </span>
          </button>
        ))}
      </div>

      {/* TAB 1: CUSTOMER ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
            <h2 className="font-extrabold text-sm text-gray-900">Customer Bookings & Payment Screenshots</h2>
            <button 
              onClick={fetchOrders}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              <span>🔄</span> Refresh List
            </button>
          </div>

          {loadingOrders ? (
            <div className="p-8 bg-white rounded-2xl text-center text-xs text-gray-500">Loading order records...</div>
          ) : orders.length === 0 ? (
            <div className="p-12 bg-white rounded-2xl text-center text-xs text-gray-500 border border-dashed border-gray-300">
              No customer bookings received yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {orders.map((order, idx) => {
                const isPending = !order.status || order.status === 'pending' || order.status === 'pending_verification';

                return (
                  <div 
                    key={order.id || order.orderId || idx} 
                    className={`bg-white p-5 rounded-2xl shadow-sm border transition relative ${
                      isPending ? 'border-amber-400 ring-2 ring-amber-200/50' : 'border-gray-200'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b pb-3 mb-3">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Order ID</span>
                        <p className="font-extrabold text-sm text-gray-900">{order.orderId || order.id}</p>
                      </div>
                      <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full uppercase ${
                        order.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        order.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800 animate-pulse'
                      }`}>
                        {order.status === 'confirmed' ? '✓ APPROVED' :
                         order.status === 'cancelled' ? '🚫 CANCELLED BY CUSTOMER' :
                         order.status === 'rejected' ? '✕ REJECTED' : '⏳ PENDING VERIFICATION'}
                      </span>
                    </div>

                    {/* Customer & Product Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 mb-3">
                      <div className="bg-gray-50 p-2.5 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Customer Name</p>
                        <p className="font-extrabold text-gray-900">{order.customerName || 'N/A'}</p>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">WhatsApp Phone</p>
                        <a 
                          href={`https://wa.me/91${order.phoneNumber}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="font-extrabold text-blue-600 underline flex items-center gap-1"
                        >
                          <span>💬</span> {order.phoneNumber || 'N/A'}
                        </a>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl col-span-2">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Delivery Address</p>
                        <p className="font-bold text-gray-800">{order.address}, Pincode: {order.pincode}</p>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Product Booked</p>
                        <p className="font-bold text-gray-900">{order.productName || 'Amal Coolguard Vest'}</p>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Amount & Payment Mode</p>
                        <p className="font-extrabold text-blue-700 text-sm">₹{order.price} ({order.paymentMethod || 'UPI'})</p>
                      </div>
                      {order.referralCode && (
                        <div className="bg-purple-50 border border-purple-200 p-2.5 rounded-xl col-span-2 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-purple-700 font-bold uppercase">Affiliate / Promoter Referral</p>
                            <p className="font-extrabold text-purple-900 text-xs">Code: {order.referralCode}</p>
                          </div>
                          <span className="text-xs bg-purple-600 text-white font-black px-2.5 py-1 rounded-lg">
                            +₹{order.promoterCommission || 100} Commission
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Payment Screenshot Section */}
                    {(order.screenshot || order.paymentScreenshot) ? (
                      <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 space-y-2 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                            <span>📷</span> Payment Screenshot Uploaded by Customer:
                          </span>
                          <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-md">Uploaded</span>
                        </div>
                        <div className="w-full h-56 bg-slate-900 rounded-xl overflow-hidden relative border border-amber-300">
                          <img 
                            src={order.screenshot || order.paymentScreenshot} 
                            alt="Payment Screenshot" 
                            className="w-full h-full object-contain cursor-pointer hover:scale-105 transition"
                            onClick={() => window.open(order.screenshot || order.paymentScreenshot, '_blank')}
                          />
                        </div>
                        <p className="text-[10px] text-amber-800 italic text-center">Click image to inspect full size in new tab</p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300 text-[11px] text-gray-500 italic mb-3 text-center">
                        No payment screenshot uploaded yet by customer.
                      </div>
                    )}

                    {/* Shipping Label Print & Copy Address Buttons */}
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => handlePrintShippingLabel(order)}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] py-2.5 px-3 rounded-xl shadow flex items-center justify-center gap-1.5 transition"
                      >
                        <span>🖨️</span>
                        <span>Print Shipping Label (PDF)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyAddressForWhatsApp(order)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] py-2.5 px-3 rounded-xl shadow flex items-center justify-center gap-1.5 transition"
                      >
                        <span>📋</span>
                        <span>Copy Address for WhatsApp</span>
                      </button>
                    </div>

                    {/* Admin Action Buttons */}
                    <div className="flex gap-2 pt-2 border-t">
                      <button
                        onClick={() => updateOrderStatus(order.orderId || order.id, order.id, 'confirmed')}
                        disabled={order.status === 'confirmed'}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow disabled:opacity-40 transition"
                      >
                        ✓ Approve Order
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.orderId || order.id, order.id, 'rejected')}
                        disabled={order.status === 'rejected'}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow disabled:opacity-40 transition"
                      >
                        ✕ Reject Order
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REGISTERED CUSTOMERS */}
      {activeTab === 'customers' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-sm text-gray-900">Registered Customer Logins</h2>
              <p className="text-xs text-gray-500">List of customers who signed up or logged into Amal Coolguard.</p>
            </div>
          </div>

          {(() => {
            // Collect unique customers from orders + any saved session
            const ordersList = orders || [];
            const customerMap = new Map();

            // 1. Read from dedicated registered users dictionary
            const regUsers = JSON.parse(localStorage.getItem('amal_registered_users') || '{}');
            Object.values(regUsers).forEach((u: any) => {
              if (u && u.mobile) {
                customerMap.set(u.mobile, {
                  name: u.name || 'Customer',
                  mobile: u.mobile,
                  address: u.address || 'Registered Customer Account',
                  pincode: u.pincode || 'Kerala',
                  lastOrderDate: u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : 'Active Member'
                });
              }
            });

            // 2. Read from orders
            ordersList.forEach((o: any) => {
              if (o.phoneNumber) {
                const existing = customerMap.get(o.phoneNumber);
                customerMap.set(o.phoneNumber, {
                  name: o.customerName || (existing ? existing.name : 'Customer'),
                  mobile: o.phoneNumber,
                  address: o.address || (existing ? existing.address : 'N/A'),
                  pincode: o.pincode || (existing ? existing.pincode : 'N/A'),
                  lastOrderDate: o.createdAt || 'Recent Order'
                });
              }
            });

            // 3. Also check session storage
            const session = JSON.parse(localStorage.getItem('amal_customer_session') || 'null');
            if (session && session.mobile) {
              if (!customerMap.has(session.mobile)) {
                customerMap.set(session.mobile, {
                  name: session.name,
                  mobile: session.mobile,
                  address: session.address || 'Current Logged-in Customer',
                  pincode: session.pincode || 'Kerala',
                  lastOrderDate: 'Logged In'
                });
              }
            }

            const customersList = Array.from(customerMap.values());

            if (customersList.length === 0) {
              return (
                <div className="p-12 bg-white rounded-2xl text-center text-xs text-gray-500 border border-dashed border-gray-300">
                  No registered customers found yet.
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customersList.map((cust: any, idx: number) => (
                  <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-3">
                    <div className="flex items-center gap-3 border-b pb-3">
                      <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                        👤
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-gray-900">{cust.name}</h3>
                        <p className="text-xs text-blue-600 font-bold">📱 +91 {cust.mobile}</p>
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 space-y-1">
                      <p><span className="font-bold text-gray-900">Address:</span> {cust.address}</p>
                      <p><span className="font-bold text-gray-900">Pincode:</span> {cust.pincode}</p>
                    </div>

                    <a 
                      href={`https://wa.me/91${cust.mobile}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl text-xs shadow transition mt-2"
                    >
                      💬 Chat on WhatsApp (+91 {cust.mobile})
                    </a>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Add Product Form */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
            <h2 className="text-base font-extrabold text-gray-900 mb-1 flex items-center gap-2">
              <span>➕</span> Add New Amal Coolguard Product (പ്രോഡക്റ്റ് ആഡ് ചെയ്യുക)
            </h2>
            <p className="text-xs text-gray-500 mb-4">Upload multiple product photos, set title, offer price, and product highlights.</p>

            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Product Title * (പേര്/ടൈറ്റിൽ)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Amal Solar Heat Reflective Overcoat" 
                    required
                    value={newProduct.name}
                    onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Category (വിഭാഗം)</label>
                  <select 
                    value={newProduct.category}
                    onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-bold"
                  >
                    <option value="Coats">Cooling Overcoats</option>
                    <option value="Vests">USB Blower Vests</option>
                    <option value="Ponchos">Rain Protection Ponchos</option>
                    <option value="Jackets">Sun Shield Jackets</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Original Price ₹ (പഴയ വെട്ടുന്ന വില - e.g. 2000) *</label>
                  <input 
                    type="number" 
                    placeholder="2000" 
                    required
                    value={newProduct.price || ''} 
                    onChange={e => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                    className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Discount Offer Price ₹ (ഓഫർ വില - e.g. 500) *</label>
                  <input 
                    type="number" 
                    placeholder="500" 
                    required
                    value={newProduct.discountPrice || ''} 
                    onChange={e => setNewProduct({ ...newProduct, discountPrice: Number(e.target.value) })}
                    className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-extrabold text-blue-700"
                  />
                </div>

                {/* Live Price Display Preview */}
                <div className="col-span-1 md:col-span-2 bg-amber-50 p-3 rounded-2xl border border-amber-200 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-amber-900 block">Price Display Preview on Website (വെബ്‌സൈറ്റിൽ കാണുന്ന ഓഫർ വില):</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-lg font-black text-gray-900">₹{newProduct.discountPrice || newProduct.price}</span>
                      {newProduct.price > (newProduct.discountPrice || 0) && (
                        <span className="text-sm text-gray-400 line-through font-bold">₹{newProduct.price}</span>
                      )}
                    </div>
                  </div>
                  {newProduct.price > (newProduct.discountPrice || 0) && (
                    <span className="bg-red-600 text-white text-xs font-extrabold px-3 py-1 rounded-full shadow">
                      {Math.round(((newProduct.price - newProduct.discountPrice) / newProduct.price) * 100)}% SPECIAL DISCOUNT
                    </span>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Stock Quantity (സ്റ്റോക്ക് എണ്ണം)</label>
                  <input 
                    type="number" 
                    placeholder="25" 
                    value={newProduct.stock}
                    onChange={e => setNewProduct({ ...newProduct, stock: Number(e.target.value) })}
                    className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">GST Tax Rate % (ജിഎസ് ടി - Optional)</label>
                  <select 
                    value={newProduct.gstPercent || 0}
                    onChange={e => setNewProduct({ ...newProduct, gstPercent: Number(e.target.value) })}
                    className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-bold text-blue-900"
                  >
                    <option value={0}>No GST (0% / Tax Included)</option>
                    <option value={5}>5% GST (Apparel / Garment Rate)</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST (Standard Rate)</option>
                    <option value={28}>28% GST</option>
                  </select>
                </div>

                {/* Main Image Upload & Link */}
                <div className="col-span-1 md:col-span-2 bg-blue-50/60 p-4 rounded-2xl border border-blue-100 space-y-2">
                  <label className="block font-bold text-blue-900">Main Product Image (പ്രധാന ഫോട്ടോ Upload/Link):</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 block mb-1">Upload Photo File from Device:</span>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={e => handleImageFileUpload(e, 'newMain')}
                        className="block w-full text-xs text-gray-600 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 block mb-1">Or Paste Image URL:</span>
                      <input 
                        type="text" 
                        placeholder="https://images.unsplash.com/..."
                        value={newProduct.imageUrl}
                        onChange={e => setNewProduct({ ...newProduct, imageUrl: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-xl outline-none bg-white text-xs"
                      />
                    </div>
                  </div>
                  {newProduct.imageUrl && (
                    <div className="w-20 h-20 bg-gray-200 rounded-xl overflow-hidden mt-2 border">
                      <img src={newProduct.imageUrl} alt="preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                {/* Additional Angle Photos (Gallery) */}
                <div className="col-span-1 md:col-span-2 bg-purple-50/60 p-4 rounded-2xl border border-purple-100 space-y-3">
                  <label className="block font-bold text-purple-900">
                    Multiple Photos / Angle Gallery (പല ആംഗിളിലുള്ള ഫോട്ടോസുകൾ):
                  </label>
                  <p className="text-[11px] text-purple-800">
                    Upload multiple images of the coat/vest from different angles so customers can click through photos on the storefront.
                  </p>

                  <div className="flex gap-2 items-center">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={e => handleImageFileUpload(e, 'newGallery')}
                      className="block text-xs text-gray-600 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-700 file:text-white hover:file:bg-purple-800 cursor-pointer"
                    />
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Or paste additional image URL and click Add"
                      value={newGalleryInput}
                      onChange={e => setNewGalleryInput(e.target.value)}
                      className="flex-1 p-2 text-xs border border-gray-300 rounded-xl outline-none bg-white"
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        if (newGalleryInput) {
                          setNewProduct(prev => ({ ...prev, galleryImages: [...prev.galleryImages, newGalleryInput] }));
                          setNewGalleryInput('');
                        }
                      }}
                      className="bg-purple-700 text-white font-bold text-xs px-4 py-2 rounded-xl"
                    >
                      + Add Photo
                    </button>
                  </div>

                  {/* Gallery Thumbnails List */}
                  {newProduct.galleryImages.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pt-2">
                      {newProduct.galleryImages.map((img, idx) => (
                        <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-purple-300 flex-shrink-0 group">
                          <img src={img} alt="gallery" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => setNewProduct(prev => ({ ...prev, galleryImages: prev.galleryImages.filter((_, i) => i !== idx) }))}
                            className="absolute top-0 right-0 bg-red-600 text-white text-[10px] w-4 h-4 flex items-center justify-center font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block font-bold text-gray-700 mb-1">Detailed Description (വിശദാംശങ്ങൾ)</label>
                  <textarea 
                    placeholder="Enter detailed description of the heat reflective fabric, cooling features, etc."
                    rows={3}
                    value={newProduct.description}
                    onChange={e => setNewProduct({ ...newProduct, description: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-3.5 rounded-2xl shadow-lg transition"
              >
                💾 Save & Publish Product to Storefront
              </button>
            </form>
          </div>

          {/* Current Products List with Edit & Delete */}
          <div>
            <h2 className="text-base font-extrabold text-gray-900 mb-3">All Active Store Products ({products.length})</h2>
            
            {loadingProducts ? (
              <div className="p-8 bg-white rounded-2xl text-center text-xs text-gray-500">Loading products...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(p => (
                  <div key={p.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="relative w-full h-44 bg-gray-100 rounded-xl overflow-hidden mb-2">
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          {p.category || 'Coats'}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-gray-900 leading-snug">{p.name}</h3>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="font-extrabold text-blue-700 text-base">₹{p.discountPrice || p.price}</span>
                        {p.price && p.price > (p.discountPrice || 0) && (
                          <span className="text-xs text-gray-400 line-through">₹{p.price}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 line-clamp-2 mt-1">{p.description}</p>
                      
                      {/* Gallery count indicator */}
                      {p.galleryImages && p.galleryImages.length > 0 && (
                        <p className="text-[10px] text-purple-700 font-bold mt-2">
                          📷 {p.galleryImages.length} Gallery Photos Available
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                      <button 
                        onClick={() => setEditingProduct(p)}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 rounded-xl shadow transition"
                      >
                        ✏️ Edit Product
                      </button>
                      <button 
                        onClick={() => handleDeleteProduct(p.id)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-xl shadow transition"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PAYMENT GATEWAY SETTINGS */}
      {activeTab === 'payments' && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 max-w-2xl space-y-6">
          <div>
            <h2 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center gap-2">
              <span>💳</span> Payment Gateways Control (പെയ്മെന്റ് കണ്ട്രോൾ)
            </h2>
            <p className="text-xs text-gray-500">
              Block or Allow Cash on Delivery (COD) & UPI payment methods globally on your store.
            </p>
          </div>

          {settingsSavedMsg && (
            <div className="p-3 bg-green-100 text-green-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <span>✓</span> Payment gateway settings saved successfully!
            </div>
          )}

          <div className="space-y-4">
            {/* COD Toggle */}
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div>
                <p className="font-extrabold text-sm text-gray-900">💵 Cash on Delivery (COD)</p>
                <p className="text-xs text-gray-500">Allow customers to order with cash payment on delivery.</p>
              </div>
              <button 
                onClick={() => setPaymentSettings(prev => ({ ...prev, enableCOD: !prev.enableCOD }))}
                className={`w-14 h-8 rounded-full p-1 transition duration-200 ease-in-out ${
                  paymentSettings.enableCOD ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition duration-200 ease-in-out ${
                  paymentSettings.enableCOD ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* UPI Toggle */}
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div>
                <p className="font-extrabold text-sm text-gray-900">⚡ Mobile UPI Deep-Linking (GPay/PhonePe)</p>
                <p className="text-xs text-gray-500">Allow customers to launch UPI apps directly from phone.</p>
              </div>
              <button 
                onClick={() => setPaymentSettings(prev => ({ ...prev, enableUPI: !prev.enableUPI }))}
                className={`w-14 h-8 rounded-full p-1 transition duration-200 ease-in-out ${
                  paymentSettings.enableUPI ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition duration-200 ease-in-out ${
                  paymentSettings.enableUPI ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Merchant UPI ID Input */}
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 space-y-2">
              <label className="block text-xs font-bold text-blue-900">Admin Store Merchant UPI ID:</label>
              <input 
                type="text" 
                value={paymentSettings.merchantUpiId}
                onChange={e => setPaymentSettings({ ...paymentSettings, merchantUpiId: e.target.value })}
                className="w-full p-3 text-xs border border-blue-300 rounded-xl outline-none font-mono bg-white font-bold text-blue-900"
                placeholder="amalcoolguard@upi"
              />
              <p className="text-[11px] text-blue-800">
                This UPI ID will be used when launching GPay/PhonePe for customer bookings.
              </p>
            </div>

            {/* WhatsApp Helpline Support Number Input */}
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 space-y-2">
              <label className="block text-xs font-bold text-emerald-900">💬 Customer Care WhatsApp Helpline Number (വാട്സാപ്പ് നമ്പർ):</label>
              <input 
                type="tel" 
                value={paymentSettings.whatsappNumber || '6238113451'}
                onChange={e => setPaymentSettings({ ...paymentSettings, whatsappNumber: e.target.value })}
                className="w-full p-3 text-xs border border-emerald-300 rounded-xl outline-none font-bold bg-white text-emerald-900"
                placeholder="e.g. 6238113451"
              />
              <p className="text-[11px] text-emerald-800">
                Customers can click "Contact Customer Care via WhatsApp" right after uploading their payment screenshot to chat with this number on WhatsApp.
              </p>
            </div>
            {/* Account Page Shortcuts Toggles */}
            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 space-y-3">
              <p className="font-extrabold text-xs text-purple-900 flex items-center gap-1">
                <span>🔒</span> Account Page Shortcuts Block Control (അക്കൗണ്ട് സെക്ഷൻ ഓപ്ഷനുകൾ ബ്ലോക്ക് ചെയ്യുക):
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Block Orders */}
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-purple-100">
                  <span className="font-bold text-gray-800">📦 Orders Card</span>
                  <button 
                    type="button"
                    onClick={() => setPaymentSettings(prev => ({ ...prev, blockAccountOrders: !prev.blockAccountOrders }))}
                    className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition ${
                      paymentSettings.blockAccountOrders ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                    }`}
                  >
                    {paymentSettings.blockAccountOrders ? 'BLOCKED 🚫' : 'ACTIVE ✓'}
                  </button>
                </div>

                {/* Block Wishlist */}
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-purple-100">
                  <span className="font-bold text-gray-800">❤️ Wishlist Card</span>
                  <button 
                    type="button"
                    onClick={() => setPaymentSettings(prev => ({ ...prev, blockAccountWishlist: !prev.blockAccountWishlist }))}
                    className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition ${
                      paymentSettings.blockAccountWishlist ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                    }`}
                  >
                    {paymentSettings.blockAccountWishlist ? 'BLOCKED 🚫' : 'ACTIVE ✓'}
                  </button>
                </div>

                {/* Block Coupons */}
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-purple-100">
                  <span className="font-bold text-gray-800">🎁 Coupons Card</span>
                  <button 
                    type="button"
                    onClick={() => setPaymentSettings(prev => ({ ...prev, blockAccountCoupons: !prev.blockAccountCoupons }))}
                    className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition ${
                      paymentSettings.blockAccountCoupons ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                    }`}
                  >
                    {paymentSettings.blockAccountCoupons ? 'BLOCKED 🚫' : 'ACTIVE ✓'}
                  </button>
                </div>

                {/* Block Help Center */}
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-purple-100">
                  <span className="font-bold text-gray-800">🎧 Help Center Card</span>
                  <button 
                    type="button"
                    onClick={() => setPaymentSettings(prev => ({ ...prev, blockAccountHelp: !prev.blockAccountHelp }))}
                    className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition ${
                      paymentSettings.blockAccountHelp ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                    }`}
                  >
                    {paymentSettings.blockAccountHelp ? 'BLOCKED 🚫' : 'ACTIVE ✓'}
                  </button>
                </div>
              </div>
            </div>

            <button 
              onClick={savePaymentSettings}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-lg transition"
            >
              💾 Save All Settings
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: AFFILIATE / PROMOTER COMMISSION & PAYOUT MANAGEMENT */}
      {activeTab === 'promoters' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                <span>🤝</span> Affiliate & Promoter Commission Management
              </h2>
              <p className="text-xs text-gray-500">
                Track YouTuber & influencer referral codes, total referred sales, earned commissions (₹100/coat), and settle payouts.
              </p>
            </div>
            <a 
              href="/promoter" 
              target="_blank" 
              rel="noreferrer"
              className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow inline-flex items-center gap-1.5 self-start md:self-auto transition"
            >
              <span>🔗</span> Open Promoter Sign Up Portal
            </a>
          </div>

          {(() => {
            const allPromotersDict = JSON.parse(localStorage.getItem('amal_promoters_list') || '{}');
            const ordersList = orders || [];

            // Compile promoter stats
            const promoterStatsList = Object.values(allPromotersDict).map((p: any) => {
              const matchedOrders = ordersList.filter(
                (o: any) => o.referralCode?.toUpperCase() === p.id?.toUpperCase() ||
                            o.promoterId?.toUpperCase() === p.id?.toUpperCase()
              );
              const confirmedOrders = matchedOrders.filter((o: any) => o.status === 'confirmed');
              const pendingOrders = matchedOrders.filter((o: any) => !o.status || o.status === 'pending' || o.status === 'pending_verification');
              const commissionPerSale = p.commissionPerSale || 100;
              const totalEarned = confirmedOrders.length * commissionPerSale;
              const paidAmount = p.paidAmount || 0;
              const balancePayable = Math.max(0, totalEarned - paidAmount);

              return {
                ...p,
                totalReferred: matchedOrders.length,
                confirmedOrders: confirmedOrders.length,
                pendingOrders: pendingOrders.length,
                totalEarned,
                paidAmount,
                balancePayable,
                matchedOrders
              };
            });

            const totalCommissionPayable = promoterStatsList.reduce((sum, p) => sum + p.balancePayable, 0);
            const totalCommissionPaid = promoterStatsList.reduce((sum, p) => sum + p.paidAmount, 0);

            const handleMarkPayout = (promoterId: string, amount: number) => {
              const currentDict = JSON.parse(localStorage.getItem('amal_promoters_list') || '{}');
              if (currentDict[promoterId]) {
                const currentPaid = currentDict[promoterId].paidAmount || 0;
                currentDict[promoterId].paidAmount = currentPaid + amount;
                localStorage.setItem('amal_promoters_list', JSON.stringify(currentDict));
                alert(`✓ Payout of ₹${amount} recorded for promoter ${promoterId}!`);
                window.location.reload();
              }
            };

            return (
              <div className="space-y-5">
                {/* Promoter Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                    <p className="text-[11px] font-bold text-gray-500">Registered Promoters</p>
                    <p className="text-xl font-extrabold text-gray-900 mt-1">{promoterStatsList.length}</p>
                    <span className="text-[10px] text-gray-400">Influencers / YouTubers</span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-purple-200 bg-purple-50/30">
                    <p className="text-[11px] font-bold text-purple-700">Commission Rate</p>
                    <p className="text-xl font-extrabold text-purple-900 mt-1">₹100</p>
                    <span className="text-[10px] text-purple-600 font-semibold">per verified coat sale</span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-200 bg-amber-50/40">
                    <p className="text-[11px] font-bold text-amber-800">Pending Payable Commission</p>
                    <p className="text-xl font-extrabold text-amber-900 mt-1">₹{totalCommissionPayable}</p>
                    <span className="text-[10px] text-amber-700 font-semibold">Owed to promoters</span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-green-200 bg-green-50/40">
                    <p className="text-[11px] font-bold text-green-800">Total Settled Payouts</p>
                    <p className="text-xl font-extrabold text-green-900 mt-1">₹{totalCommissionPaid}</p>
                    <span className="text-[10px] text-green-700 font-semibold">Paid via UPI</span>
                  </div>
                </div>

                {promoterStatsList.length === 0 ? (
                  <div className="p-12 bg-white rounded-3xl text-center text-xs text-gray-500 border border-dashed border-gray-300 space-y-3">
                    <span className="text-3xl block">🤝</span>
                    <p className="font-bold text-gray-800 text-sm">No Promoters Registered Yet</p>
                    <p className="text-gray-500 max-w-md mx-auto">
                      Promoters can visit the Promoter Portal (<a href="/promoter" className="text-blue-600 font-bold underline">/promoter</a>) to sign up, get unique referral links, and start referring buyers.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {promoterStatsList.map((prom, idx) => (
                      <div key={prom.id || idx} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-200 space-y-3">
                        <div className="flex items-start justify-between border-b pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-sm text-gray-900">{prom.name}</h3>
                              <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-purple-200 uppercase font-mono">
                                CODE: {prom.id}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{prom.channelName || 'Affiliate'} • 📱 +91 {prom.phone}</p>
                            {prom.paymentType === 'bank' ? (
                              <div className="mt-1 bg-blue-50 p-2 rounded-xl border border-blue-200 text-xs">
                                <p className="font-bold text-blue-900">🏦 Bank Transfer Details:</p>
                                <p className="text-gray-700 font-medium">A/C: <span className="font-mono font-bold text-gray-900">{prom.accountNumber}</span></p>
                                <p className="text-gray-700 font-medium">IFSC: <span className="font-mono font-bold text-gray-900">{prom.ifscCode}</span> ({prom.bankName || 'Bank'})</p>
                                <p className="text-gray-600 text-[11px]">Holder: {prom.accountHolderName || prom.name}</p>
                              </div>
                            ) : (
                              <p className="text-xs text-emerald-700 font-bold mt-1">📱 UPI for Payout: <span className="font-mono">{prom.upiId || 'N/A'}</span></p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-gray-400 font-bold block uppercase">Balance Due</span>
                            <span className="text-lg font-black text-amber-600">₹{prom.balancePayable}</span>
                          </div>
                        </div>

                        {/* Performance Details */}
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                            <span className="text-[10px] text-gray-400 font-bold block uppercase">Total Referred</span>
                            <span className="font-extrabold text-gray-900 text-sm">{prom.totalReferred}</span>
                          </div>
                          <div className="bg-green-50 p-2.5 rounded-xl border border-green-100">
                            <span className="text-[10px] text-green-700 font-bold block uppercase">Confirmed Sales</span>
                            <span className="font-extrabold text-green-800 text-sm">{prom.confirmedOrders}</span>
                          </div>
                          <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-100">
                            <span className="text-[10px] text-purple-700 font-bold block uppercase">Total Earned</span>
                            <span className="font-extrabold text-purple-900 text-sm">₹{prom.totalEarned}</span>
                          </div>
                        </div>

                        {/* Payout & Contact Actions */}
                        <div className="flex gap-2 pt-2 border-t">
                          <a
                            href={`https://wa.me/91${prom.phone}?text=Hello%20${encodeURIComponent(prom.name)},%20regarding%20your%20Amal%20Coolguard%20referral%20commission%20for%20code%20${prom.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow flex items-center justify-center gap-1 transition"
                          >
                            <span>💬</span> WhatsApp Promoter
                          </a>

                          {prom.balancePayable > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                const payDetail = prom.paymentType === 'bank' ? `Bank A/C ${prom.accountNumber}` : `UPI ${prom.upiId}`;
                                if (window.confirm(`Mark payout of ₹${prom.balancePayable} via ${payDetail} as completed for ${prom.name}?`)) {
                                  handleMarkPayout(prom.id, prom.balancePayable);
                                }
                              }}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow transition"
                            >
                              ✓ Pay ₹{prom.balancePayable} ({prom.paymentType === 'bank' ? 'Bank' : 'UPI'})
                            </button>
                          ) : (
                            <span className="flex-1 bg-gray-100 text-gray-500 font-extrabold text-xs py-2.5 rounded-xl text-center">
                              ✓ All Payouts Settled
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* EDIT PRODUCT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[200] p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-extrabold text-base text-gray-900">✏️ Edit Product Details</h3>
              <button 
                onClick={() => setEditingProduct(null)} 
                className="text-gray-400 hover:text-gray-700 font-bold text-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditedProduct} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Product Title</label>
                <input 
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full p-2.5 border rounded-xl outline-none bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Original Price ₹ (പഴയ വെട്ടുന്ന വില)</label>
                  <input 
                    type="number"
                    required
                    value={editingProduct.price}
                    onChange={e => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                    className="w-full p-2.5 border rounded-xl outline-none bg-gray-50 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Discount Offer Price ₹ (ഓഫർ വില)</label>
                  <input 
                    type="number"
                    required
                    value={editingProduct.discountPrice || editingProduct.price}
                    onChange={e => setEditingProduct({ ...editingProduct, discountPrice: Number(e.target.value) })}
                    className="w-full p-2.5 border rounded-xl outline-none bg-gray-50 font-extrabold text-blue-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">GST Tax Rate % (ജിഎസ് ടി - Optional)</label>
                <select 
                  value={editingProduct.gstPercent || 0}
                  onChange={e => setEditingProduct({ ...editingProduct, gstPercent: Number(e.target.value) })}
                  className="w-full p-2.5 border rounded-xl outline-none bg-gray-50 font-bold text-blue-900"
                >
                  <option value={0}>No GST (0% / Tax Included)</option>
                  <option value={5}>5% GST (Apparel / Garment Rate)</option>
                  <option value={12}>12% GST</option>
                  <option value={18}>18% GST (Standard Rate)</option>
                  <option value={28}>28% GST</option>
                </select>
              </div>

              {/* Edit Live Preview */}
              <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-900">Preview:</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-extrabold text-gray-900">₹{editingProduct.discountPrice || editingProduct.price}</span>
                  {editingProduct.price > (editingProduct.discountPrice || 0) && (
                    <span className="text-xs text-gray-400 line-through font-bold">₹{editingProduct.price}</span>
                  )}
                </div>
              </div>

              {/* Main Image Edit */}
              <div className="bg-gray-50 p-3 rounded-xl border space-y-2">
                <label className="block font-bold text-gray-700">Main Product Image:</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={e => handleImageFileUpload(e, 'editMain')}
                  className="block w-full text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white cursor-pointer"
                />
                <input 
                  type="text" 
                  value={editingProduct.imageUrl}
                  onChange={e => setEditingProduct({ ...editingProduct, imageUrl: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white text-xs"
                />
              </div>

              {/* Gallery Images Edit */}
              <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 space-y-2">
                <label className="block font-bold text-purple-900">Angle Photos Gallery:</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={e => handleImageFileUpload(e, 'editGallery')}
                  className="block w-full text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-purple-700 file:text-white cursor-pointer"
                />
                <div className="flex gap-2 overflow-x-auto pt-1">
                  {(editingProduct.galleryImages || [editingProduct.imageUrl]).map((img, idx) => (
                    <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border flex-shrink-0">
                      <img src={img} alt="gal" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Description</label>
                <textarea 
                  rows={3}
                  value={editingProduct.description}
                  onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  className="w-full p-2.5 border rounded-xl outline-none bg-gray-50"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="submit"
                  className="flex-1 bg-blue-600 text-white font-extrabold py-3 rounded-xl text-xs shadow"
                >
                  Save Changes
                </button>
                <button 
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 bg-gray-200 text-gray-800 font-bold py-3 rounded-xl text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
