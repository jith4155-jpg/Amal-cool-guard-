import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { Product } from '../data/mockProducts';
import {
  compressImageFile,
  getCatalogProducts,
  addCatalogProduct,
  updateCatalogProduct,
  deleteCatalogProduct,
  mergeRemoteCatalogProducts,
  restoreDefaultCatalogProducts,
  getLocalOrders,
  saveAllOrders,
  deleteOrderLocally,
  getDeletedOrderIds,
  getDeletedCustomerMobiles,
  deleteCustomerLocally,
  getPromotersDict,
  deletePromoterLocally,
  getCleanStoreBaseUrl,
  DEFAULT_STORE_BASE_URL,
  notifyStoreUpdated,
  safeJsonParse,
} from '../utils/storeSync';

export interface PaymentSettings {
  enableCOD: boolean;
  enableUPI: boolean;
  enableCard: boolean;
  merchantUpiId: string;
  whatsappNumber?: string;
  storeBaseUrl?: string;
  blockAccountOrders?: boolean;
  blockAccountWishlist?: boolean;
  blockAccountCoupons?: boolean;
  blockAccountHelp?: boolean;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'products' | 'payments' | 'promoters'>('orders');

  // Toast feedback state (replaces blocked window.alert)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(prev => (prev?.text === text ? null : prev)), 3500);
  };

  // In-app Confirm Modal (replaces blocked window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // In-app Shipping Label Print Modal (avoids blocked window.open popups)
  const [printLabelOrder, setPrintLabelOrder] = useState<any | null>(null);

  // Unified catalog state
  const [products, setProducts] = useState<Product[]>(() => getCatalogProducts());
  const [orders, setOrders] = useState<any[]>(() => getLocalOrders());
  const [promotersMap, setPromotersMap] = useState<Record<string, any>>(() => getPromotersDict());
  const [customerRefreshTick, setCustomerRefreshTick] = useState(0);

  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Custom commission inputs map
  const [customCommissionInputs, setCustomCommissionInputs] = useState<Record<string, string>>({});

  // Payment settings state with instant local fallback
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(() => {
    const local = safeJsonParse<PaymentSettings | null>(localStorage.getItem('amal_payment_settings'), null);
    if (local) {
      return {
        storeBaseUrl: DEFAULT_STORE_BASE_URL,
        ...local,
      };
    }
    return {
      enableCOD: true,
      enableUPI: true,
      enableCard: true,
      merchantUpiId: 'amalcoolguard@upi',
      whatsappNumber: '6238113451',
      storeBaseUrl: DEFAULT_STORE_BASE_URL,
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
    features: ['Heat Reflective Fabric', 'UV Sun Protection', 'Water Resistant'],
  });
  const [newGalleryInput, setNewGalleryInput] = useState('');

  // Product Edit state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editGalleryInput, setEditGalleryInput] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchOrders();
    fetchPaymentSettings();
    fetchPromoters();
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
        const merged = { storeBaseUrl: DEFAULT_STORE_BASE_URL, ...data };
        setPaymentSettings(merged);
        localStorage.setItem('amal_payment_settings', JSON.stringify(merged));
      }
    } catch {
      // Local settings already initialized synchronously
    }
  };

  const savePaymentSettings = async () => {
    const cleanSettings = {
      ...paymentSettings,
      storeBaseUrl: (paymentSettings.storeBaseUrl || DEFAULT_STORE_BASE_URL).trim().replace(/\/+$/, ''),
    };
    setPaymentSettings(cleanSettings);
    localStorage.setItem('amal_payment_settings', JSON.stringify(cleanSettings));
    notifyStoreUpdated();
    try {
      await setDoc(doc(db, 'settings', 'payment'), cleanSettings);
    } catch (err) {
      console.warn('Firestore set settings err:', err);
    }
    setSettingsSavedMsg(true);
    showToast('✓ Store & payment settings saved!');
    setTimeout(() => setSettingsSavedMsg(false), 3000);
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const fetchPromise = getDocs(collection(db, 'products'));
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 1200)
      );
      const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Product));
        const merged = mergeRemoteCatalogProducts(fetched);
        setProducts(merged);
        setLoadingProducts(false);
        return;
      }
    } catch {
      // Handled silently - already rendered from unified local catalog
    }

    setProducts(getCatalogProducts());
    setLoadingProducts(false);
  };

  const fetchOrders = async () => {
    setLoadingOrders(true);
    const deletedOrderIds = new Set(getDeletedOrderIds());
    let combined: any[] = [];
    try {
      const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
      const fetchPromise = getDocs(q);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 1200)
      );
      const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
      combined = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((o: any) => !deletedOrderIds.has(String(o.orderId || '')) && !deletedOrderIds.has(String(o.id || '')));
    } catch {
      // Fallback
    }

    const localOrders = getLocalOrders();
    const seenIds = new Set(combined.map(o => o.orderId || o.id));
    for (const loc of localOrders) {
      if (!seenIds.has(loc.orderId || loc.id)) {
        combined.push(loc);
      }
    }

    const cleaned = saveAllOrders(combined);
    setOrders(cleaned);
    setLoadingOrders(false);
  };

  const fetchPromoters = async () => {
    const localDict = getPromotersDict();
    setPromotersMap(localDict);
    try {
      const snap = await getDocs(collection(db, 'promoters'));
      if (!snap.empty) {
        const merged = { ...localDict };
        snap.docs.forEach(d => {
          const data = d.data();
          if (!merged[d.id]) {
            merged[d.id] = { id: d.id, ...data };
          }
        });
        setPromotersMap(merged);
        localStorage.setItem('amal_promoters_list', JSON.stringify(merged));
      }
    } catch {
      // Fallback to local promoters dictionary
    }
  };

  // Compressed image file handler supporting single & multi-file photo upload
  const handleImageFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'newMain' | 'newGallery' | 'editMain' | 'editGallery'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    try {
      const compressedList: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImageFile(files[i], 900, 0.72);
        compressedList.push(compressed);
      }

      if (target === 'newMain') {
        setNewProduct(prev => ({ ...prev, imageUrl: compressedList[0] }));
        showToast('✓ Main photo ready! Click "Save & Publish Product" to publish.');
      } else if (target === 'newGallery') {
        setNewProduct(prev => ({
          ...prev,
          galleryImages: [...prev.galleryImages, ...compressedList],
        }));
        showToast(`✓ Added ${compressedList.length} photo(s) to gallery!`);
      } else if (target === 'editMain' && editingProduct) {
        setEditingProduct(prev => (prev ? { ...prev, imageUrl: compressedList[0] } : null));
        showToast('✓ Main photo updated! Click "Save Changes" to apply.');
      } else if (target === 'editGallery' && editingProduct) {
        setEditingProduct(prev => {
          if (!prev) return null;
          const existing = prev.galleryImages && prev.galleryImages.length > 0
            ? prev.galleryImages
            : (prev.imageUrl ? [prev.imageUrl] : []);
          return { ...prev, galleryImages: [...existing, ...compressedList] };
        });
        showToast(`✓ Added ${compressedList.length} gallery photo(s)! Click "Save Changes" to save.`);
      }
    } catch {
      showToast('Could not read that image file. Please try JPG/PNG.', 'error');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name.trim() || !newProduct.price) return;
    setSavingProduct(true);

    const extraTypedGallery = newGalleryInput.trim() ? [newGalleryInput.trim()] : [];
    const combinedGallery = [...newProduct.galleryImages, ...extraTypedGallery].filter(Boolean);
    const finalMainImage =
      newProduct.imageUrl.trim() ||
      combinedGallery[0] ||
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600';
    const finalGallery = combinedGallery.length > 0 ? combinedGallery : [finalMainImage];

    const prodData: Omit<Product, 'id'> = {
      name: newProduct.name.trim(),
      price: Number(newProduct.price),
      discountPrice: Number(newProduct.discountPrice || newProduct.price),
      description: newProduct.description.trim() || 'Premium heat protection cooling coat by Amal Coolguard.',
      imageUrl: finalMainImage,
      galleryImages: finalGallery,
      stock: Number(newProduct.stock || 20),
      category: newProduct.category || 'Coats',
      gstPercent: Number(newProduct.gstPercent || 0),
      rating: 4.9,
      reviewsCount: 1,
      features: newProduct.features,
    };

    const localId = 'prod_' + Date.now();
    const localProd: Product = { id: localId, ...prodData };

    // Immediately save to unified catalog & update UI
    const nextList = addCatalogProduct(localProd);
    setProducts(nextList);

    // Sync to Firestore in background
    try {
      const docRef = await addDoc(collection(db, 'products'), prodData);
      if (docRef.id && docRef.id !== localId) {
        deleteCatalogProduct(localId);
        const syncedProd: Product = { id: docRef.id, ...prodData };
        setProducts(addCatalogProduct(syncedProd));
      }
    } catch (err) {
      console.warn('Product stored locally (Firestore sync skipped):', err);
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
      features: ['Heat Reflective Fabric', 'UV Sun Protection', 'Water Resistant'],
    });
    setNewGalleryInput('');
    setSavingProduct(false);
    showToast('✓ New Product published to storefront!');
  };

  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSavingProduct(true);

    const extraGallery = editGalleryInput.trim() ? [editGalleryInput.trim()] : [];
    const currentGallery = [...(editingProduct.galleryImages || []), ...extraGallery].filter(Boolean);
    const resolvedMainImage =
      editingProduct.imageUrl?.trim() ||
      currentGallery[0] ||
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600';
    const resolvedGallery = currentGallery.length > 0 ? currentGallery : [resolvedMainImage];

    const updated: Product = {
      ...editingProduct,
      name: editingProduct.name.trim(),
      price: Number(editingProduct.price),
      discountPrice: Number(editingProduct.discountPrice || editingProduct.price),
      stock: Number(editingProduct.stock || 0),
      gstPercent: Number(editingProduct.gstPercent || 0),
      imageUrl: resolvedMainImage,
      galleryImages: resolvedGallery,
    };

    // Update unified catalog & UI instantaneously
    const nextList = updateCatalogProduct(updated);
    setProducts(nextList);

    // Sync to Firestore using setDoc merge so even default product IDs 1..4 save cleanly
    try {
      await setDoc(
        doc(db, 'products', updated.id),
        {
          name: updated.name,
          price: updated.price,
          discountPrice: updated.discountPrice,
          description: updated.description,
          imageUrl: updated.imageUrl,
          galleryImages: updated.galleryImages,
          stock: updated.stock,
          category: updated.category,
          gstPercent: updated.gstPercent,
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore edit product sync skipped:', err);
    }

    setEditGalleryInput('');
    setEditingProduct(null);
    setSavingProduct(false);
    showToast('✓ Product changes saved & updated on storefront!');
  };

  const requestDeleteProduct = (prod: Product) => {
    setConfirmDialog({
      title: 'Delete Product?',
      message: `Are you sure you want to permanently remove "${prod.name}" from both the Admin Panel and Storefront?`,
      confirmLabel: '🗑️ Delete Product',
      danger: true,
      onConfirm: async () => {
        const nextList = deleteCatalogProduct(prod.id);
        setProducts(nextList);
        setConfirmDialog(null);
        showToast(`✓ "${prod.name}" deleted from storefront!`);
        try {
          await deleteDoc(doc(db, 'products', prod.id));
        } catch (err) {
          console.warn('Firestore delete product err:', err);
        }
      },
    });
  };

  const updateOrderStatus = async (orderId: string, docId: string | null, newStatus: 'confirmed' | 'rejected' | 'cancelled') => {
    const nextOrders = orders.map(o => (o.orderId === orderId || o.id === orderId ? { ...o, status: newStatus } : o));
    setOrders(nextOrders);
    saveAllOrders(nextOrders);

    const targetDocId = docId || orderId;
    if (targetDocId) {
      try {
        await updateDoc(doc(db, 'bookings', targetDocId), { status: newStatus });
      } catch (err) {
        console.warn('Firestore update order status err:', err);
      }
    }
    showToast(`✓ Order #${orderId} marked as ${newStatus.toUpperCase()}`);
  };

  const requestDeleteOrder = (order: any) => {
    const targetId = String(order.orderId || order.id);
    setConfirmDialog({
      title: 'Delete Order Record?',
      message: `Remove Order #${targetId} (${order.customerName || 'Customer'}) permanently from Admin & Customer Orders?`,
      confirmLabel: '🗑️ Delete Order',
      danger: true,
      onConfirm: async () => {
        const nextOrders = deleteOrderLocally(targetId, order.id ? String(order.id) : undefined);
        setOrders(nextOrders);
        setConfirmDialog(null);
        showToast(`✓ Order #${targetId} deleted!`);
        const firestoreDocId = order.docId || order.id;
        if (firestoreDocId) {
          try {
            await deleteDoc(doc(db, 'bookings', String(firestoreDocId)));
          } catch (err) {
            console.warn('Firestore delete order err:', err);
          }
        }
      },
    });
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
    showToast('✓ Customer address & booking details copied for WhatsApp!');
  };

  const handleUpdatePromoterCommission = async (promId: string, promName: string, amt: number) => {
    const dict = { ...promotersMap };
    if (dict[promId]) {
      dict[promId] = { ...dict[promId], commissionPerSale: amt };
      setPromotersMap(dict);
      localStorage.setItem('amal_promoters_list', JSON.stringify(dict));
      notifyStoreUpdated();
      showToast(`✓ Commission for ${promName} (${promId}) set to ₹${amt}/sale!`);
      try {
        await setDoc(doc(db, 'promoters', promId), { commissionPerSale: amt }, { merge: true });
      } catch (err) {
        console.warn('Firestore promoter commission sync err:', err);
      }
    }
  };

  const requestMarkPayout = (prom: any, amount: number) => {
    const payDetail = prom.paymentType === 'bank' ? `Bank A/C ${prom.accountNumber}` : `UPI ${prom.upiId}`;
    setConfirmDialog({
      title: 'Confirm Commission Payout',
      message: `Mark payout of ₹${amount} via ${payDetail} as paid for ${prom.name} (${prom.id})?`,
      confirmLabel: `✓ Confirm Paid ₹${amount}`,
      danger: false,
      onConfirm: async () => {
        const dict = { ...promotersMap };
        if (dict[prom.id]) {
          const updatedPaid = (dict[prom.id].paidAmount || 0) + amount;
          dict[prom.id] = { ...dict[prom.id], paidAmount: updatedPaid };
          setPromotersMap(dict);
          localStorage.setItem('amal_promoters_list', JSON.stringify(dict));
          notifyStoreUpdated();
          setConfirmDialog(null);
          showToast(`✓ Payout of ₹${amount} recorded for ${prom.name}!`);
          try {
            await setDoc(doc(db, 'promoters', prom.id), { paidAmount: updatedPaid }, { merge: true });
          } catch {}
        }
      },
    });
  };

  const requestDeletePromoter = (prom: any) => {
    setConfirmDialog({
      title: 'Delete Promoter Account?',
      message: `Permanently delete promoter "${prom.name}" (Code: ${prom.id})?`,
      confirmLabel: '🗑️ Delete Promoter',
      danger: true,
      onConfirm: async () => {
        deletePromoterLocally(prom.id);
        setPromotersMap(getPromotersDict());
        setConfirmDialog(null);
        showToast(`✓ Promoter ${prom.name} (${prom.id}) deleted!`);
        try {
          await deleteDoc(doc(db, 'promoters', prom.id));
        } catch {}
      },
    });
  };

  // Analytics counters
  const totalRevenue = orders
    .filter(o => o.status === 'confirmed')
    .reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  const pendingCount = orders.filter(
    o => !o.status || o.status === 'pending' || o.status === 'pending_verification'
  ).length;

  const cleanShareDomain = getCleanStoreBaseUrl();

  return (
    <div className="min-h-screen bg-gray-100 p-3 md:p-8 pb-20">
      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[300] px-4 py-3 rounded-2xl shadow-2xl text-xs font-extrabold flex items-center gap-2 border animate-in fade-in slide-in-from-top-2 duration-200 ${
            toast.type === 'error'
              ? 'bg-red-600 text-white border-red-700'
              : 'bg-emerald-600 text-white border-emerald-700'
          }`}
        >
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-80 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Top Bar */}
      <header className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <h1 className="text-xl md:text-2xl font-black tracking-tight">AMAL COOLGUARD ADMIN PANEL</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Full Control Panel: Products, Multi-Images, Orders, Customers, Promoters & Store Settings
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchProducts();
              fetchOrders();
              fetchPaymentSettings();
              fetchPromoters();
              showToast('✓ Storefront data synced!');
            }}
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
          { id: 'customers', label: '👥 Registered Customers', badge: 'Manage' },
          { id: 'products', label: '🏷️ Products & Multi-Images', badge: `${products.length}` },
          { id: 'promoters', label: '🤝 Affiliates & Promoters', badge: `${Object.keys(promotersMap).length}` },
          { id: 'payments', label: '💳 Store & Payment Settings', badge: 'Controls' },
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
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
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
            <button onClick={fetchOrders} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
              <span>🔄</span> Refresh List
            </button>
          </div>

          {loadingOrders && orders.length === 0 ? (
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
                      <span
                        className={`text-[11px] font-extrabold px-3 py-1 rounded-full uppercase ${
                          order.status === 'confirmed'
                            ? 'bg-green-100 text-green-800'
                            : order.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : order.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800 animate-pulse'
                        }`}
                      >
                        {order.status === 'confirmed'
                          ? '✓ APPROVED'
                          : order.status === 'cancelled'
                          ? '🚫 CANCELLED BY CUSTOMER'
                          : order.status === 'rejected'
                          ? '✕ REJECTED'
                          : '⏳ PENDING VERIFICATION'}
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
                        <p className="font-bold text-gray-800">
                          {order.address}, Pincode: {order.pincode}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Product Booked</p>
                        <p className="font-bold text-gray-900">{order.productName || 'Amal Coolguard Vest'}</p>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Amount & Payment Mode</p>
                        <p className="font-extrabold text-blue-700 text-sm">
                          ₹{order.price} ({order.paymentMethod || 'UPI'})
                        </p>
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
                    {order.screenshot || order.paymentScreenshot ? (
                      <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 space-y-2 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                            <span>📷</span> Payment Screenshot Uploaded by Customer:
                          </span>
                          <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-md">
                            Uploaded
                          </span>
                        </div>
                        <div className="w-full h-56 bg-slate-900 rounded-xl overflow-hidden relative border border-amber-300">
                          <img
                            src={order.screenshot || order.paymentScreenshot}
                            alt="Payment Screenshot"
                            className="w-full h-full object-contain"
                          />
                        </div>
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
                        onClick={() => setPrintLabelOrder(order)}
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
                        <span>Copy Address</span>
                      </button>
                    </div>

                    {/* Admin Action Buttons (Approve, Reject, Delete) */}
                    <div className="flex gap-2 pt-2 border-t">
                      <button
                        onClick={() => updateOrderStatus(order.orderId || order.id, order.id, 'confirmed')}
                        disabled={order.status === 'confirmed'}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow disabled:opacity-40 transition"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.orderId || order.id, order.id, 'rejected')}
                        disabled={order.status === 'rejected'}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow disabled:opacity-40 transition"
                      >
                        ✕ Reject
                      </button>
                      <button
                        onClick={() => requestDeleteOrder(order)}
                        className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-xl shadow transition"
                        title="Delete Order Permanently"
                      >
                        🗑️
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
              <h2 className="font-extrabold text-sm text-gray-900">Registered Customer Logins & Details</h2>
              <p className="text-xs text-gray-500">View or delete customer profiles, phone numbers, and emails.</p>
            </div>
          </div>

          {(() => {
            void customerRefreshTick;
            const deletedMobiles = new Set(getDeletedCustomerMobiles());
            const ordersList = orders || [];
            const customerMap = new Map<string, any>();

            const regUsers = safeJsonParse<Record<string, any>>(localStorage.getItem('amal_registered_users'), {});
            Object.values(regUsers).forEach((u: any) => {
              if (u && u.mobile && !deletedMobiles.has(String(u.mobile).trim())) {
                customerMap.set(String(u.mobile).trim(), {
                  name: u.name || 'Customer',
                  mobile: String(u.mobile).trim(),
                  email: u.email || '',
                  address: u.address || 'Registered Customer Account',
                  pincode: u.pincode || 'Kerala',
                  lastOrderDate: u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : 'Active Member',
                });
              }
            });

            ordersList.forEach((o: any) => {
              const mob = String(o.phoneNumber || '').trim();
              if (mob && !deletedMobiles.has(mob)) {
                const existing = customerMap.get(mob);
                customerMap.set(mob, {
                  name: o.customerName || (existing ? existing.name : 'Customer'),
                  mobile: mob,
                  email: o.email || existing?.email || '',
                  address: o.address || (existing ? existing.address : 'N/A'),
                  pincode: o.pincode || (existing ? existing.pincode : 'N/A'),
                  lastOrderDate: o.createdAt || 'Recent Order',
                });
              }
            });

            const session = safeJsonParse<any>(localStorage.getItem('amal_customer_session'), null);
            if (session && session.mobile && !deletedMobiles.has(String(session.mobile).trim())) {
              const mob = String(session.mobile).trim();
              if (!customerMap.has(mob)) {
                customerMap.set(mob, {
                  name: session.name,
                  mobile: mob,
                  email: session.email || '',
                  address: session.address || 'Current Logged-in Customer',
                  pincode: session.pincode || 'Kerala',
                  lastOrderDate: 'Logged In',
                });
              }
            }

            const customersList = Array.from(customerMap.values());

            if (customersList.length === 0) {
              return (
                <div className="p-12 bg-white rounded-2xl text-center text-xs text-gray-500 border border-dashed border-gray-300">
                  No active registered customers found.
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customersList.map((cust: any) => (
                  <div key={cust.mobile} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-3">
                    <div className="flex items-start justify-between border-b pb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                          👤
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-sm text-gray-900 truncate">{cust.name}</h3>
                          <p className="text-xs text-blue-600 font-bold">📱 +91 {cust.mobile}</p>
                          {cust.email && <p className="text-[11px] text-gray-500 truncate">✉️ {cust.email}</p>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDialog({
                            title: 'Delete Customer Profile?',
                            message: `Remove customer "${cust.name}" (+91 ${cust.mobile}) from the customer list?`,
                            confirmLabel: '🗑️ Delete Customer',
                            danger: true,
                            onConfirm: () => {
                              deleteCustomerLocally(cust.mobile);
                              setCustomerRefreshTick(v => v + 1);
                              setConfirmDialog(null);
                              showToast(`✓ Customer "${cust.name}" deleted!`);
                            },
                          })
                        }
                        className="bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 text-[11px] font-extrabold px-2.5 py-1.5 rounded-xl transition shrink-0"
                        title="Delete Customer"
                      >
                        🗑️ Delete
                      </button>
                    </div>

                    <div className="text-xs text-gray-600 space-y-1">
                      <p>
                        <span className="font-bold text-gray-900">Address:</span> {cust.address}
                      </p>
                      <p>
                        <span className="font-bold text-gray-900">Pincode:</span> {cust.pincode}
                      </p>
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

      {/* TAB 3: PRODUCTS & MULTI-IMAGES */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Add Product Form */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
            <h2 className="text-base font-extrabold text-gray-900 mb-1 flex items-center gap-2">
              <span>➕</span> Add New Amal Coolguard Product (പ്രോഡക്റ്റ് ആഡ് ചെയ്യുക)
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Upload one or multiple product photos (automatically compressed for fast saving), set title, offer price, and highlights.
            </p>

            {uploadingPhoto && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-700">
                ⏳ Compressing & preparing photo...
              </div>
            )}

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
                    <option value="Coats">Cooling Overcoats (Coats)</option>
                    <option value="Vests">USB Blower Vests (Vests)</option>
                    <option value="Rainwear">Rain Protection Ponchos (Rainwear)</option>
                    <option value="Jackets">Sun Shield Jackets (Jackets)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Original Price ₹ (പഴയ വില) *</label>
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
                  <label className="block font-bold text-gray-700 mb-1">Discount Offer Price ₹ (ഓഫർ വില) *</label>
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
                    <span className="text-[11px] font-bold text-amber-900 block">
                      Price Display Preview on Website (വെബ്‌സൈറ്റിൽ കാണുന്ന ഓഫർ വില):
                    </span>
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
                    <div className="flex items-center gap-3 mt-2">
                      <div className="relative w-20 h-20 bg-gray-200 rounded-xl overflow-hidden border">
                        <img src={newProduct.imageUrl} alt="preview" className="w-full h-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewProduct(prev => ({ ...prev, imageUrl: '' }))}
                        className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-100"
                      >
                        ✕ Remove Main Photo
                      </button>
                    </div>
                  )}
                </div>

                {/* Additional Angle Photos (Gallery) */}
                <div className="col-span-1 md:col-span-2 bg-purple-50/60 p-4 rounded-2xl border border-purple-100 space-y-3">
                  <label className="block font-bold text-purple-900">
                    Multiple Photos / Angle Gallery (പല ആംഗിളിലുള്ള ഫോട്ടോസുകൾ):
                  </label>
                  <p className="text-[11px] text-purple-800">
                    Select one or multiple photos from your phone/PC, or paste image URLs below.
                  </p>

                  <div className="flex gap-2 items-center">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
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
                        if (newGalleryInput.trim()) {
                          setNewProduct(prev => ({
                            ...prev,
                            galleryImages: [...prev.galleryImages, newGalleryInput.trim()],
                          }));
                          setNewGalleryInput('');
                        }
                      }}
                      className="bg-purple-700 text-white font-bold text-xs px-4 py-2 rounded-xl"
                    >
                      + Add Photo
                    </button>
                  </div>

                  {newProduct.galleryImages.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pt-2">
                      {newProduct.galleryImages.map((img, idx) => (
                        <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-purple-300 flex-shrink-0">
                          <img src={img} alt="gallery" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() =>
                              setNewProduct(prev => ({
                                ...prev,
                                galleryImages: prev.galleryImages.filter((_, i) => i !== idx),
                              }))
                            }
                            className="absolute top-0 right-0 bg-red-600 text-white text-[10px] w-5 h-5 flex items-center justify-center font-bold rounded-bl-md"
                            title="Delete photo"
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
                disabled={savingProduct || uploadingPhoto}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 rounded-2xl shadow-lg transition"
              >
                {savingProduct ? 'Saving Product...' : '💾 Save & Publish Product to Storefront'}
              </button>
            </form>
          </div>

          {/* Current Products List with Edit & Delete */}
          <div>
            <h2 className="text-base font-extrabold text-gray-900 mb-3">All Active Store Products ({products.length})</h2>

            {loadingProducts && products.length === 0 ? (
              <div className="p-8 bg-white rounded-2xl text-center text-xs text-gray-500">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="p-10 bg-white rounded-2xl text-center text-xs text-gray-500 border border-dashed border-gray-300">
                No products in catalog. Add a new product above or restore defaults in Store Settings.
              </div>
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

                      {p.galleryImages && p.galleryImages.length > 0 && (
                        <p className="text-[10px] text-purple-700 font-bold mt-2">
                          📷 {p.galleryImages.length} Gallery Photo{p.galleryImages.length > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct({
                            ...p,
                            galleryImages: p.galleryImages && p.galleryImages.length > 0 ? [...p.galleryImages] : [p.imageUrl],
                          });
                          setEditGalleryInput('');
                        }}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 rounded-xl shadow transition"
                      >
                        ✏️ Edit Product
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDeleteProduct(p)}
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

      {/* TAB 4: STORE & PAYMENT GATEWAY SETTINGS */}
      {activeTab === 'payments' && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 max-w-2xl space-y-6">
          <div>
            <h2 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center gap-2">
              <span>💳</span> Store & Payment Controls (പെയ്മെന്റ് & വെബ്‌സൈറ്റ് സെറ്റിംഗ്‌സ്)
            </h2>
            <p className="text-xs text-gray-500">
              Manage official website domain for Promoter links, UPI/COD gateways, WhatsApp helpline, and account shortcuts.
            </p>
          </div>

          {settingsSavedMsg && (
            <div className="p-3 bg-green-100 text-green-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <span>✓</span> Store & payment settings saved successfully!
            </div>
          )}

          <div className="space-y-4">
            {/* Clean Official Store Website URL (Prevents AI Studio preview domain appearing in Promoter links) */}
            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-200 space-y-2">
              <label className="block text-xs font-bold text-indigo-950">
                🌐 Official Website Domain for Promoter Links (പ്രൊമോട്ടർ ലിങ്ക് വെബ്‌സൈറ്റ് അഡ്രസ്സ്):
              </label>
              <input
                type="url"
                value={paymentSettings.storeBaseUrl || DEFAULT_STORE_BASE_URL}
                onChange={e => setPaymentSettings({ ...paymentSettings, storeBaseUrl: e.target.value })}
                className="w-full p-3 text-xs border border-indigo-300 rounded-xl outline-none font-mono bg-white font-bold text-indigo-950"
                placeholder="https://amal-cool-guard.vercel.app"
              />
              <p className="text-[11px] text-indigo-800">
                All promoter referral links will use this clean domain (e.g.{' '}
                <span className="font-mono font-bold">{cleanShareDomain}/?promoter=L01N</span>).
              </p>
            </div>

            {/* COD Toggle */}
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div>
                <p className="font-extrabold text-sm text-gray-900">💵 Cash on Delivery (COD)</p>
                <p className="text-xs text-gray-500">Allow customers to order with cash payment on delivery.</p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentSettings(prev => ({ ...prev, enableCOD: !prev.enableCOD }))}
                className={`w-14 h-8 rounded-full p-1 transition duration-200 ease-in-out ${
                  paymentSettings.enableCOD ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full shadow-md transform transition duration-200 ease-in-out ${
                    paymentSettings.enableCOD ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* UPI Toggle */}
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div>
                <p className="font-extrabold text-sm text-gray-900">⚡ Mobile UPI Deep-Linking (GPay/PhonePe)</p>
                <p className="text-xs text-gray-500">Allow customers to launch UPI apps directly from phone.</p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentSettings(prev => ({ ...prev, enableUPI: !prev.enableUPI }))}
                className={`w-14 h-8 rounded-full p-1 transition duration-200 ease-in-out ${
                  paymentSettings.enableUPI ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full shadow-md transform transition duration-200 ease-in-out ${
                    paymentSettings.enableUPI ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
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
            </div>

            {/* WhatsApp Helpline Support Number Input */}
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 space-y-2">
              <label className="block text-xs font-bold text-emerald-900">
                💬 Customer Care WhatsApp Helpline Number (വാട്സാപ്പ് നമ്പർ):
              </label>
              <input
                type="tel"
                value={paymentSettings.whatsappNumber || '6238113451'}
                onChange={e => setPaymentSettings({ ...paymentSettings, whatsappNumber: e.target.value })}
                className="w-full p-3 text-xs border border-emerald-300 rounded-xl outline-none font-bold bg-white text-emerald-900"
                placeholder="e.g. 6238113451"
              />
            </div>

            {/* Account Page Shortcuts Toggles */}
            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 space-y-3">
              <p className="font-extrabold text-xs text-purple-900 flex items-center gap-1">
                <span>🔒</span> Account Page Shortcuts Block Control:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  { key: 'blockAccountOrders', label: '📦 Orders Card' },
                  { key: 'blockAccountWishlist', label: '❤️ Wishlist Card' },
                  { key: 'blockAccountCoupons', label: '🎁 Coupons Card' },
                  { key: 'blockAccountHelp', label: '🎧 Help Center Card' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between bg-white p-3 rounded-xl border border-purple-100">
                    <span className="font-bold text-gray-800">{item.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentSettings(prev => ({
                          ...prev,
                          [item.key]: !(prev as any)[item.key],
                        }))
                      }
                      className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition ${
                        (paymentSettings as any)[item.key] ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                      }`}
                    >
                      {(paymentSettings as any)[item.key] ? 'BLOCKED 🚫' : 'ACTIVE ✓'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={savePaymentSettings}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-lg transition"
            >
              💾 Save All Settings
            </button>

            {/* Restore Default Sample Products Option */}
            <div className="pt-4 border-t flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-gray-800">Restore Starter Sample Products</p>
                <p className="text-[11px] text-gray-500">Re-adds the 4 default cooling vests if deleted earlier.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfirmDialog({
                    title: 'Restore Default Products?',
                    message: 'Add back any deleted starter Amal Coolguard products to your catalog?',
                    confirmLabel: '🔄 Restore Defaults',
                    danger: false,
                    onConfirm: () => {
                      const next = restoreDefaultCatalogProducts();
                      setProducts(next);
                      setConfirmDialog(null);
                      showToast('✓ Default sample products restored!');
                    },
                  })
                }
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs px-4 py-2 rounded-xl border border-gray-300 shrink-0"
              >
                🔄 Restore Defaults
              </button>
            </div>
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
                Manage YouTuber & influencer referral codes, customize commission rates, mark payouts, or remove promoters.
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
            const ordersList = orders || [];

            const promoterStatsList = Object.values(promotersMap).map((p: any) => {
              const matchedOrders = ordersList.filter(
                (o: any) =>
                  o.referralCode?.toUpperCase() === p.id?.toUpperCase() ||
                  o.promoterId?.toUpperCase() === p.id?.toUpperCase()
              );
              const confirmedOrders = matchedOrders.filter((o: any) => o.status === 'confirmed');
              const pendingOrders = matchedOrders.filter(
                (o: any) => !o.status || o.status === 'pending' || o.status === 'pending_verification'
              );
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
              };
            });

            const totalCommissionPayable = promoterStatsList.reduce((sum, p) => sum + p.balancePayable, 0);
            const totalCommissionPaid = promoterStatsList.reduce((sum, p) => sum + p.paidAmount, 0);

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
                    <p className="text-[11px] font-bold text-purple-700">Default Commission Rate</p>
                    <p className="text-xl font-extrabold text-purple-900 mt-1">₹100</p>
                    <span className="text-[10px] text-purple-600 font-semibold">Editable per promoter</span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-200 bg-amber-50/40">
                    <p className="text-[11px] font-bold text-amber-800">Pending Payable Commission</p>
                    <p className="text-xl font-extrabold text-amber-900 mt-1">₹{totalCommissionPayable}</p>
                    <span className="text-[10px] text-amber-700 font-semibold">Owed to promoters</span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-green-200 bg-green-50/40">
                    <p className="text-[11px] font-bold text-green-800">Total Settled Payouts</p>
                    <p className="text-xl font-extrabold text-green-900 mt-1">₹{totalCommissionPaid}</p>
                    <span className="text-[10px] text-green-700 font-semibold">Paid via UPI / Bank</span>
                  </div>
                </div>

                {promoterStatsList.length === 0 ? (
                  <div className="p-12 bg-white rounded-3xl text-center text-xs text-gray-500 border border-dashed border-gray-300 space-y-3">
                    <span className="text-3xl block">🤝</span>
                    <p className="font-bold text-gray-800 text-sm">No Promoters Registered Yet</p>
                    <p className="text-gray-500 max-w-md mx-auto">
                      Promoters can visit the Promoter Portal (<a href="/promoter" className="text-blue-600 font-bold underline">/promoter</a>) to sign up, get their auto-generated code, and share links.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {promoterStatsList.map((prom, idx) => {
                      const promLink = `${cleanShareDomain}/?promoter=${encodeURIComponent(prom.id)}`;
                      return (
                        <div key={prom.id || idx} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-200 space-y-3">
                          <div className="flex items-start justify-between border-b pb-3 gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-black text-sm text-gray-900">{prom.name}</h3>
                                <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-purple-200 uppercase font-mono">
                                  CODE: {prom.id}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {prom.channelName || 'Affiliate'} • 📱 +91 {prom.phone}
                              </p>
                              {prom.paymentType === 'bank' ? (
                                <div className="mt-1 bg-blue-50 p-2 rounded-xl border border-blue-200 text-xs">
                                  <p className="font-bold text-blue-900">🏦 Bank Transfer Details:</p>
                                  <p className="text-gray-700 font-medium">
                                    A/C: <span className="font-mono font-bold text-gray-900">{prom.accountNumber}</span>
                                  </p>
                                  <p className="text-gray-700 font-medium">
                                    IFSC: <span className="font-mono font-bold text-gray-900">{prom.ifscCode}</span> ({prom.bankName || 'Bank'})
                                  </p>
                                  <p className="text-gray-600 text-[11px]">Holder: {prom.accountHolderName || prom.name}</p>
                                </div>
                              ) : (
                                <p className="text-xs text-emerald-700 font-bold mt-1">
                                  📱 UPI for Payout: <span className="font-mono">{prom.upiId || 'N/A'}</span>
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <div className="text-right">
                                <span className="text-[10px] text-gray-400 font-bold block uppercase">Balance Due</span>
                                <span className="text-lg font-black text-amber-600">₹{prom.balancePayable}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => requestDeletePromoter(prom)}
                                className="bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>

                          {/* Clean Shareable Link Box */}
                          <div className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-gray-700 truncate">{promLink}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(promLink);
                                showToast(`✓ Copied ${prom.name}'s referral link!`);
                              }}
                              className="bg-gray-900 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0"
                            >
                              Copy Link
                            </button>
                          </div>

                          {/* Admin Commission Rate Editor (₹50, ₹100, ₹150, ₹200...) */}
                          <div className="bg-purple-50/70 border border-purple-200 p-3 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-extrabold text-purple-900 flex items-center gap-1">
                                <span>🏷️</span> Commission Rate / Sale:
                              </span>
                              <span className="text-xs font-black text-purple-800 bg-white px-2 py-0.5 rounded-lg border border-purple-200">
                                ₹{prom.commissionPerSale || 100} / coat
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-gray-500 font-bold">Quick Set:</span>
                              {[50, 100, 150, 200, 250, 300].map(amt => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => handleUpdatePromoterCommission(prom.id, prom.name, amt)}
                                  className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition ${
                                    (prom.commissionPerSale || 100) === amt
                                      ? 'bg-purple-700 text-white border-purple-800 shadow-xs'
                                      : 'bg-white text-gray-700 border-gray-200 hover:bg-purple-100'
                                  }`}
                                >
                                  ₹{amt}
                                </button>
                              ))}

                              {/* Inline Custom Commission Input (no window.prompt!) */}
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Custom ₹"
                                  value={customCommissionInputs[prom.id] ?? ''}
                                  onChange={e =>
                                    setCustomCommissionInputs(prev => ({ ...prev, [prom.id]: e.target.value }))
                                  }
                                  className="w-20 px-2 py-1 text-[10px] border border-blue-300 rounded-lg bg-white outline-none font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const raw = customCommissionInputs[prom.id];
                                    if (raw !== undefined && raw.trim() !== '' && !isNaN(Number(raw))) {
                                      handleUpdatePromoterCommission(prom.id, prom.name, Number(raw));
                                      setCustomCommissionInputs(prev => ({ ...prev, [prom.id]: '' }));
                                    }
                                  }}
                                  className="text-[10px] font-black text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-lg"
                                >
                                  Set
                                </button>
                              </div>
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
                              href={`https://wa.me/91${prom.phone}?text=Hello%20${encodeURIComponent(
                                prom.name
                              )},%20regarding%20your%20Amal%20Coolguard%20referral%20commission%20for%20code%20${prom.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow flex items-center justify-center gap-1 transition"
                            >
                              <span>💬</span> WhatsApp Promoter
                            </a>

                            {prom.balancePayable > 0 ? (
                              <button
                                type="button"
                                onClick={() => requestMarkPayout(prom, prom.balancePayable)}
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
                      );
                    })}
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
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-gray-400 hover:text-gray-700 font-bold text-xl"
              >
                ✕
              </button>
            </div>

            {uploadingPhoto && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-700">
                ⏳ Compressing photo...
              </div>
            )}

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
                  <label className="block font-bold text-gray-700 mb-1">Category</label>
                  <select
                    value={editingProduct.category || 'Coats'}
                    onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full p-2.5 border rounded-xl outline-none bg-gray-50 font-bold"
                  >
                    <option value="Coats">Coats</option>
                    <option value="Vests">Vests</option>
                    <option value="Rainwear">Rainwear</option>
                    <option value="Jackets">Jackets</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Stock Quantity</label>
                  <input
                    type="number"
                    value={editingProduct.stock ?? 20}
                    onChange={e => setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })}
                    className="w-full p-2.5 border rounded-xl outline-none bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Original Price ₹</label>
                  <input
                    type="number"
                    required
                    value={editingProduct.price}
                    onChange={e => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                    className="w-full p-2.5 border rounded-xl outline-none bg-gray-50 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Discount Offer Price ₹</label>
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
                <label className="block font-bold text-gray-700 mb-1">GST Tax Rate % (Optional)</label>
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
                <span className="text-[11px] font-bold text-amber-900">Storefront Price Preview:</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-extrabold text-gray-900">
                    ₹{editingProduct.discountPrice || editingProduct.price}
                  </span>
                  {editingProduct.price > (editingProduct.discountPrice || 0) && (
                    <span className="text-xs text-gray-400 line-through font-bold">₹{editingProduct.price}</span>
                  )}
                </div>
              </div>

              {/* Main Image Edit with Preview & Delete */}
              <div className="bg-gray-50 p-3 rounded-xl border space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-gray-700">Main Product Image:</label>
                  {editingProduct.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditingProduct({ ...editingProduct, imageUrl: '' })}
                      className="text-[10px] font-bold text-red-600 hover:underline"
                    >
                      ✕ Clear Main Image
                    </button>
                  )}
                </div>

                {editingProduct.imageUrl && (
                  <div className="w-20 h-20 rounded-xl overflow-hidden border bg-white">
                    <img src={editingProduct.imageUrl} alt="Main" className="w-full h-full object-cover" />
                  </div>
                )}

                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageFileUpload(e, 'editMain')}
                  className="block w-full text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white cursor-pointer"
                />
                <input
                  type="text"
                  placeholder="Paste Main Image URL"
                  value={editingProduct.imageUrl}
                  onChange={e => setEditingProduct({ ...editingProduct, imageUrl: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white text-xs"
                />
              </div>

              {/* Gallery Images Edit with Delete Button on Every Photo */}
              <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 space-y-2.5">
                <label className="block font-bold text-purple-900">
                  Angle Photos Gallery ({(editingProduct.galleryImages || []).length}):
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={e => handleImageFileUpload(e, 'editGallery')}
                  className="block w-full text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-purple-700 file:text-white cursor-pointer"
                />

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Or paste gallery photo URL"
                    value={editGalleryInput}
                    onChange={e => setEditGalleryInput(e.target.value)}
                    className="flex-1 p-2 border rounded-lg bg-white text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editGalleryInput.trim()) {
                        setEditingProduct(prev =>
                          prev
                            ? {
                                ...prev,
                                galleryImages: [...(prev.galleryImages || []), editGalleryInput.trim()],
                              }
                            : null
                        );
                        setEditGalleryInput('');
                      }
                    }}
                    className="bg-purple-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                  >
                    + Add
                  </button>
                </div>

                <div className="flex gap-2.5 overflow-x-auto pt-1 pb-1">
                  {(editingProduct.galleryImages || []).map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-purple-300 flex-shrink-0 bg-white">
                      <img src={img} alt="gal" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setEditingProduct(prev => {
                            if (!prev) return null;
                            const remaining = (prev.galleryImages || []).filter((_, i) => i !== idx);
                            return { ...prev, galleryImages: remaining };
                          })
                        }
                        title="Delete this photo"
                        className="absolute top-0 right-0 bg-red-600 text-white text-[10px] w-5 h-5 flex items-center justify-center font-bold rounded-bl-md shadow"
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProduct(prev => (prev ? { ...prev, imageUrl: img } : null))}
                        title="Set as Main Photo"
                        className="absolute bottom-0 left-0 right-0 bg-black/65 text-white text-[9px] font-bold py-0.5 text-center"
                      >
                        ★ Main
                      </button>
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
                  disabled={savingProduct || uploadingPhoto}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold py-3 rounded-xl text-xs shadow"
                >
                  {savingProduct ? 'Saving...' : '💾 Save Changes'}
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

      {/* IN-APP CONFIRMATION DIALOG (Replaces window.confirm cleanly) */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[250] p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 text-center">
            <div
              className={`w-14 h-14 text-2xl rounded-full flex items-center justify-center mx-auto ${
                confirmDialog.danger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
              }`}
            >
              {confirmDialog.danger ? '🗑️' : '✓'}
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">{confirmDialog.title}</h3>
              <p className="text-xs text-gray-600 mt-1">{confirmDialog.message}</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`flex-1 text-white font-extrabold py-3 rounded-xl text-xs shadow ${
                  confirmDialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="flex-1 bg-gray-100 text-gray-800 font-bold py-3 rounded-xl text-xs hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP SHIPPING LABEL PRINT MODAL (Works inside iframes without window.open) */}
      {printLabelOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[260] p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <h3 className="font-extrabold text-base text-gray-900">🖨️ Courier Shipping Label</h3>
              <button
                type="button"
                onClick={() => setPrintLabelOrder(null)}
                className="text-gray-400 hover:text-gray-700 font-bold text-xl"
              >
                ✕
              </button>
            </div>

            <div className="border-2 border-slate-900 p-5 rounded-2xl space-y-4 text-xs text-gray-900 bg-white">
              <div className="text-center border-b-2 border-dashed border-gray-300 pb-3">
                <h2 className="text-lg font-black uppercase tracking-wide">AMAL COOLGUARD VESTS</h2>
                <p className="text-[11px] font-bold text-gray-600">
                  COURIER SHIPPING LABEL • ORDER #{printLabelOrder.orderId || printLabelOrder.id}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded text-gray-700">
                  📦 SHIP TO / DELIVERY ADDRESS
                </p>
                <p><span className="font-bold">CUSTOMER NAME:</span> {printLabelOrder.customerName || 'N/A'}</p>
                <p><span className="font-bold">PHONE:</span> +91 {printLabelOrder.phoneNumber || 'N/A'}</p>
                <p><span className="font-bold">ADDRESS:</span> {printLabelOrder.address || 'N/A'}</p>
                <p><span className="font-bold">PINCODE:</span> {printLabelOrder.pincode || 'N/A'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded text-gray-700">
                  🛒 ORDER DETAILS
                </p>
                <p><span className="font-bold">ITEM:</span> {printLabelOrder.productName || 'Amal Coolguard Vest'}</p>
                <p>
                  <span className="font-bold">TOTAL AMOUNT:</span> ₹{printLabelOrder.price || 2499}{' '}
                  {printLabelOrder.gstPercent ? `(Includes GST ${printLabelOrder.gstPercent}%)` : ''}
                </p>
                <p><span className="font-bold">PAYMENT MODE:</span> {printLabelOrder.paymentMethod || 'UPI'}</p>
                <p><span className="font-bold">STATUS:</span> {(printLabelOrder.status || 'pending').toUpperCase()}</p>
              </div>

              <div className="text-center text-[10px] text-gray-500 border-t pt-2">
                Amal Coolguard • Customer Care: {paymentSettings.whatsappNumber || '6238113451'}
              </div>
            </div>

            <div className="flex gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl text-xs shadow"
              >
                🖨️ Print / Save as PDF
              </button>
              <button
                type="button"
                onClick={() => handleCopyAddressForWhatsApp(printLabelOrder)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-xl text-xs shadow"
              >
                📋 Copy Address
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
