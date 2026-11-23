import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  mapBookingFromDb,
  mapProductFromDb,
  mapProductToDb,
  mapPromoterFromDb,
  OperationType,
  uploadDataUrlToStorage,
} from '../firebase';
import { Product } from '../data/mockProducts';
import { ThemeSwitcher } from '../context/ThemeContext';
import {
  compressProductImageToRange,
  estimateDataUrlKB,
  getCatalogProducts,
  isProductDeleted,
  addCatalogProduct,
  updateCatalogProduct,
  deleteCatalogProduct,
  mergeRemoteCatalogProducts,
  clearCatalogDirty,
  resolveOrderProductImage,
  restoreDefaultCatalogProducts,
  clearAllCatalogProducts,
  getLocalOrders,
  saveAllOrders,
  deleteOrderLocally,
  getDeletedOrderIds,
  getDeletedProductIds,
  getDeletedCustomerMobiles,
  deleteCustomerLocally,
  getPromotersDict,
  deletePromoterLocally,
  getCleanStoreBaseUrl,
  getPromoterShareLink,
  DEFAULT_STORE_BASE_URL,
  notifyStoreUpdated,
  safeJsonParse,
  getCategories,
  saveCategories,
  addCategory,
  deleteCategory,
  clearAllCategories,
  saveCatalogProducts,
  getPaymentSettings,
  savePaymentSettingsSync,
  StorePaymentSettings,
  calculateProductTotals,
} from '../utils/storeSync';

export type PaymentSettings = StorePaymentSettings;

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

function buildPaymentSettingsPayload(settings: StorePaymentSettings) {
  return {
    enableCOD: Boolean(settings.enableCOD),
    enableUPI: Boolean(settings.enableUPI),
    enableCard: Boolean(settings.enableCard),
    merchantUpiId: String(settings.merchantUpiId || 'amalcoolguard@upi').slice(0, 120),
    whatsappNumber: String(settings.whatsappNumber || '6238113451').slice(0, 30),
    storeBaseUrl: String(settings.storeBaseUrl || DEFAULT_STORE_BASE_URL).slice(0, 300),
    gstNumber: String(settings.gstNumber || '').slice(0, 64),
    pickupName: String(settings.pickupName || 'Amal Coolguard').slice(0, 120),
    pickupPhone: String(settings.pickupPhone || '').slice(0, 30),
    pickupAddress: String(settings.pickupAddress || '').slice(0, 500),
    pickupPincode: String(settings.pickupPincode || '').slice(0, 20),
    defaultDeliveryDays: String(settings.defaultDeliveryDays || '3-5 Days').slice(0, 100),
    blockAccountOrders: Boolean(settings.blockAccountOrders),
    blockAccountWishlist: Boolean(settings.blockAccountWishlist),
    blockAccountCoupons: Boolean(settings.blockAccountCoupons),
    blockAccountHelp: Boolean(settings.blockAccountHelp),
    updatedAt: new Date().toISOString(),
  };
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('amal_admin_auth') !== 'true') {
      navigate('/admin');
    }
  }, [navigate]);

  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'products' | 'payments' | 'promoters'>('orders');

  // Toast feedback state (replaces blocked window.alert)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(prev => (prev?.text === text ? null : prev)), 4500);
  };

  const [updatingOrderKey, setUpdatingOrderKey] = useState<string | null>(null);
  const [brokenAdminOrderThumbs, setBrokenAdminOrderThumbs] = useState<Record<string, boolean>>({});

  // In-app Confirm Modal (replaces blocked window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // In-app Shipping Label Print Modal & Quick Pickup/GST Modal
  const [printLabelOrder, setPrintLabelOrder] = useState<any | null>(null);
  const [showPickupQuickModal, setShowPickupQuickModal] = useState(false);

  // Unified catalog, orders, promoters & dynamic categories state
  const [products, setProducts] = useState<Product[]>(() => getCatalogProducts());
  const [orders, setOrders] = useState<any[]>(() => getLocalOrders());
  const [promotersMap, setPromotersMap] = useState<Record<string, any>>(() => getPromotersDict());
  const [categories, setCategories] = useState<string[]>(() => getCategories());
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [customerRefreshTick, setCustomerRefreshTick] = useState(0);

  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [syncingCloudCatalog, setSyncingCloudCatalog] = useState(false);

  // Custom commission inputs, Tracking ID drafts & Delivery Days ETA drafts
  const [customCommissionInputs, setCustomCommissionInputs] = useState<Record<string, string>>({});
  const [trackingDrafts, setTrackingDrafts] = useState<
    Record<string, { trackingId: string; trackingUrl: string; courierName: string }>
  >({});
  const [deliveryDaysDrafts, setDeliveryDaysDrafts] = useState<Record<string, string>>({});

  // Payment & store settings state
  const [paymentSettings, setPaymentSettings] = useState<StorePaymentSettings>(() => getPaymentSettings());
  const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

  // Product Creation state
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: 2499,
    discountPrice: 1999,
    deliveryCharge: 0,
    estimatedDeliveryDays: '',
    description: '',
    imageUrl: '',
    galleryImages: [] as string[],
    stock: 25,
    category: getCategories()[0] || 'Coats',
    gstPercent: 0,
    features: ['Heat Reflective Fabric', 'UV Sun Protection', 'Lightweight & Breathable'],
  });
  const [newGalleryInput, setNewGalleryInput] = useState('');

  // Product Edit state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editGalleryInput, setEditGalleryInput] = useState('');

  const applyFetchedOrders = useCallback((remoteList: any[]) => {
    const deletedOrderIds = new Set(getDeletedOrderIds());
    const cleanRemote = remoteList.filter(
      (o: any) => !deletedOrderIds.has(String(o.orderId || '')) && !deletedOrderIds.has(String(o.id || ''))
    );

    const combined: any[] = [...cleanRemote];
    const seenIds = new Set<string>();
    for (const o of cleanRemote) {
      if (o.orderId) seenIds.add(String(o.orderId));
      if (o.id) seenIds.add(String(o.id));
    }

    const localOrders = getLocalOrders();
    for (const loc of localOrders) {
      const oid = String(loc.orderId || '');
      const lid = String(loc.id || '');
      if (deletedOrderIds.has(oid) || deletedOrderIds.has(lid)) continue;
      if ((oid && seenIds.has(oid)) || (lid && seenIds.has(lid))) continue;
      // Keep unsynced local-only orders without overriding live Firestore orders
      combined.push(loc);
    }

    const cleaned = saveAllOrders(combined);
    setOrders(cleaned);
  }, []);

  const resolveBookingDocIds = async (orderId?: string | null, docId?: string | null): Promise<string[]> => {
    const ids = new Set<string>();
    const cleanOrderId = String(orderId || '').trim();
    if (docId && String(docId) !== cleanOrderId) {
      const snap = await getDoc(doc(db, 'bookings', String(docId)));
      if (snap.exists()) ids.add(snap.id);
    }
    if (ids.size === 0 && cleanOrderId) {
      const q = query(collection(db, 'bookings'), where('orderId', '==', cleanOrderId));
      const snap = await getDocs(q);
      snap.docs.forEach(d => ids.add(d.id));
    }
    if (ids.size === 0 && docId) {
      const fallbackSnap = await getDoc(doc(db, 'bookings', String(docId)));
      if (fallbackSnap.exists()) ids.add(fallbackSnap.id);
    }
    return Array.from(ids);
  };

  useEffect(() => {
    fetchProducts();
    fetchPaymentSettings();
    fetchCategories();

    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      snapshot => {
        const fetched = snapshot.docs.map(d => mapProductFromDb(d.data(), d.id));
        if (fetched.length > 0) {
          setProducts(mergeRemoteCatalogProducts(fetched));
        }
      },
      err => {
        console.warn('Firestore products listener warning:', err);
      }
    );

    return () => {
      unsubProducts();
    };
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchPromoters();
    fetchCategories();
    fetchPaymentSettings();

    if (localStorage.getItem('amal_catalog_dirty') === 'true') {
      syncCatalogToCloud();
    }

    const unsubBookings = onSnapshot(
      collection(db, 'bookings'),
      snapshot => {
        const remote = snapshot.docs.map(d => mapBookingFromDb(d.data(), d.id));
        remote.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        applyFetchedOrders(remote);
      },
      err => {
        console.warn('Firestore bookings listener warning:', err);
      }
    );

    const unsubPromoters = onSnapshot(
      collection(db, 'promoters'),
      snapshot => {
        const localDict = getPromotersDict();
        const merged: Record<string, any> = { ...localDict };
        snapshot.docs.forEach(d => {
          const mapped = mapPromoterFromDb(d.data(), d.id);
          if (mapped.id) {
            merged[mapped.id] = mapped;
          }
        });
        setPromotersMap(merged);
        localStorage.setItem('amal_promoters_list', JSON.stringify(merged));
      },
      err => {
        console.warn('Firestore promoters listener warning:', err);
      }
    );

    return () => {
      unsubBookings();
      unsubPromoters();
    };
  }, [applyFetchedOrders]);

  const fetchCategories = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'categories'));
      const data = snap.exists() ? snap.data() : null;
      if (data && Array.isArray(data.list) && data.list.length > 0) {
        const synced = saveCategories(data.list);
        setCategories(synced);
      }
    } catch {
      // Local categories already initialized
    }
  };

  const handleAddCustomCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    const next = addCategory(trimmed);
    setCategories(next);
    setNewProduct(prev => ({ ...prev, category: trimmed }));
    setNewCategoryInput('');
    showToast(`✓ Category "${trimmed}" added to Admin & Storefront!`);

    try {
      await setDoc(doc(db, 'settings', 'categories'), {
        list: next,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/categories');
    }
  };

  const handleDeleteCustomCategory = async (catName: string) => {
    const next = deleteCategory(catName);
    setCategories(next);
    if (newProduct.category === catName) {
      setNewProduct(prev => ({ ...prev, category: next[0] || 'Coats' }));
    }
    const currentProducts = getCatalogProducts();
    let hasModifiedProducts = false;
    const updatedProducts = currentProducts.map(p => {
      if (p.category && p.category.trim().toLowerCase() === catName.trim().toLowerCase()) {
        hasModifiedProducts = true;
        return { ...p, category: next[0] || '' };
      }
      return p;
    });
    if (hasModifiedProducts) {
      saveCatalogProducts(updatedProducts, true);
      setProducts(updatedProducts);
    }
    showToast(`✓ Category "${catName}" removed.`);

    try {
      await setDoc(doc(db, 'settings', 'categories'), {
        list: next,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/categories');
    }
  };

  const handleClearAllCategories = async () => {
    const next = clearAllCategories();
    setCategories(next);
    setNewProduct(prev => ({ ...prev, category: '' }));
    const currentProducts = getCatalogProducts();
    const updatedProducts = currentProducts.map(p => ({ ...p, category: '' }));
    saveCatalogProducts(updatedProducts, true);
    setProducts(updatedProducts);
    showToast('✓ All categories removed & hidden from Storefront!');

    try {
      await setDoc(doc(db, 'settings', 'categories'), {
        list: [],
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/categories');
    }
  };

  const fetchPaymentSettings = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'payment'));
      if (snap.exists()) {
        const merged = savePaymentSettingsSync({
          ...getPaymentSettings(),
          ...(snap.data() as Partial<StorePaymentSettings>),
        });
        setPaymentSettings(merged);
      }
    } catch {
      // Local settings already initialized synchronously
    }
  };

  const togglePaymentGateway = async (
    key: 'enableCOD' | 'enableUPI' | 'enableCard',
    label: string
  ) => {
    const updated = savePaymentSettingsSync({
      ...paymentSettings,
      [key]: !paymentSettings[key],
    });
    setPaymentSettings(updated);
    const isNowEnabled = updated[key];
    showToast(
      isNowEnabled
        ? `✓ ${label} is now ACTIVE on Storefront!`
        : `🚫 ${label} is now BLOCKED on Storefront!`
    );

    try {
      await setDoc(doc(db, 'settings', 'payment'), buildPaymentSettingsPayload(updated));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/payment');
    }
  };

  const savePaymentSettings = async () => {
    const cleanSettings = savePaymentSettingsSync(paymentSettings);
    setPaymentSettings(cleanSettings);

    try {
      await setDoc(doc(db, 'settings', 'payment'), buildPaymentSettingsPayload(cleanSettings));
      setSettingsSavedMsg(true);
      showToast('✓ Store & payment settings saved to Firebase!');
      setTimeout(() => setSettingsSavedMsg(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/payment');
    }
  };

  const syncCatalogToCloud = async (customList?: Product[]) => {
    const listToSync = (customList || products).filter(p => !isProductDeleted(p.id));

    setSyncingCloudCatalog(true);
    try {
      const batch = writeBatch(db);
      for (const prod of listToSync) {
        batch.set(doc(db, 'products', prod.id), mapProductToDb(prod), { merge: true });
      }

      const deletedIds = getDeletedProductIds();
      for (const delId of deletedIds) {
        batch.delete(doc(db, 'products', String(delId)));
      }

      batch.set(doc(db, 'settings', 'catalog'), {
        initialized: true,
        deletedIds,
        updatedAt: new Date().toISOString(),
      });

      await batch.commit();
      clearCatalogDirty();
      showToast(`✓ Cloud Synced: ${listToSync.length} active products live on Storefront & Promoter links!`);
    } catch (err) {
      console.warn('syncCatalogToCloud err:', err);
      showToast('❌ Failed to sync catalog to Firestore.', 'error');
    } finally {
      setSyncingCloudCatalog(false);
    }
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const snap = await getDocs(collection(db, 'products'));
      const fetched = snap.docs.map(d => mapProductFromDb(d.data(), d.id));
      if (fetched.length > 0) {
        const merged = mergeRemoteCatalogProducts(fetched);
        setProducts(merged);
        setLoadingProducts(false);
        return;
      } else if (getCatalogProducts().length > 0) {
        syncCatalogToCloud(getCatalogProducts());
      }
    } catch {
      // Handled gracefully - fallback to unified local catalog
    }

    setProducts(getCatalogProducts());
    setLoadingProducts(false);
  };

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const snap = await getDocs(collection(db, 'bookings'));
      const remote = snap.docs.map(d => mapBookingFromDb(d.data(), d.id));
      remote.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      applyFetchedOrders(remote);
      setLoadingOrders(false);
      return;
    } catch (err) {
      console.warn('Firestore fetchOrders err:', err);
    }

    setOrders(getLocalOrders());
    setLoadingOrders(false);
  };

  const fetchPromoters = async () => {
    const localDict = getPromotersDict();
    setPromotersMap(localDict);

    try {
      const snap = await getDocs(collection(db, 'promoters'));
      if (!snap.empty) {
        const merged: Record<string, any> = { ...localDict };
        snap.docs.forEach(d => {
          const mapped = mapPromoterFromDb(d.data(), d.id);
          if (mapped.id) {
            merged[mapped.id] = mapped;
          }
        });
        setPromotersMap(merged);
        localStorage.setItem('amal_promoters_list', JSON.stringify(merged));
      }
    } catch (err) {
      console.warn('Firestore fetchPromoters err:', err);
    }
  };

  // Auto-filtered 10–50 KB image compressor + direct Firebase Storage upload
  const handleImageFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'newMain' | 'newGallery' | 'editMain' | 'editGallery'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    try {
      const uploadedOrCompressed: { url: string; sizeKB: number; isCloud: boolean }[] = [];
      for (let i = 0; i < files.length; i++) {
        const result = await compressProductImageToRange(files[i], 10, 50);
        const cloudUrl = await uploadDataUrlToStorage(
          result.dataUrl,
          `products/img_${Date.now()}_${i}.jpg`
        );
        uploadedOrCompressed.push({
          url: cloudUrl || result.dataUrl,
          sizeKB: result.sizeKB,
          isCloud: Boolean(cloudUrl),
        });
      }
      const urlsList = uploadedOrCompressed.map(o => o.url);
      const sizeSummary = uploadedOrCompressed.map(o => `${o.sizeKB} KB`).join(', ');
      const anyCloud = uploadedOrCompressed.some(o => o.isCloud);
      const storageSuffix = anyCloud ? ' → Uploaded to Firebase Storage' : '';

      if (target === 'newMain') {
        setNewProduct(prev => ({ ...prev, imageUrl: urlsList[0] }));
        showToast(`✓ Main photo auto-filtered (${sizeSummary})${storageSuffix}!`);
      } else if (target === 'newGallery') {
        setNewProduct(prev => ({
          ...prev,
          galleryImages: [...prev.galleryImages, ...urlsList],
        }));
        showToast(`✓ Added ${urlsList.length} photo(s) (${sizeSummary})${storageSuffix}!`);
      } else if (target === 'editMain' && editingProduct) {
        setEditingProduct(prev => (prev ? { ...prev, imageUrl: urlsList[0] } : null));
        showToast(`✓ Main photo (${sizeSummary})${storageSuffix}! Click "Save Changes".`);
      } else if (target === 'editGallery' && editingProduct) {
        setEditingProduct(prev => {
          if (!prev) return null;
          const existing =
            prev.galleryImages && prev.galleryImages.length > 0
              ? prev.galleryImages
              : prev.imageUrl
              ? [prev.imageUrl]
              : [];
          return { ...prev, galleryImages: [...existing, ...urlsList] };
        });
        showToast(`✓ Added ${urlsList.length} gallery photo(s) (${sizeSummary})${storageSuffix}! Click "Save Changes".`);
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

    const extraTypedGallery = newGalleryInput.trim() ? [newGalleryInput.trim()] : [];
    const combinedGallery = [...newProduct.galleryImages, ...extraTypedGallery].filter(Boolean);
    const finalMainImage = (newProduct.imageUrl.trim() || combinedGallery[0] || '').slice(0, 950000);
    if (!finalMainImage) {
      showToast('Please upload or paste at least one product photo before publishing.', 'error');
      return;
    }

    const finalGallery = (combinedGallery.length > 0 ? combinedGallery : [finalMainImage]).slice(0, 15);
    const localId = 'prod_' + Date.now();
    const newLocalProd: Product = {
      id: localId,
      name: newProduct.name.trim().slice(0, 200),
      price: Number(newProduct.price),
      discountPrice: Number(newProduct.discountPrice || newProduct.price),
      deliveryCharge: Math.max(0, Number(newProduct.deliveryCharge || 0)),
      estimatedDeliveryDays: newProduct.estimatedDeliveryDays.trim().slice(0, 100),
      description: (newProduct.description.trim() || 'Premium heat protection cooling coat by Amal Coolguard.').slice(0, 2000),
      imageUrl: finalMainImage,
      galleryImages: finalGallery,
      stock: Number(newProduct.stock || 20),
      category: (newProduct.category || categories[0] || 'Coats').slice(0, 100),
      gstPercent: Math.max(0, Number(newProduct.gstPercent || 0)),
      rating: 4.9,
      reviewsCount: 1,
      features: (newProduct.features || []).slice(0, 20),
    };

    const nextList = addCatalogProduct(newLocalProd);
    setProducts(nextList);

    if (newLocalProd.category && !categories.some(c => c.toLowerCase() === newLocalProd.category!.toLowerCase())) {
      const nextCats = addCategory(newLocalProd.category);
      setCategories(nextCats);
      setDoc(doc(db, 'settings', 'categories'), {
        list: nextCats,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }

    setNewProduct({
      name: '',
      price: 2499,
      discountPrice: 1999,
      deliveryCharge: 0,
      estimatedDeliveryDays: '',
      description: '',
      imageUrl: '',
      galleryImages: [],
      stock: 25,
      category: categories[0] || 'Coats',
      gstPercent: 0,
      features: ['Heat Reflective Fabric', 'UV Sun Protection', 'Lightweight & Breathable'],
    });
    setNewGalleryInput('');
    showToast('✓ New Product & photo published live to Storefront & Orders!');

    const publishToCloud = async () => {
      setSavingProduct(true);
      try {
        // Ensure any data URLs get uploaded to Amalcoolguard bucket now that Admin session is active
        let resolvedMain = newLocalProd.imageUrl;
        if (resolvedMain.startsWith('data:')) {
          const uploaded = await uploadDataUrlToStorage(
            resolvedMain,
            `products/${localId}_main_${Date.now()}.jpg`
          );
          if (uploaded) resolvedMain = uploaded;
        }
        const resolvedGallery = await Promise.all(
          (newLocalProd.galleryImages || [resolvedMain]).map(async (gUrl, idx) => {
            if (gUrl.startsWith('data:')) {
              const up = await uploadDataUrlToStorage(
                gUrl,
                `products/${localId}_gal_${idx}_${Date.now()}.jpg`
              );
              return up || gUrl;
            }
            return gUrl;
          })
        );

        const cloudProd: Product = {
          ...newLocalProd,
          imageUrl: resolvedMain,
          galleryImages: resolvedGallery,
        };

        await setDoc(doc(db, 'products', cloudProd.id), {
          ...mapProductToDb(cloudProd),
          createdAt: new Date().toISOString(),
        });

        const updatedCatalog = updateCatalogProduct(cloudProd);
        clearCatalogDirty();
        setProducts(updatedCatalog);
        showToast('✓ Synced to Firebase Cloud & Storage!');
      } catch (err) {
        console.warn('Firestore publish product warning:', err);
        showToast('❌ Could not sync product to Firestore.', 'error');
      } finally {
        setSavingProduct(false);
      }
    };

    await publishToCloud();
  };

  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const extraGallery = editGalleryInput.trim() ? [editGalleryInput.trim()] : [];
    const currentGallery = [...(editingProduct.galleryImages || []), ...extraGallery].filter(Boolean);
    const resolvedMainImage = (editingProduct.imageUrl?.trim() || currentGallery[0] || '').slice(0, 950000);
    if (!resolvedMainImage) {
      showToast('Please upload or paste a product photo before saving changes.', 'error');
      return;
    }
    const resolvedGallery = (currentGallery.length > 0 ? currentGallery : [resolvedMainImage]).slice(0, 15);

    const updated: Product = {
      ...editingProduct,
      name: editingProduct.name.trim().slice(0, 200),
      price: Number(editingProduct.price),
      discountPrice: Number(editingProduct.discountPrice || editingProduct.price),
      deliveryCharge: Math.max(0, Number(editingProduct.deliveryCharge || 0)),
      estimatedDeliveryDays: (editingProduct.estimatedDeliveryDays || '').trim().slice(0, 100),
      description: (editingProduct.description || 'Premium heat protection cooling coat by Amal Coolguard.').slice(0, 2000),
      stock: Number(editingProduct.stock || 0),
      gstPercent: Math.max(0, Number(editingProduct.gstPercent || 0)),
      imageUrl: resolvedMainImage,
      galleryImages: resolvedGallery,
    };

    // 1. Instantly save locally to catalog and update state
    const nextList = updateCatalogProduct(updated);
    setProducts(nextList);
    setEditGalleryInput('');
    setEditingProduct(null);
    showToast('✓ Product photo & details saved live on Storefront!');

    // 2. Firestore Cloud sync & Firebase Storage upload
    const saveToCloud = async () => {
      setSavingProduct(true);
      try {
        let resolvedMain = updated.imageUrl || '';
        if (resolvedMain.startsWith('data:')) {
          const uploaded = await uploadDataUrlToStorage(
            resolvedMain,
            `products/${updated.id}_main_${Date.now()}.jpg`
          );
          if (uploaded) resolvedMain = uploaded;
        }
        const resolvedGallery = await Promise.all(
          (updated.galleryImages || [resolvedMain]).map(async (gUrl, idx) => {
            if (gUrl.startsWith('data:')) {
              const up = await uploadDataUrlToStorage(
                gUrl,
                `products/${updated.id}_gal_${idx}_${Date.now()}.jpg`
              );
              return up || gUrl;
            }
            return gUrl;
          })
        );

        const syncedUpdated: Product = {
          ...updated,
          imageUrl: resolvedMain,
          galleryImages: resolvedGallery,
        };

        await setDoc(doc(db, 'products', syncedUpdated.id), mapProductToDb(syncedUpdated), {
          merge: true,
        });

        updateCatalogProduct(syncedUpdated);
        clearCatalogDirty();
        setProducts(getCatalogProducts());
        showToast('✓ Product changes synced to Firebase Cloud & Storage!');
      } catch (err) {
        console.warn('Firestore update warning:', err);
        showToast('❌ Could not sync product changes to Firestore.', 'error');
      } finally {
        setSavingProduct(false);
      }
    };

    await saveToCloud();
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
        showToast(`✓ "${prod.name}" deleted from Storefront & Catalog!`);

        const deleteFromCloud = async () => {
          try {
            const batch = writeBatch(db);
            batch.delete(doc(db, 'products', prod.id));
            batch.set(doc(db, 'settings', 'catalog'), {
              initialized: true,
              deletedIds: getDeletedProductIds(),
              updatedAt: new Date().toISOString(),
            });
            await batch.commit();
            clearCatalogDirty();
            showToast(`✓ "${prod.name}" deleted from Firestore Cloud!`);
          } catch (err) {
            console.warn('Firestore delete warning:', err);
          }
        };

        await deleteFromCloud();
      },
    });
  };

  const handleClearAllProducts = () => {
    setConfirmDialog({
      title: 'ഡെമോ ഉൽപ്പന്നങ്ങൾ എല്ലാം ഒഴിവാക്കുക? (Clear All Products)',
      message: 'നിലവിലുള്ള എല്ലാ ഡെമോ ഉൽപ്പന്നങ്ങളും ഫോട്ടോകളും കാറ്റലോഗിൽ നിന്നും സ്റ്റോർഫ്രണ്ടിൽ നിന്നും പൂർണ്ണമായി ഒഴിവാക്കണോ? പുതിയ ഉൽപ്പന്നങ്ങൾ നിങ്ങൾക്ക് തനിയെ ചേർക്കാവുന്നതാണ്.',
      confirmLabel: '🗑️ Clear All Products',
      danger: true,
      onConfirm: async () => {
        const next = clearAllCatalogProducts();
        setProducts(next);
        setConfirmDialog(null);
        showToast('✓ All demo products & photos removed! Ready for your products.');

        const deleteFromCloud = async () => {
          try {
            const batch = writeBatch(db);
            ['1', '2', '3', '4'].forEach(id => batch.delete(doc(db, 'products', id)));
            batch.set(doc(db, 'settings', 'catalog'), {
              initialized: true,
              deletedIds: getDeletedProductIds(),
              updatedAt: new Date().toISOString(),
            });
            await batch.commit();
            clearCatalogDirty();
            showToast('✓ Firestore Cloud catalog cleared!');
          } catch (err) {
            console.warn('Firestore clear error:', err);
          }
        };

        await deleteFromCloud();
      },
    });
  };

  const updateOrderStatus = async (orderId: string, docId: string | null, newStatus: 'confirmed' | 'rejected' | 'cancelled') => {
    setUpdatingOrderKey(orderId);
    try {
      const docIds = await resolveBookingDocIds(orderId, docId);
      if (docIds.length === 0) {
        showToast(
          `❌ Order #${orderId} was not found in Firestore.`,
          'error'
        );
        return;
      }

      await Promise.all(
        docIds.map(id => updateDoc(doc(db, 'bookings', id), { status: newStatus }))
      );

      try {
        const saleRef = doc(db, 'promoter_sales', orderId);
        const saleSnap = await getDoc(saleRef);
        if (saleSnap.exists()) {
          await updateDoc(saleRef, { status: newStatus });
        }
      } catch {
        // ignore if not a referral order
      }

      const nextOrders = orders.map(o =>
        o.orderId === orderId || o.id === orderId || (docId && o.id === docId)
          ? { ...o, docId: docIds[0], status: newStatus }
          : o
      );
      setOrders(nextOrders);
      saveAllOrders(nextOrders);
      showToast(
        `✓ Order #${orderId} ${newStatus === 'confirmed' ? 'APPROVED' : newStatus.toUpperCase()} & synced live to Customer!`
      );
    } catch {
      showToast(`❌ Failed to update Order #${orderId} in Firestore. Please try again.`, 'error');
    } finally {
      setUpdatingOrderKey(null);
    }
  };

  const requestDeleteOrder = (order: any) => {
    const targetId = String(order.orderId || order.id);
    setConfirmDialog({
      title: 'Delete Order Record?',
      message: `Remove Order #${targetId} (${order.customerName || 'Customer'}) permanently from Admin & Customer Orders?`,
      confirmLabel: '🗑️ Delete Order',
      danger: true,
      onConfirm: async () => {
        try {
          const docIds = await resolveBookingDocIds(order.orderId, order.docId || order.id);
          await Promise.all(docIds.map(id => deleteDoc(doc(db, 'bookings', id))));
          if (order.orderId) {
            try {
              await deleteDoc(doc(db, 'promoter_sales', String(order.orderId)));
            } catch {
              // ignore if no sale doc
            }
          }
          const nextOrders = deleteOrderLocally(targetId, order.id ? String(order.id) : undefined);
          setOrders(nextOrders);
          setConfirmDialog(null);
          showToast(`✓ Order #${targetId} deleted permanently!`);
        } catch {
          setConfirmDialog(null);
          showToast('❌ Could not delete order from Firestore.', 'error');
        }
      },
    });
  };

  const handleSaveOrderTracking = async (order: any) => {
    const orderKey = String(order.orderId || order.id);
    const draft = trackingDrafts[orderKey] || {
      trackingId: order.trackingId || '',
      trackingUrl: order.trackingUrl || '',
      courierName: order.courierName || '',
    };
    const cleanTrackingId = (draft.trackingId || '').trim().slice(0, 120);
    const cleanTrackingUrl = (draft.trackingUrl || '').trim().slice(0, 500);
    const cleanCourierName = (draft.courierName || '').trim().slice(0, 100);

    if (!cleanTrackingId) {
      showToast('Please enter a Tracking ID before saving.', 'error');
      return;
    }

    setUpdatingOrderKey(orderKey);
    try {
      const cleanOrderId = String(order.orderId || order.id || '').trim();
      const docIds = await resolveBookingDocIds(cleanOrderId, order.docId || order.id);
      if (docIds.length === 0) {
        showToast(`❌ Order #${orderKey} not found in Firestore.`, 'error');
        return;
      }

      await Promise.all(
        docIds.map(id =>
          updateDoc(doc(db, 'bookings', id), {
            trackingId: cleanTrackingId,
            trackingUrl: cleanTrackingUrl || '',
            courierName: cleanCourierName || '',
          })
        )
      );

      if (cleanOrderId) {
        try {
          const saleRef = doc(db, 'promoter_sales', cleanOrderId);
          const saleSnap = await getDoc(saleRef);
          if (saleSnap.exists()) {
            await updateDoc(saleRef, {
              trackingId: cleanTrackingId,
              courierName: cleanCourierName || '',
            });
          }
        } catch {
          // ignore if not a referral order
        }
      }

      const nextOrders = orders.map(o =>
        o.orderId === order.orderId || o.id === order.id
          ? {
              ...o,
              docId: docIds[0],
              trackingId: cleanTrackingId,
              trackingUrl: cleanTrackingUrl || undefined,
              courierName: cleanCourierName || undefined,
            }
          : o
      );
      setOrders(nextOrders);
      saveAllOrders(nextOrders);
      showToast(`✓ Tracking ID "${cleanTrackingId}" synced live to Customer & Promoter!`);
    } catch {
      showToast('❌ Tracking ID failed to save in Firestore.', 'error');
    } finally {
      setUpdatingOrderKey(null);
    }
  };

  const updateOrderDeliveryStage = async (order: any, stage: 'shipped' | 'delivered') => {
    const orderKey = String(order.orderId || order.id);
    const cleanOrderId = String(order.orderId || order.id || '').trim();
    const nowIso = new Date().toISOString();
    const draft = trackingDrafts[orderKey];
    const cleanCourierName = ((draft?.courierName ?? order.courierName) || '').trim().slice(0, 100);
    const cleanTrackingId = ((draft?.trackingId ?? order.trackingId) || '').trim().slice(0, 120);
    const nextDispatchedAt = order.dispatchedAt || nowIso;
    const nextDeliveredAt = stage === 'delivered' ? nowIso : '';

    const applyLocalDeliveryPatch = (resolvedDocId?: string) => {
      const nextOrders = orders.map(o =>
        o.orderId === order.orderId || o.id === order.id || (order.docId && o.docId === order.docId)
          ? {
              ...o,
              ...(resolvedDocId ? { docId: resolvedDocId } : {}),
              deliveryStatus: stage,
              dispatchedAt: nextDispatchedAt,
              deliveredAt: nextDeliveredAt || undefined,
              ...(cleanCourierName ? { courierName: cleanCourierName } : {}),
              ...(cleanTrackingId ? { trackingId: cleanTrackingId } : {}),
            }
          : o
      );
      setOrders(nextOrders);
      saveAllOrders(nextOrders);
    };

    applyLocalDeliveryPatch();

    setUpdatingOrderKey(orderKey);
    try {
      const docIds = await resolveBookingDocIds(cleanOrderId, order.docId || order.id);
      if (docIds.length === 0) {
        showToast(`⚠️ Updated locally, but Order #${orderKey} was not found in Firestore.`, 'error');
        return;
      }

      const bookingPatch: Record<string, any> = {
        deliveryStatus: stage,
        dispatchedAt: nextDispatchedAt,
        deliveredAt: stage === 'delivered' ? nextDeliveredAt : '',
      };
      if (cleanCourierName) bookingPatch.courierName = cleanCourierName;
      if (cleanTrackingId) bookingPatch.trackingId = cleanTrackingId;

      await Promise.all(docIds.map(id => updateDoc(doc(db, 'bookings', id), bookingPatch)));

      const refCode = String(order.referralCode || order.promoterId || '').trim().toUpperCase();
      if (cleanOrderId && (refCode || order.promoterUserId)) {
        try {
          const saleRef = doc(db, 'promoter_sales', cleanOrderId);
          const saleSnap = await getDoc(saleRef);
          if (saleSnap.exists()) {
            await updateDoc(saleRef, {
              deliveryStatus: stage,
              dispatchedAt: nextDispatchedAt,
              deliveredAt: stage === 'delivered' ? nextDeliveredAt : '',
              ...(cleanCourierName ? { courierName: cleanCourierName } : {}),
              ...(cleanTrackingId ? { trackingId: cleanTrackingId } : {}),
            });
          } else if (refCode && order.userId && order.productId) {
            const promRecord = promotersMap[refCode];
            await setDoc(saleRef, {
              orderId: cleanOrderId.slice(0, 64),
              bookingDocId: String(docIds[0] || '').slice(0, 128),
              buyerUserId: String(order.userId).slice(0, 128),
              promoterId: refCode.slice(0, 64),
              promoterUserId: String(order.promoterUserId || promRecord?.userId || '').slice(0, 128),
              promoterEmail: String(order.promoterEmail || promRecord?.email || '').slice(0, 200),
              productId: String(order.productId).slice(0, 128),
              productName: String(order.productName || 'Amal Coolguard Vest').slice(0, 200),
              price: Number(order.price || 0),
              commission: Number(order.promoterCommission ?? promRecord?.commissionPerSale ?? 100),
              status: order.status || 'pending_verification',
              deliveryStatus: stage,
              dispatchedAt: nextDispatchedAt,
              deliveredAt: stage === 'delivered' ? nextDeliveredAt : '',
              ...(cleanCourierName ? { courierName: cleanCourierName } : {}),
              ...(cleanTrackingId ? { trackingId: cleanTrackingId } : {}),
              createdAt: serverTimestamp(),
            });
          }
        } catch (saleErr) {
          console.warn('Promoter sale delivery sync warning:', saleErr);
        }
      }

      applyLocalDeliveryPatch(docIds[0]);
      showToast(
        stage === 'shipped'
          ? `✓ Order #${orderKey}: Courier Dispatched (കൊറിയർ അയച്ചു) — Customer & Promoter profiles updated!`
          : `✓ Order #${orderKey}: Marked Delivered (ഡെലിവറി ചെയ്തു) — Customer & Promoter profiles updated!`
      );
    } catch {
      showToast('❌ Cloud delivery sync error.', 'error');
    } finally {
      setUpdatingOrderKey(null);
    }
  };

  const handleSaveOrderDeliveryDays = async (order: any) => {
    const orderKey = String(order.orderId || order.id);
    const cleanDays = (
      deliveryDaysDrafts[orderKey] ??
      order.estimatedDeliveryDays ??
      paymentSettings.defaultDeliveryDays ??
      ''
    )
      .trim()
      .slice(0, 100);

    if (!cleanDays) {
      showToast('Please enter estimated delivery days (e.g. 3-5 Days).', 'error');
      return;
    }

    setUpdatingOrderKey(orderKey);
    try {
      const cleanOrderId = String(order.orderId || order.id || '').trim();
      const docIds = await resolveBookingDocIds(cleanOrderId, order.docId || order.id);
      if (docIds.length === 0) {
        showToast(`❌ Order #${orderKey} not found in Firestore.`, 'error');
        return;
      }

      await Promise.all(
        docIds.map(id => updateDoc(doc(db, 'bookings', id), { estimatedDeliveryDays: cleanDays }))
      );

      const nextOrders = orders.map(o =>
        o.orderId === order.orderId || o.id === order.id
          ? { ...o, docId: docIds[0], estimatedDeliveryDays: cleanDays }
          : o
      );
      setOrders(nextOrders);
      saveAllOrders(nextOrders);
      showToast(`✓ Delivery time "${cleanDays}" synced live to Customer!`);
    } catch {
      showToast('❌ Could not sync delivery ETA.', 'error');
    } finally {
      setUpdatingOrderKey(null);
    }
  };

  const handleCopyAddressForWhatsApp = (order: any) => {
    const pickupBlock = paymentSettings.pickupAddress
      ? `\nFROM (PICKUP): ${paymentSettings.pickupName || 'Amal Coolguard'}, ${paymentSettings.pickupAddress}${
          paymentSettings.pickupPincode ? ` - ${paymentSettings.pickupPincode}` : ''
        } (Ph: ${paymentSettings.pickupPhone || paymentSettings.whatsappNumber || '6238113451'})`
      : '';
    const gstLine =
      Number(order.gstPercent || 0) > 0
        ? ` | GST ${order.gstPercent}% (₹${order.gstAmount || 0})${
            order.gstNumber || paymentSettings.gstNumber ? ` GSTIN: ${order.gstNumber || paymentSettings.gstNumber}` : ''
          }`
        : '';

    const text = `📦 AMAL COOLGUARD COURIER ADDRESS
Order ID: #${order.orderId || order.id}
----------------------------------------
TO NAME: ${order.customerName || 'N/A'}
PHONE: ${order.phoneNumber || 'N/A'}
ADDRESS: ${order.address || 'N/A'}
PINCODE: ${order.pincode || 'N/A'}${pickupBlock}

ITEM: ${order.productName || 'Amal Coolguard Vest'}
AMOUNT: ₹${order.price || 2499} (${order.paymentMethod || 'UPI'})${gstLine}${
      order.estimatedDeliveryDays ? `\nEST. DELIVERY: ${order.estimatedDeliveryDays}` : ''
    }${order.trackingId ? `\nTRACKING ID: ${order.trackingId}` : ''}`;

    navigator.clipboard.writeText(text);
    showToast('✓ Customer + Pickup address & bill details copied for WhatsApp!');
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
        const batch = writeBatch(db);
        batch.update(doc(db, 'promoters', promId), { commissionPerSale: amt });
        if (dict[promId].userId) {
          batch.set(doc(db, 'promoter_refs', promId), {
            id: promId,
            promoterUserId: String(dict[promId].userId),
            commissionPerSale: amt,
          });
        }
        await batch.commit();
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
            await updateDoc(doc(db, 'promoters', prom.id), { paidAmount: updatedPaid });
          } catch (err) {
            console.warn('Firestore promoter payout sync err:', err);
          }
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
          const batch = writeBatch(db);
          batch.delete(doc(db, 'promoters', prom.id));
          batch.delete(doc(db, 'promoter_refs', prom.id));
          await batch.commit();
        } catch (err) {
          console.warn('Firestore delete promoter err:', err);
        }
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
        <div className="flex items-center gap-2 flex-wrap">
          <ThemeSwitcher />
          <span className="bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold px-2.5 py-1.5 rounded-xl">
            ✓ Admin Active
          </span>
          <button
            onClick={() => {
              fetchProducts();
              fetchOrders();
              fetchPaymentSettings();
              fetchPromoters();
              fetchCategories();
              showToast('✓ Storefront data synced!');
            }}
            className="bg-slate-800 hover:bg-slate-700 text-xs font-bold px-3 py-2 rounded-xl text-slate-200 border border-slate-700"
          >
            🔄 Sync Data
          </button>
          <a href="/" className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow">
            🏠 Visit Storefront
          </a>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('amal_admin_auth');
              navigate('/admin');
            }}
            className="bg-red-900/80 hover:bg-red-800 text-white text-xs font-bold px-3 py-2 rounded-xl border border-red-700/60 shadow"
          >
            🚪 Logout
          </button>
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
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold text-sm text-gray-900">Customer Bookings & Payment Screenshots</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPickupQuickModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl shadow flex items-center gap-1.5 transition"
              >
                <span>📍</span>
                <span>{paymentSettings.pickupAddress ? 'Edit Pickup Address & GSTIN' : '+ Add Pickup Address & GSTIN'}</span>
              </button>
              <button onClick={fetchOrders} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                <span>🔄</span> Refresh List
              </button>
            </div>
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
                    <div className="flex items-center justify-between gap-2 border-b pb-3 mb-3 flex-wrap">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Order ID</span>
                        <p className="font-extrabold text-sm text-gray-900">{order.orderId || order.id}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {order.deliveryStatus === 'delivered' ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase bg-emerald-600 text-white">
                            📦 DELIVERED
                          </span>
                        ) : order.deliveryStatus === 'shipped' ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase bg-sky-600 text-white">
                            🚚 COURIER DISPATCHED
                          </span>
                        ) : null}
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
                    </div>

                    {/* Customer & Product Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 mb-3">
                      <div className="bg-gray-50 p-2.5 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Customer Name</p>
                        <p className="font-extrabold text-gray-900">{order.customerName || 'N/A'}</p>
                        {order.userEmail && (
                          <p className="text-[10px] font-bold text-blue-700 truncate">✉️ {order.userEmail}</p>
                        )}
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
                      <div className="bg-gray-50 p-2.5 rounded-xl flex items-center gap-2.5">
                        {(() => {
                          const oKey = String(order.orderId || order.id);
                          const thumb = resolveOrderProductImage(order, products);
                          return (
                            <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                              {thumb && !brokenAdminOrderThumbs[oKey] ? (
                                <img
                                  src={thumb}
                                  alt={order.productName || 'Product'}
                                  onError={() =>
                                    setBrokenAdminOrderThumbs(prev => ({ ...prev, [oKey]: true }))
                                  }
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-base text-gray-400">📦</span>
                              )}
                            </div>
                          );
                        })()}
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 font-bold uppercase">Product Booked</p>
                          <p className="font-bold text-gray-900 truncate">{order.productName || 'Amal Coolguard Vest'}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Amount & Payment Mode</p>
                        <p className="font-extrabold text-blue-700 text-sm">
                          ₹{order.price} ({order.paymentMethod || 'UPI'})
                        </p>
                        <p className="text-[10px] text-gray-500 font-semibold">
                          Item ₹{order.productPrice || (Number(order.price) - Number(order.deliveryCharge || 0) - Number(order.gstAmount || 0))}
                          {Number(order.gstPercent || 0) > 0 ? ` + ${order.gstPercent}% GST (₹${order.gstAmount || 0})` : ''}
                          {Number(order.deliveryCharge || 0) > 0 ? ` + Del ₹${order.deliveryCharge}` : ' • Free Del'}
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

                    {/* Estimated Delivery Days Control (Admin calculates distance & applies days for customer) */}
                    {(() => {
                      const orderKey = String(order.orderId || order.id);
                      const daysDraft =
                        deliveryDaysDrafts[orderKey] ??
                        order.estimatedDeliveryDays ??
                        paymentSettings.defaultDeliveryDays ??
                        '';
                      return (
                        <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-2xl space-y-2 mb-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                              <span>⏱️</span> Delivery Time (എത്ര ദിവസം കൊണ്ട് എത്തും):
                            </span>
                            {order.estimatedDeliveryDays && (
                              <span className="text-[10px] bg-emerald-600 text-white font-bold px-2.5 py-0.5 rounded-full">
                                Active: {order.estimatedDeliveryDays}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 text-xs">
                            <input
                              type="text"
                              placeholder="e.g. 3-5 Days / 2 Days"
                              value={daysDraft}
                              onChange={e =>
                                setDeliveryDaysDrafts(prev => ({ ...prev, [orderKey]: e.target.value }))
                              }
                              className="flex-1 p-2.5 border border-emerald-300 rounded-xl bg-white outline-none font-bold text-gray-900"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveOrderDeliveryDays(order)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow shrink-0 transition"
                            >
                              ✓ Apply ETA
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Courier & Delivery 2-Step Action Box (Dispatched to Courier vs Delivered to Customer) */}
                    {(() => {
                      const orderKey = String(order.orderId || order.id);
                      const isShipped = order.deliveryStatus === 'shipped';
                      const isDelivered = order.deliveryStatus === 'delivered';
                      const isUpdating = updatingOrderKey === orderKey;
                      return (
                        <div className="bg-sky-50/80 border border-sky-200 p-3.5 rounded-2xl space-y-2.5 mb-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-sky-950 flex items-center gap-1.5">
                              <span>📦</span> Courier &amp; Delivery Status (കൊറിയർ &amp; ഡെലിവറി):
                            </span>
                            <span
                              className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                                isDelivered
                                  ? 'bg-emerald-600 text-white'
                                  : isShipped
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-white text-slate-600 border border-slate-300'
                              }`}
                            >
                              {isDelivered
                                ? '✓ Delivered'
                                : isShipped
                                ? '🚚 Sent via Courier'
                                : 'Awaiting Courier'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => updateOrderDeliveryStage(order, 'shipped')}
                              className={`py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 border transition shadow-xs disabled:opacity-50 ${
                                isShipped
                                  ? 'bg-sky-600 text-white border-sky-700 ring-2 ring-sky-300'
                                  : isDelivered
                                  ? 'bg-sky-100 text-sky-900 border-sky-300 hover:bg-sky-200'
                                  : 'bg-white hover:bg-sky-600 hover:text-white text-sky-900 border-sky-300'
                              }`}
                            >
                              <span>🚚</span>
                              <span>
                                {isShipped
                                  ? '✓ Courier Dispatched'
                                  : 'Courier Dispatched (കൊറിയർ അയച്ചു)'}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => updateOrderDeliveryStage(order, 'delivered')}
                              className={`py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 border transition shadow-xs disabled:opacity-50 ${
                                isDelivered
                                  ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300'
                                  : 'bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border-emerald-300'
                              }`}
                            >
                              <span>📦</span>
                              <span>
                                {isDelivered
                                  ? '✓ Delivered to Customer'
                                  : 'Delivered (ഡെലിവറി ചെയ്തു)'}
                              </span>
                            </button>
                          </div>

                          {(order.dispatchedAt || order.deliveredAt) && (
                            <p className="text-[10px] text-sky-900 font-semibold flex flex-wrap gap-x-3 gap-y-0.5">
                              {order.dispatchedAt && (
                                <span>
                                  🚚 Dispatched: {new Date(order.dispatchedAt).toLocaleDateString()}
                                </span>
                              )}
                              {order.deliveredAt && (
                                <span>
                                  📦 Delivered: {new Date(order.deliveredAt).toLocaleDateString()}
                                </span>
                              )}
                            </p>
                          )}
                          <p className="text-[10px] text-sky-700">
                            Customer Profile, My Orders &amp; Promoter Profile update automatically.
                          </p>
                        </div>
                      );
                    })()}

                    {/* Order Tracking ID Assignment Box (Sends directly to Customer's Orders Page) */}
                    {(() => {
                      const orderKey = String(order.orderId || order.id);
                      const draft = trackingDrafts[orderKey] || {
                        trackingId: order.trackingId || '',
                        trackingUrl: order.trackingUrl || '',
                        courierName: order.courierName || '',
                      };
                      const updateDraft = (patch: Partial<typeof draft>) => {
                        setTrackingDrafts(prev => ({
                          ...prev,
                          [orderKey]: { ...draft, ...patch },
                        }));
                      };
                      const browserTrackUrl =
                        (order.trackingUrl || '').trim() ||
                        (order.trackingId
                          ? `https://www.google.com/search?q=${encodeURIComponent(order.trackingId + ' tracking')}`
                          : '');

                      return (
                        <div className="bg-blue-50/80 border border-blue-200 p-3.5 rounded-2xl space-y-2.5 mb-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-blue-950 flex items-center gap-1.5">
                              <span>🚚</span> Order Tracking ID (കസ്റ്റമർ ട്രാക്കിംഗ് ഐഡി):
                            </span>
                            {order.trackingId ? (
                              <a
                                href={browserTrackUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] bg-blue-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-blue-700"
                              >
                                🌐 Saved: {order.trackingId} ↗
                              </a>
                            ) : (
                              <span className="text-[10px] text-blue-700 font-semibold">
                                Saved ID auto-appears in customer&apos;s Orders page
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <input
                              type="text"
                              placeholder="Enter Tracking ID (e.g. DTDC884512)"
                              value={draft.trackingId}
                              onChange={e => updateDraft({ trackingId: e.target.value })}
                              className="w-full p-2.5 border border-blue-300 rounded-xl bg-white outline-none font-mono font-bold text-gray-900"
                            />
                            <input
                              type="text"
                              placeholder="Courier Name (Optional e.g. DTDC / Speed Post)"
                              value={draft.courierName}
                              onChange={e => updateDraft({ courierName: e.target.value })}
                              className="w-full p-2.5 border border-blue-200 rounded-xl bg-white outline-none font-semibold text-gray-800"
                            />
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2 text-xs">
                            <input
                              type="url"
                              placeholder="Custom Tracking URL (Optional - blank opens Google search on customer phone)"
                              value={draft.trackingUrl}
                              onChange={e => updateDraft({ trackingUrl: e.target.value })}
                              className="flex-1 p-2.5 border border-blue-200 rounded-xl bg-white outline-none text-[11px] text-gray-700"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveOrderTracking(order)}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow shrink-0 transition"
                            >
                              💾 Save Tracking ID
                            </button>
                          </div>
                        </div>
                      );
                    })()}

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
                        onClick={() => updateOrderStatus(order.orderId || order.id, order.docId || order.id, 'confirmed')}
                        disabled={order.status === 'confirmed' || updatingOrderKey === (order.orderId || order.id)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow disabled:opacity-40 transition"
                      >
                        {updatingOrderKey === (order.orderId || order.id) ? 'Syncing...' : '✓ Approve'}
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.orderId || order.id, order.docId || order.id, 'rejected')}
                        disabled={order.status === 'rejected' || updatingOrderKey === (order.orderId || order.id)}
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
              const email = String(o.userEmail || o.email || '').trim();
              const key = mob || email;
              if (key && !deletedMobiles.has(mob)) {
                const existing = customerMap.get(key);
                customerMap.set(key, {
                  name: o.customerName || (existing ? existing.name : 'Customer'),
                  mobile: mob || existing?.mobile || '',
                  email: email || existing?.email || '',
                  address: o.address || (existing ? existing.address : 'N/A'),
                  pincode: o.pincode || (existing ? existing.pincode : 'N/A'),
                  ordersCount: (existing?.ordersCount || 0) + 1,
                  lastOrderDate: o.createdAt || 'Recent Order',
                });
              }
            });

            const session = safeJsonParse<any>(localStorage.getItem('amal_customer_session'), null);
            if (session && (session.mobile || session.email) && !deletedMobiles.has(String(session.mobile || '').trim())) {
              const mob = String(session.mobile || '').trim();
              const key = mob || String(session.email || '').trim();
              if (key && !customerMap.has(key)) {
                customerMap.set(key, {
                  name: session.name,
                  mobile: mob,
                  email: session.email || '',
                  address: session.address || 'Current Logged-in Customer',
                  pincode: session.pincode || 'Kerala',
                  ordersCount: 0,
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
                  <div key={cust.mobile || cust.email} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-3">
                    <div className="flex items-start justify-between border-b pb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                          👤
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-sm text-gray-900 truncate">{cust.name}</h3>
                          {cust.mobile && <p className="text-xs text-blue-600 font-bold">📱 +91 {cust.mobile}</p>}
                          {cust.email && <p className="text-[11px] text-gray-600 font-bold truncate">✉️ {cust.email}</p>}
                          <span className="inline-block mt-0.5 text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                            📦 {cust.ordersCount || 0} {(cust.ordersCount || 0) === 1 ? 'Order' : 'Orders'}
                          </span>
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

      {/* TAB 3: PRODUCTS & CATEGORIES */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Dynamic Categories Manager */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                  <span>🗂️</span> Store Categories Manager (പുതിയ കാറ്റഗറികൾ ആഡ് ചെയ്യുക - Electronics, Electrical, Coats...)
                </h2>
                <p className="text-xs text-gray-500">
                  Add unlimited custom categories here. They appear on the top bar of the website & inside Search.
                </p>
              </div>
              <span className="text-[11px] bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full self-start sm:self-auto">
                {categories.length} Active Categories
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type category name e.g. Electronics, Electrical, Accessories..."
                value={newCategoryInput}
                onChange={e => setNewCategoryInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomCategory();
                  }
                }}
                className="flex-1 p-3 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-semibold"
              />
              <button
                type="button"
                onClick={handleAddCustomCategory}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl shadow shrink-0 transition"
              >
                + Add Category
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {categories.map(cat => (
                <div
                  key={cat}
                  className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-full"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomCategory(cat)}
                    className="text-red-500 hover:text-red-700 font-black text-xs ml-0.5"
                    title={`Remove ${cat}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {categories.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllCategories}
                  className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1 rounded-full transition ml-auto"
                  title="Clear all categories"
                >
                  🗑️ Clear All Categories (എല്ലാം ഒഴിവാക്കുക)
                </button>
              )}
            </div>
          </div>

          {/* Add Product Form */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
            <h2 className="text-base font-extrabold text-gray-900 mb-1 flex items-center gap-2">
              <span>➕</span> Add New Amal Coolguard Product (പ്രോഡക്റ്റ് ആഡ് ചെയ്യുക)
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Upload one or multiple product photos (automatically compressed for fast saving), choose category, offer price, and optional delivery charge.
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
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
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

                {/* Delivery Charge, GST Tax Rate %, & Estimated Delivery Days */}
                <div className="col-span-1 md:col-span-2 bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="font-bold text-emerald-950">
                          🚚 Delivery Charge ₹ (0 = Free):
                        </label>
                        <button
                          type="button"
                          onClick={() => setNewProduct(prev => ({ ...prev, deliveryCharge: 0 }))}
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                            (newProduct.deliveryCharge || 0) === 0
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-white text-emerald-700 border-emerald-300'
                          }`}
                        >
                          Free (₹0)
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0 for Free Delivery, or e.g. 60"
                        value={newProduct.deliveryCharge || ''}
                        onChange={e => setNewProduct({ ...newProduct, deliveryCharge: Math.max(0, Number(e.target.value || 0)) })}
                        className="w-full p-2.5 border border-emerald-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-extrabold text-emerald-900"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-emerald-950 mb-1">
                        ⏱️ Estimated Delivery Time (എത്ര ദിവസം):
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 3-5 Days"
                        value={newProduct.estimatedDeliveryDays}
                        onChange={e => setNewProduct({ ...newProduct, estimatedDeliveryDays: e.target.value })}
                        className="w-full p-2.5 border border-emerald-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-bold text-emerald-900"
                      />
                    </div>
                  </div>
                </div>

                {/* GST Percentage Quick Picker + Custom % Input */}
                <div className="col-span-1 md:col-span-2 bg-indigo-50 p-3.5 rounded-2xl border border-indigo-200 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="font-bold text-indigo-950">
                      🧾 GST Tax Rate % (ജിഎസ് ടി ശതമാനം - ഓട്ടോമാറ്റിക് ടോട്ടലിൽ കൂടും):
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPickupQuickModal(true)}
                      className="text-[11px] font-bold text-blue-700 hover:underline"
                    >
                      {paymentSettings.gstNumber ? `GSTIN: ${paymentSettings.gstNumber} (Edit)` : '+ Set Store GSTIN Number'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[0, 5, 12, 18, 28].map(rate => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setNewProduct(prev => ({ ...prev, gstPercent: rate }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition ${
                          (newProduct.gstPercent || 0) === rate
                            ? 'bg-blue-600 text-white border-blue-700 shadow'
                            : 'bg-white text-gray-800 border-gray-300'
                        }`}
                      >
                        {rate}% GST
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Custom %"
                        value={newProduct.gstPercent || ''}
                        onChange={e =>
                          setNewProduct({ ...newProduct, gstPercent: Math.max(0, Number(e.target.value || 0)) })
                        }
                        className="w-24 p-1.5 text-xs border border-indigo-300 rounded-xl bg-white font-bold outline-none"
                      />
                      <span className="text-xs font-bold text-indigo-900">%</span>
                    </div>
                  </div>
                </div>

                {/* Live Auto-Running Total Preview (Offer Price + GST + Delivery) */}
                {(() => {
                  const preview = calculateProductTotals(newProduct);
                  return (
                    <div className="col-span-1 md:col-span-2 bg-amber-50 p-3.5 rounded-2xl border border-amber-200 flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-[11px] font-bold text-amber-900 block">
                          Live Customer Total (ഓഫർ വില + {preview.gstPercent}% GST + ഡെലിവറി ചാർജ്):
                        </span>
                        <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                          <span className="text-xl font-black text-gray-900">
                            ₹{preview.finalTotal}
                          </span>
                          {preview.originalTotal > preview.finalTotal && (
                            <span className="text-sm text-gray-400 line-through font-bold">
                              ₹{preview.originalTotal}
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-emerald-700">
                            (Item ₹{preview.basePrice}
                            {preview.gstPercent > 0 ? ` + ${preview.gstPercent}% GST ₹${preview.gstAmount}` : ''}
                            {preview.deliveryFee > 0 ? ` + Del ₹${preview.deliveryFee}` : ' + Free Del'})
                          </span>
                        </div>
                      </div>
                      {preview.originalBase > preview.basePrice && (
                        <span className="bg-red-600 text-white text-xs font-extrabold px-3 py-1 rounded-full shadow">
                          {Math.round(((preview.originalBase - preview.basePrice) / preview.originalBase) * 100)}% SPECIAL DISCOUNT
                        </span>
                      )}
                    </div>
                  );
                })()}

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
                  <label className="block font-bold text-gray-700 mb-1">Store Pickup Dispatch Status</label>
                  <button
                    type="button"
                    onClick={() => setShowPickupQuickModal(true)}
                    className="w-full p-3 border border-blue-300 rounded-xl bg-blue-50 text-blue-900 font-bold text-left hover:bg-blue-100 transition"
                  >
                    📍 {paymentSettings.pickupAddress ? `Pickup: ${paymentSettings.pickupAddress}` : '+ Add Store Pickup Address'}
                  </button>
                </div>

                {/* Main Image Upload & Link */}
                <div className="col-span-1 md:col-span-2 bg-blue-50/60 p-4 rounded-2xl border border-blue-100 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="block font-bold text-blue-900">Main Product Image (Auto-Filtered 10–50 KB):</label>
                    {newProduct.imageUrl.startsWith('data:') && (
                      <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">
                        ✓ {estimateDataUrlKB(newProduct.imageUrl)} KB
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 block mb-1">Upload Photo File (Auto-sized 10–50 KB):</span>
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
                        placeholder="https://..."
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
                    Multiple Photos / Angle Gallery (Auto-Filtered 10–50 KB per photo):
                  </label>
                  <p className="text-[11px] text-purple-800">
                    Uploaded photos are automatically optimized to 10–50 KB for fast loading across mobile and desktop.
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-extrabold text-gray-900">
                  All Active Store Products ({products.length})
                </h2>
                <p className="text-xs text-gray-500">
                  Exact products shown to customers on Storefront, Promoter Links, and Checkout.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {products.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllProducts}
                    className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-xs self-start sm:self-auto"
                    title="Remove all products and photos"
                  >
                    <span>🗑️</span>
                    <span>Clear All Products (ഉൽപ്പന്നങ്ങൾ ഒഴിവാക്കുക)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => syncCatalogToCloud()}
                  disabled={syncingCloudCatalog}
                  className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-xs disabled:opacity-50 self-start sm:self-auto"
                >
                  <span>{syncingCloudCatalog ? '⏳' : '☁️'}</span>
                  <span>{syncingCloudCatalog ? 'Syncing to Cloud...' : 'Sync Catalog to Cloud'}</span>
                </button>
              </div>
            </div>

            {loadingProducts && products.length === 0 ? (
              <div className="p-8 bg-white rounded-2xl text-center text-xs text-gray-500">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="p-10 bg-white rounded-2xl text-center text-xs text-gray-500 border border-dashed border-gray-300 space-y-2">
                <div className="text-2xl mb-1">📦</div>
                <p className="font-bold text-gray-700">നിലവിൽ കാറ്റലോഗിൽ ഉൽപ്പന്നങ്ങളൊന്നുമില്ല (No products in catalog).</p>
                <p className="text-[11px] text-gray-500">ഡെമോ പരസ്യങ്ങളും ഫോട്ടോകളും പൂർണ്ണമായി നീക്കം ചെയ്തു. മുകളിലുള്ള ഫോമിൽ നിന്ന് നിങ്ങൾക്ക് പുതിയ പ്രോഡക്റ്റുകൾ ആഡ് ചെയ്യാം.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(p => {
                  const totals = calculateProductTotals(p);
                  return (
                  <div key={p.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="relative w-full h-44 bg-gray-100 rounded-xl overflow-hidden mb-2">
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          {p.category || 'Coats'}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-gray-900 leading-snug">{p.name}</h3>
                      <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                        <span className="font-extrabold text-blue-700 text-base">
                          ₹{totals.finalTotal}
                        </span>
                        {totals.originalTotal > totals.finalTotal && (
                          <span className="text-xs text-gray-400 line-through">
                            ₹{totals.originalTotal}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-emerald-700">
                          {totals.gstPercent > 0 ? `+${totals.gstPercent}% GST (₹${totals.gstAmount}) ` : ''}
                          {totals.deliveryFee > 0
                            ? `• Del ₹${totals.deliveryFee}`
                            : '• Free Delivery'}
                        </span>
                      </div>
                      {p.estimatedDeliveryDays && (
                        <p className="text-[10px] font-bold text-amber-700 mt-1">
                          ⏱️ Est. Delivery: {p.estimatedDeliveryDays}
                        </p>
                      )}
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
                );
                })}
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
                placeholder="https://amalcoolguard.in"
              />
              <p className="text-[11px] text-indigo-800">
                All shareable links will use this clean domain (e.g.{' '}
                <span className="font-mono font-bold">{cleanShareDomain}/?L01N</span>).
              </p>
            </div>

            {/* COD Toggle */}
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-gray-900">💵 Cash on Delivery (COD)</p>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      paymentSettings.enableCOD ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {paymentSettings.enableCOD ? 'ACTIVE ✓' : 'BLOCKED 🚫'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Toggle off to immediately block & hide Cash on Delivery from website checkout.</p>
              </div>
              <button
                type="button"
                onClick={() => togglePaymentGateway('enableCOD', 'Cash on Delivery (COD)')}
                className={`w-14 h-8 rounded-full p-1 transition duration-200 ease-in-out shrink-0 ${
                  paymentSettings.enableCOD ? 'bg-green-600' : 'bg-red-500'
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
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-gray-900">⚡ UPI Payment (GPay / PhonePe / Paytm)</p>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      paymentSettings.enableUPI ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {paymentSettings.enableUPI ? 'ACTIVE ✓' : 'BLOCKED 🚫'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Toggle off to immediately block & hide UPI payments from website checkout.</p>
              </div>
              <button
                type="button"
                onClick={() => togglePaymentGateway('enableUPI', 'UPI Payment')}
                className={`w-14 h-8 rounded-full p-1 transition duration-200 ease-in-out shrink-0 ${
                  paymentSettings.enableUPI ? 'bg-green-600' : 'bg-red-500'
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full shadow-md transform transition duration-200 ease-in-out ${
                    paymentSettings.enableUPI ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Card / NetBanking Toggle */}
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-gray-900">💳 Credit / Debit Card & NetBanking</p>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      paymentSettings.enableCard ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {paymentSettings.enableCard ? 'ACTIVE ✓' : 'BLOCKED 🚫'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Toggle off to immediately block & hide Card payments from website checkout.</p>
              </div>
              <button
                type="button"
                onClick={() => togglePaymentGateway('enableCard', 'Credit / Debit Card')}
                className={`w-14 h-8 rounded-full p-1 transition duration-200 ease-in-out shrink-0 ${
                  paymentSettings.enableCard ? 'bg-green-600' : 'bg-red-500'
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full shadow-md transform transition duration-200 ease-in-out ${
                    paymentSettings.enableCard ? 'translate-x-6' : 'translate-x-0'
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

            {/* Pickup Address, GSTIN Number & Default Delivery Days (Appears on all Bills & Shipping Labels) */}
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 space-y-3">
              <div>
                <p className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                  <span>📍</span> Store Pickup Address, GSTIN & Delivery Days (എല്ലാ ബില്ലിലും വരേണ്ട പിക്കപ്പ് അഡ്രസ്സ് & GST നമ്പർ)
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Automatically appears as Sender / Pickup Address on every Shipping Label & Bill.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block font-bold text-amber-900 mb-1">Store / Sender Name</label>
                  <input
                    type="text"
                    value={paymentSettings.pickupName || 'Amal Coolguard'}
                    onChange={e => setPaymentSettings({ ...paymentSettings, pickupName: e.target.value })}
                    className="w-full p-2.5 border border-amber-300 rounded-xl bg-white outline-none font-bold"
                    placeholder="Amal Coolguard"
                  />
                </div>
                <div>
                  <label className="block font-bold text-amber-900 mb-1">Pickup Mobile Number</label>
                  <input
                    type="tel"
                    value={paymentSettings.pickupPhone || ''}
                    onChange={e => setPaymentSettings({ ...paymentSettings, pickupPhone: e.target.value })}
                    className="w-full p-2.5 border border-amber-300 rounded-xl bg-white outline-none font-bold"
                    placeholder="e.g. 6238113451"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-bold text-amber-900 mb-1">Pickup Full Address (പിക്കപ്പ് അഡ്രസ്സ്)</label>
                <textarea
                  rows={2}
                  value={paymentSettings.pickupAddress || ''}
                  onChange={e => setPaymentSettings({ ...paymentSettings, pickupAddress: e.target.value })}
                  className="w-full p-2.5 border border-amber-300 rounded-xl bg-white outline-none"
                  placeholder="Shop/House Name, Street, Town, District, Kerala"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <label className="block font-bold text-amber-900 mb-1">Pickup Pincode</label>
                  <input
                    type="text"
                    value={paymentSettings.pickupPincode || ''}
                    onChange={e => setPaymentSettings({ ...paymentSettings, pickupPincode: e.target.value })}
                    className="w-full p-2.5 border border-amber-300 rounded-xl bg-white outline-none font-bold"
                    placeholder="e.g. 673001"
                  />
                </div>
                <div>
                  <label className="block font-bold text-amber-900 mb-1">Store GST Number (GSTIN)</label>
                  <input
                    type="text"
                    value={paymentSettings.gstNumber || ''}
                    onChange={e => setPaymentSettings({ ...paymentSettings, gstNumber: e.target.value.toUpperCase() })}
                    className="w-full p-2.5 border border-amber-300 rounded-xl bg-white outline-none font-mono uppercase font-bold"
                    placeholder="e.g. 32AAAAA0000A1Z5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-amber-900 mb-1">Default Delivery Days</label>
                  <input
                    type="text"
                    value={paymentSettings.defaultDeliveryDays || '3-5 Days'}
                    onChange={e => setPaymentSettings({ ...paymentSettings, defaultDeliveryDays: e.target.value })}
                    className="w-full p-2.5 border border-amber-300 rounded-xl bg-white outline-none font-bold"
                    placeholder="e.g. 3-5 Days"
                  />
                </div>
              </div>
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
                      const promLink = getPromoterShareLink(prom.id, cleanShareDomain);
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
                              {prom.email && (
                                <p className="text-[11px] font-bold text-blue-700 mt-0.5">
                                  ✉️ {prom.email}
                                </p>
                              )}
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
                    value={editingProduct.category || categories[0] || 'Coats'}
                    onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full p-2.5 border rounded-xl outline-none bg-gray-50 font-bold"
                  >
                    {Array.from(
                      new Set([...categories, editingProduct.category].filter(Boolean) as string[])
                    ).map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
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

              {/* Edit Delivery Charge & Estimated Delivery Days */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-emerald-950">🚚 Delivery Charge ₹</label>
                    <button
                      type="button"
                      onClick={() => setEditingProduct({ ...editingProduct, deliveryCharge: 0 })}
                      className="text-[10px] font-bold bg-white border border-emerald-300 text-emerald-800 px-2 py-0.5 rounded-md"
                    >
                      Free (₹0)
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 for Free Delivery"
                    value={editingProduct.deliveryCharge || ''}
                    onChange={e =>
                      setEditingProduct({
                        ...editingProduct,
                        deliveryCharge: Math.max(0, Number(e.target.value || 0)),
                      })
                    }
                    className="w-full p-2.5 border border-emerald-300 rounded-xl outline-none bg-white font-extrabold text-emerald-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-emerald-950 mb-1">⏱️ Estimated Delivery Days</label>
                  <input
                    type="text"
                    placeholder="e.g. 3-5 Days"
                    value={editingProduct.estimatedDeliveryDays || ''}
                    onChange={e =>
                      setEditingProduct({ ...editingProduct, estimatedDeliveryDays: e.target.value })
                    }
                    className="w-full p-2.5 border border-emerald-300 rounded-xl outline-none bg-white font-bold text-emerald-900"
                  />
                </div>
              </div>

              <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 space-y-2">
                <label className="block font-bold text-indigo-950">🧾 GST Tax Rate % (Auto-added to total)</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[0, 5, 12, 18, 28].map(rate => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setEditingProduct({ ...editingProduct, gstPercent: rate })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                        (editingProduct.gstPercent || 0) === rate
                          ? 'bg-blue-600 text-white border-blue-700'
                          : 'bg-white text-gray-800 border-gray-300'
                      }`}
                    >
                      {rate}%
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Custom %"
                    value={editingProduct.gstPercent || ''}
                    onChange={e =>
                      setEditingProduct({ ...editingProduct, gstPercent: Math.max(0, Number(e.target.value || 0)) })
                    }
                    className="w-20 p-1.5 text-xs border border-indigo-300 rounded-lg bg-white font-bold outline-none"
                  />
                </div>
              </div>

              {/* Edit Live Combined Preview (Item + GST + Delivery) */}
              {(() => {
                const ep = calculateProductTotals(editingProduct);
                return (
                  <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] font-bold text-amber-900">Combined Customer Price Preview:</span>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-gray-900">₹{ep.finalTotal}</span>
                      {ep.originalTotal > ep.finalTotal && (
                        <span className="text-xs text-gray-400 line-through font-bold">₹{ep.originalTotal}</span>
                      )}
                      <span className="text-[10px] font-bold text-emerald-700">
                        (Item ₹{ep.basePrice}
                        {ep.gstPercent > 0 ? ` + ${ep.gstPercent}% GST ₹${ep.gstAmount}` : ''}
                        {ep.deliveryFee > 0 ? ` + Del ₹${ep.deliveryFee}` : ' + Free Del'})
                      </span>
                    </div>
                  </div>
                );
              })()}

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

            <div className="print-label-sheet border-2 border-slate-900 p-5 rounded-2xl space-y-4 text-xs text-gray-900 bg-white">
              <div className="text-center border-b-2 border-dashed border-gray-300 pb-3">
                <h2 className="text-lg font-black uppercase tracking-wide">AMAL COOLGUARD VESTS</h2>
                <p className="text-[11px] font-bold text-gray-600">
                  COURIER SHIPPING LABEL • ORDER #{printLabelOrder.orderId || printLabelOrder.id}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between bg-gray-100 px-2 py-1 rounded">
                  <p className="text-[10px] font-black uppercase text-gray-700">
                    📍 FROM / PICKUP ADDRESS (SENDER)
                  </p>
                  {!paymentSettings.pickupAddress && (
                    <button
                      type="button"
                      onClick={() => {
                        setPrintLabelOrder(null);
                        setShowPickupQuickModal(true);
                      }}
                      className="text-[10px] font-extrabold text-blue-700 underline print:hidden"
                    >
                      + Add Pickup Address
                    </button>
                  )}
                </div>
                <p><span className="font-bold">FROM:</span> {paymentSettings.pickupName || 'Amal Coolguard'}</p>
                <p><span className="font-bold">PICKUP PHONE:</span> +91 {paymentSettings.pickupPhone || paymentSettings.whatsappNumber || '6238113451'}</p>
                {paymentSettings.pickupAddress ? (
                  <p>
                    <span className="font-bold">PICKUP ADDRESS:</span> {paymentSettings.pickupAddress}
                    {paymentSettings.pickupPincode ? `, Pincode: ${paymentSettings.pickupPincode}` : ''}
                  </p>
                ) : (
                  <p className="text-gray-500 italic">Pickup address not added yet.</p>
                )}
                {(printLabelOrder.gstNumber || paymentSettings.gstNumber) && (
                  <p><span className="font-bold">GSTIN:</span> {printLabelOrder.gstNumber || paymentSettings.gstNumber}</p>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded text-gray-700">
                  📦 SHIP TO / CUSTOMER DELIVERY ADDRESS
                </p>
                <p><span className="font-bold">CUSTOMER NAME:</span> {printLabelOrder.customerName || 'N/A'}</p>
                <p><span className="font-bold">PHONE:</span> +91 {printLabelOrder.phoneNumber || 'N/A'}</p>
                <p><span className="font-bold">ADDRESS:</span> {printLabelOrder.address || 'N/A'}</p>
                <p><span className="font-bold">PINCODE:</span> {printLabelOrder.pincode || 'N/A'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded text-gray-700">
                  🛒 ORDER & BILL BREAKDOWN
                </p>
                <p><span className="font-bold">ITEM:</span> {printLabelOrder.productName || 'Amal Coolguard Vest'}</p>
                {Number(printLabelOrder.gstPercent || 0) > 0 && (
                  <p>
                    <span className="font-bold">GST ({printLabelOrder.gstPercent}%):</span> ₹{printLabelOrder.gstAmount || 0}
                  </p>
                )}
                <p>
                  <span className="font-bold">DELIVERY CHARGE:</span>{' '}
                  {Number(printLabelOrder.deliveryCharge || 0) > 0 ? `₹${printLabelOrder.deliveryCharge}` : 'Free Delivery'}
                </p>
                <p>
                  <span className="font-bold">TOTAL AMOUNT:</span> ₹{printLabelOrder.price || 2499}
                </p>
                {printLabelOrder.estimatedDeliveryDays && (
                  <p><span className="font-bold">ESTIMATED DELIVERY:</span> {printLabelOrder.estimatedDeliveryDays}</p>
                )}
                {printLabelOrder.trackingId && (
                  <p>
                    <span className="font-bold">TRACKING ID:</span> {printLabelOrder.trackingId}{' '}
                    {printLabelOrder.courierName ? `(${printLabelOrder.courierName})` : ''}
                  </p>
                )}
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

      {/* QUICK PICKUP ADDRESS, GSTIN & DELIVERY DAYS MODAL */}
      {showPickupQuickModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[270] p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-gray-900">📍 Pickup Address, GSTIN & Delivery Days</h3>
              <button
                type="button"
                onClick={() => setShowPickupQuickModal(false)}
                className="text-gray-400 hover:text-gray-700 font-bold text-xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Store / Sender Name</label>
                <input
                  type="text"
                  value={paymentSettings.pickupName || 'Amal Coolguard'}
                  onChange={e => setPaymentSettings({ ...paymentSettings, pickupName: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 outline-none font-bold"
                  placeholder="Amal Coolguard"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Pickup Mobile Number *</label>
                <input
                  type="tel"
                  value={paymentSettings.pickupPhone || ''}
                  onChange={e => setPaymentSettings({ ...paymentSettings, pickupPhone: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 outline-none font-bold"
                  placeholder="e.g. 6238113451"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Complete Pickup Address *</label>
                <textarea
                  rows={3}
                  value={paymentSettings.pickupAddress || ''}
                  onChange={e => setPaymentSettings({ ...paymentSettings, pickupAddress: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 outline-none"
                  placeholder="Shop/House Name, Street, Town, District, State"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Pickup Pincode</label>
                  <input
                    type="text"
                    value={paymentSettings.pickupPincode || ''}
                    onChange={e => setPaymentSettings({ ...paymentSettings, pickupPincode: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 outline-none font-bold"
                    placeholder="673001"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Default Delivery Days</label>
                  <input
                    type="text"
                    value={paymentSettings.defaultDeliveryDays || '3-5 Days'}
                    onChange={e => setPaymentSettings({ ...paymentSettings, defaultDeliveryDays: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 outline-none font-bold"
                    placeholder="3-5 Days"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Store GST Number (GSTIN - Optional)</label>
                <input
                  type="text"
                  value={paymentSettings.gstNumber || ''}
                  onChange={e => setPaymentSettings({ ...paymentSettings, gstNumber: e.target.value.toUpperCase() })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 outline-none font-mono uppercase font-bold"
                  placeholder="e.g. 32AAAAA0000A1Z5"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={async () => {
                  await savePaymentSettings();
                  setShowPickupQuickModal(false);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl text-xs shadow"
              >
                💾 Save Pickup Address & GSTIN
              </button>
              <button
                type="button"
                onClick={() => setShowPickupQuickModal(false)}
                className="flex-1 bg-gray-200 text-gray-800 font-bold py-3 rounded-xl text-xs"
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
