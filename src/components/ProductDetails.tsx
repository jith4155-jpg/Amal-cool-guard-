import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, getDocFromServer, getDocs, collection, addDoc, updateDoc, setDoc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Product } from '../data/mockProducts';
import { ThemeSwitcher } from '../context/ThemeContext';
import { useLanguage, LanguageSelector } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
  getCatalogProducts,
  isProductDeleted,
  compressProductImageToRange,
  getActiveReferralCode,
  syncReferralFromUrl,
  getLocalOrders,
  saveAllOrders,
  restoreDeletedCustomerMobile,
  getPaymentSettings,
  savePaymentSettingsSync,
  StorePaymentSettings,
  calculateProductTotals,
  safeJsonParse,
} from '../utils/storeSync';

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();
  const { user, authReady, profile, updateUserProfile, recordLocalOrder, refreshMyOrders } = useAuth();

  const findProductFromCatalog = (targetId?: string): Product | null => {
    const catalog = getCatalogProducts();
    if (!targetId) return catalog[0] || null;
    if (isProductDeleted(targetId)) return null;
    return catalog.find(p => p.id === targetId) || null;
  };

  // Synchronous initial product state lookup from Admin-synced catalog
  const [product, setProduct] = useState<Product | null>(() => findProductFromCatalog(id));
  const [paymentSettings, setPaymentSettings] = useState<StorePaymentSettings>(() => getPaymentSettings());
  const [loading] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState<1 | 2 | 3>(1);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  const [submittedDocId, setSubmittedDocId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);

  // Interactive Reviews state
  const [reviewsList, setReviewsList] = useState<any[]>([
    { name: 'Rahul K.', location: 'Wayanad', rating: 5, comment: 'Very good for summer bike riding in Wayanad sun! Keeps heat away nicely.', date: '2 days ago' },
    { name: 'Anil Kumar', location: 'Kozhikode', rating: 5, comment: 'Super quality coat. Delivery was quick and payment on delivery worked smooth.', date: '1 week ago' }
  ]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [reviewerComment, setReviewerComment] = useState('');

  const resolveDefaultPaymentMethod = (settings: StorePaymentSettings): string => {
    if (settings.enableUPI !== false) return 'UPI';
    if (settings.enableCOD !== false) return 'COD';
    if (settings.enableCard !== false) return 'Card';
    return '';
  };

  // Customer order form state with auto-fill from logged in user profile
  const [formData, setFormData] = useState(() => {
    try {
      const initSettings = getPaymentSettings();
      const session = safeJsonParse<any>(localStorage.getItem('amal_customer_session'), null);
      return {
        customerName: profile?.name || user?.displayName || session?.name || '',
        phoneNumber: profile?.mobile || session?.mobile || '',
        address: profile?.address || session?.address || '',
        pincode: profile?.pincode || session?.pincode || '',
        paymentMethod: resolveDefaultPaymentMethod(initSettings),
        merchantUpiId: initSettings.merchantUpiId || 'amalcoolguard@upi',
        whatsappNumber: initSettings.whatsappNumber || '6238113451',
      };
    } catch {
      return {
        customerName: '',
        phoneNumber: '',
        address: '',
        pincode: '',
        paymentMethod: 'UPI',
        merchantUpiId: 'amalcoolguard@upi',
        whatsappNumber: '6238113451',
      };
    }
  });

  // Sync customer form fields when authenticated user profile loads
  useEffect(() => {
    if (!user) return;
    setFormData(prev => ({
      ...prev,
      customerName: prev.customerName || profile?.name || user.displayName || '',
      phoneNumber: prev.phoneNumber || profile?.mobile || '',
      address: prev.address || profile?.address || '',
      pincode: prev.pincode || profile?.pincode || '',
    }));
  }, [user, profile]);

  // If user just returned from /login?redirect=...openOrder=1, open the booking modal automatically
  useEffect(() => {
    if (authReady && user && searchParams.get('openOrder') === '1' && product) {
      setShowOrderModal(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('openOrder');
      setSearchParams(nextParams, { replace: true });
    }
  }, [authReady, user, product, searchParams, setSearchParams]);

  useEffect(() => {
    let isMounted = true;

    syncReferralFromUrl(false);

    const applySettings = (nextSettings: StorePaymentSettings) => {
      setPaymentSettings(nextSettings);
      setFormData(prev => {
        const isCurrentAllowed =
          (prev.paymentMethod === 'UPI' && nextSettings.enableUPI !== false) ||
          (prev.paymentMethod === 'COD' && nextSettings.enableCOD !== false) ||
          (prev.paymentMethod === 'Card' && nextSettings.enableCard !== false);

        return {
          ...prev,
          paymentMethod: isCurrentAllowed ? prev.paymentMethod : resolveDefaultPaymentMethod(nextSettings),
          merchantUpiId: nextSettings.merchantUpiId || prev.merchantUpiId,
          whatsappNumber: nextSettings.whatsappNumber || prev.whatsappNumber || '6238113451',
        };
      });
    };

    applySettings(getPaymentSettings());

    const handleSync = () => {
      if (isMounted) {
        setProduct(findProductFromCatalog(id));
        applySettings(getPaymentSettings());
      }
    };
    window.addEventListener('amal_store_updated', handleSync);
    window.addEventListener('storage', handleSync);

    const fetchRemoteSettings = async () => {
      try {
        const snap = await Promise.race([
          getDoc(doc(db, 'settings', 'payment')),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
        ]);
        if (snap.exists() && isMounted) {
          const remoteSettings = snap.data() as StorePaymentSettings;
          const synced = savePaymentSettingsSync(remoteSettings);
          applySettings(synced);
        }
      } catch {
        // Fallback silently to local settings
      }
    };

    let unsubscribeProduct: (() => void) | undefined;
    if (id) {
      if (isProductDeleted(id)) {
        setProduct(null);
      } else {
        unsubscribeProduct = onSnapshot(
          doc(db, 'products', id),
          docSnap => {
            if (!isMounted) return;
            if (docSnap.exists()) {
              const data = docSnap.data();
              setProduct({
                id: docSnap.id,
                name: data.name || 'Amal Coolguard Vest',
                price: Number(data.price) || 2499,
                discountPrice: Number(data.discountPrice || data.price) || 1999,
                description: data.description || 'Premium heat protection cooling vest for bike riders.',
                imageUrl: data.imageUrl || '',
                galleryImages:
                  Array.isArray(data.galleryImages) && data.galleryImages.length > 0
                    ? data.galleryImages
                    : data.imageUrl
                    ? [data.imageUrl]
                    : [],
                category: data.category || 'Coats',
                rating: Number(data.rating) || 4.8,
                reviewsCount: Number(data.reviewsCount) || 120,
                features: Array.isArray(data.features) ? data.features : ['Heat Reflective', 'UV Protection', 'Lightweight & Breathable'],
                stock: typeof data.stock === 'number' ? data.stock : undefined,
                gstPercent: typeof data.gstPercent === 'number' ? data.gstPercent : 0,
                deliveryCharge: typeof data.deliveryCharge === 'number' ? data.deliveryCharge : 0,
                estimatedDeliveryDays: typeof data.estimatedDeliveryDays === 'string' ? data.estimatedDeliveryDays : '',
              });
            } else {
              setProduct(findProductFromCatalog(id));
            }
          },
          () => {
            if (isMounted) setProduct(findProductFromCatalog(id));
          }
        );
      }
    }

    fetchRemoteSettings();

    const localRev = safeJsonParse<any[]>(localStorage.getItem(`amal_reviews_${id}`), []);
    if (localRev.length > 0) {
      setReviewsList(prev => [...localRev, ...prev]);
    }

    return () => {
      isMounted = false;
      if (unsubscribeProduct) unsubscribeProduct();
      window.removeEventListener('amal_store_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [id]);

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerComment.trim()) return;

    const newRev = {
      name: 'Verified Customer',
      location: 'Customer',
      rating: newRating,
      comment: reviewerComment.trim(),
      date: 'Just now'
    };

    const updated = [newRev, ...reviewsList];
    setReviewsList(updated);

    // Save to localStorage
    const stored = JSON.parse(localStorage.getItem(`amal_reviews_${id}`) || '[]');
    localStorage.setItem(`amal_reviews_${id}`, JSON.stringify([newRev, ...stored]));

    // Reset form
    setReviewerComment('');
    setShowReviewForm(false);
  };

  const triggerUpiPayment = (orderId: string, amount: number) => {
    const upiId = formData.merchantUpiId || 'amalcoolguard@upi';
    const note = `Order ${orderId} - ${product?.name || 'Amal Coolguard'}`;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('Amal Coolguard')}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
    window.location.href = upiUrl;
  };

  const handleScreenshotChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingScreenshot(true);
    try {
      const { dataUrl: result } = await compressProductImageToRange(file, 20, 180);
      setScreenshotPreview(result);

      if (submittedOrderId) {
        const currentOrders = getLocalOrders();
        const updated = currentOrders.map((o: any) =>
          o.orderId === submittedOrderId
            ? { ...o, screenshot: result, paymentScreenshot: result, status: 'pending_verification' }
            : o
        );
        saveAllOrders(updated);
      }

      let targetDocId = submittedDocId;
      if (!targetDocId && submittedOrderId && (auth.currentUser || user)) {
        const uid = (auth.currentUser || user)!.uid;
        try {
          const snap = await getDocs(
            query(collection(db, 'bookings'), where('userId', '==', uid), where('orderId', '==', submittedOrderId))
          );
          if (!snap.empty) targetDocId = snap.docs[0].id;
        } catch {
          // ignore
        }
      }

      if (targetDocId) {
        await updateDoc(doc(db, 'bookings', targetDocId), {
          paymentScreenshot: result.slice(0, 950000),
          status: 'pending_verification',
        });
        await refreshMyOrders();
      }
    } catch (err) {
      console.warn('Screenshot compression err:', err);
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    const currentUser = auth.currentUser || user;
    if (!currentUser) {
      setShowOrderModal(false);
      navigate(`/login?redirect=${encodeURIComponent(`/product/${product.id}?openOrder=1`)}`);
      return;
    }

    setSubmitting(true);

    // Generate sequential Order ID starting with 'A' + 6 digit counter (A000001, A000002...)
    let currentCounter = 1;
    try {
      const counterDoc = await getDocFromServer(doc(db, 'settings', 'order_counter')).catch(() =>
        getDoc(doc(db, 'settings', 'order_counter'))
      );
      if (counterDoc.exists()) {
        currentCounter = counterDoc.data().nextVal || 1;
      } else {
        const localVal = Number(localStorage.getItem('amal_order_sequence_counter') || '1');
        currentCounter = localVal;
      }
    } catch {
      currentCounter = Number(localStorage.getItem('amal_order_sequence_counter') || '1');
    }

    const orderId = 'A' + String(currentCounter).padStart(6, '0');
    const nextCounter = currentCounter + 1;
    localStorage.setItem('amal_order_sequence_counter', String(nextCounter));
    setDoc(doc(db, 'settings', 'order_counter'), { nextVal: nextCounter }).catch(err => console.warn('Counter sync err:', err));

    const totals = calculateProductTotals(product);
    const amount = totals.finalTotal;
    const estDelivery =
      (product.estimatedDeliveryDays || '').trim() ||
      (paymentSettings.defaultDeliveryDays || '').trim() ||
      '';

    // Only attribute promoter if user arrived via a referral link
    const activeRefCode = getActiveReferralCode();
    let commissionAmt = 100;
    let promoterUserId = '';
    let promoterEmail = '';
    if (activeRefCode) {
      try {
        const promotersList = safeJsonParse<Record<string, any>>(localStorage.getItem('amal_promoters_list'), {});
        let foundProm = promotersList[activeRefCode.toUpperCase()];
        if (!foundProm) {
          const promSnap = await getDoc(doc(db, 'promoters', activeRefCode.toUpperCase()));
          if (promSnap.exists()) {
            foundProm = promSnap.data();
          }
        }
        if (foundProm) {
          if (typeof foundProm.commissionPerSale === 'number') {
            commissionAmt = foundProm.commissionPerSale;
          }
          promoterUserId = foundProm.userId || '';
          promoterEmail = foundProm.email || '';
        }
      } catch {
        // fallback cleanly
      }
    }

    const cleanCustomerName = (formData.customerName || 'Customer').trim().slice(0, 120) || 'Customer';
    const cleanPhone = (formData.phoneNumber || '0000000000').trim().slice(0, 30) || '0000000000';
    const cleanAddress = (formData.address || '').trim().slice(0, 500);
    const cleanPincode = (formData.pincode || '').trim().slice(0, 20);
    const safeScreenshot =
      screenshotPreview && screenshotPreview.length <= 950000 ? screenshotPreview : null;
    const rawProductImg = product.imageUrl || (product.galleryImages && product.galleryImages[0]) || '';
    const safeProductImage = rawProductImg && rawProductImg.length <= 950000 ? rawProductImg : '';

    let createdDocId: string | null = null;
    try {
      const docRef = await addDoc(collection(db, 'bookings'), {
        orderId,
        userId: currentUser.uid,
        userEmail: (currentUser.email || '').slice(0, 200),
        userName: (currentUser.displayName || cleanCustomerName).slice(0, 120),
        userPhoto: (currentUser.photoURL || '').slice(0, 1000),
        productId: String(product.id).slice(0, 128),
        productName: (product.name || '').slice(0, 200),
        productImage: safeProductImage,
        productPrice: totals.basePrice,
        gstPercent: totals.gstPercent,
        gstAmount: totals.gstAmount,
        gstNumber: (paymentSettings.gstNumber || '').slice(0, 64),
        deliveryCharge: totals.deliveryFee,
        estimatedDeliveryDays: estDelivery.slice(0, 100),
        price: amount,
        customerName: cleanCustomerName,
        phoneNumber: cleanPhone,
        address: cleanAddress,
        pincode: cleanPincode,
        paymentMethod: (formData.paymentMethod || 'UPI').slice(0, 50),
        referralCode: activeRefCode ? activeRefCode.slice(0, 64) : null,
        promoterId: activeRefCode ? activeRefCode.slice(0, 64) : null,
        promoterUserId: activeRefCode ? promoterUserId.slice(0, 128) : '',
        promoterEmail: activeRefCode ? promoterEmail.slice(0, 200) : '',
        promoterCommission: activeRefCode ? commissionAmt : 0,
        status: 'pending_verification',
        paymentScreenshot: safeScreenshot,
        createdAt: serverTimestamp(),
      });
      createdDocId = docRef.id;
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'bookings');
      } catch {
        // Fallback saved locally cleanly while logging structured error
      }
    }

    // Write PII-free referral sale summary so the owning Promoter sees live cross-device order stats
    if (activeRefCode) {
      try {
        await setDoc(doc(db, 'promoter_sales', orderId), {
          orderId,
          bookingDocId: createdDocId || '',
          buyerUserId: currentUser.uid,
          promoterId: activeRefCode.toUpperCase(),
          promoterUserId,
          promoterEmail,
          productId: product.id,
          productName: product.name,
          price: amount,
          commission: commissionAmt,
          status: 'pending_verification',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Promoter sale summary sync err:', err);
      }
    }

    const newOrderRecord = {
      orderId,
      docId: createdDocId,
      id: createdDocId || orderId,
      userId: currentUser.uid,
      userEmail: currentUser.email || '',
      userName: currentUser.displayName || formData.customerName,
      userPhoto: currentUser.photoURL || '',
      productId: product.id,
      productName: product.name,
      productImage: rawProductImg,
      imageUrl: rawProductImg,
      productPrice: totals.basePrice,
      gstPercent: totals.gstPercent,
      gstAmount: totals.gstAmount,
      gstNumber: paymentSettings.gstNumber || '',
      deliveryCharge: totals.deliveryFee,
      estimatedDeliveryDays: estDelivery,
      price: amount,
      customerName: formData.customerName,
      phoneNumber: formData.phoneNumber,
      address: formData.address,
      pincode: formData.pincode,
      paymentMethod: formData.paymentMethod,
      referralCode: activeRefCode,
      promoterId: activeRefCode,
      promoterUserId: activeRefCode ? promoterUserId : '',
      promoterEmail: activeRefCode ? promoterEmail : '',
      promoterCommission: activeRefCode ? commissionAmt : 0,
      status: 'pending_verification',
      screenshot: screenshotPreview || null,
      paymentScreenshot: screenshotPreview || null,
      createdAt: new Date().toISOString(),
    };

    recordLocalOrder(newOrderRecord);

    if (formData.phoneNumber) {
      restoreDeletedCustomerMobile(formData.phoneNumber);
    }

    await updateUserProfile({
      name: formData.customerName,
      mobile: formData.phoneNumber,
      address: formData.address,
      pincode: formData.pincode,
    });

    await refreshMyOrders();

    setSubmitting(false);
    setSubmittedOrderId(orderId);
    setSubmittedDocId(createdDocId);

    if (formData.paymentMethod === 'UPI' && paymentSettings.enableUPI !== false) {
      setTimeout(() => {
        triggerUpiPayment(orderId, amount);
      }, 400);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading Amal Coolguard details...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 text-center flex flex-col items-center justify-center">
        <p className="text-red-500 font-bold mb-4">Product not found or removed by Admin</p>
        <Link to="/" className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold">Back to Shop</Link>
      </div>
    );
  }

  const imagesList =
    product.galleryImages && product.galleryImages.length > 0
      ? product.galleryImages
      : [product.imageUrl];
  const safeImgIndex = selectedImageIndex < imagesList.length ? selectedImageIndex : 0;

  const totals = calculateProductTotals(product);
  const itemBasePrice = totals.basePrice;
  const deliveryFee = totals.deliveryFee;
  const finalTotalPayable = totals.finalTotal;
  const estDeliveryText =
    (product.estimatedDeliveryDays || '').trim() ||
    (paymentSettings.defaultDeliveryDays || '').trim();

  const allowedPaymentMethods = [
    ...(paymentSettings.enableUPI !== false ? [{ id: 'UPI', label: '⚡ UPI / GPay' }] : []),
    ...(paymentSettings.enableCOD !== false ? [{ id: 'COD', label: '💵 Cash on Delivery' }] : []),
    ...(paymentSettings.enableCard !== false ? [{ id: 'Card', label: '💳 Card / NetBank' }] : []),
  ];

  const discountPercent = product.price && product.discountPrice
    ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-100 pb-32 lg:pb-20">
      {/* Clean Responsive Top Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="h-9 inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900 font-bold text-xs sm:text-sm px-2.5 rounded-lg hover:bg-gray-100 transition shrink-0 whitespace-nowrap"
          >
            <span>←</span>
            <span>Back</span>
          </button>

          <h1 className="font-bold text-gray-900 text-sm sm:text-base truncate flex-1 text-center">
            {product.name}
          </h1>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ThemeSwitcher compact />
            <LanguageSelector />
            <Link
              to="/"
              title="Storefront"
              className="w-9 h-9 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center text-gray-700 hover:bg-gray-100 transition shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Responsive Flipkart-Grade Product Detail Container */}
      <div className="max-w-6xl mx-auto sm:px-6 lg:px-8 pt-0 sm:pt-5">
        <div className="lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
          {/* Left Column: Image Gallery + Tap to Zoom */}
          <div className="lg:col-span-5 lg:sticky lg:top-20 bg-white sm:rounded-xl border-b sm:border border-gray-200 p-4 space-y-3">
            <div
              onClick={() => {
                setZoomScale(2);
                setIsZoomOpen(true);
              }}
              className="relative w-full aspect-square sm:aspect-[4/3] lg:aspect-square bg-gray-50 rounded-xl overflow-hidden cursor-zoom-in border border-gray-100 group"
            >
              <img
                src={imagesList[safeImgIndex]}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain sm:object-cover group-hover:scale-105 transition duration-300"
              />
              {discountPercent > 0 && (
                <span className="absolute top-3 left-3 bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-xs tabular-nums">
                  {discountPercent}% OFF
                </span>
              )}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setZoomScale(2);
                  setIsZoomOpen(true);
                }}
                className="absolute bottom-3 right-3 h-8 px-3 rounded-lg bg-white/95 border border-gray-200 text-gray-800 text-[11px] font-bold shadow-sm flex items-center gap-1.5 hover:bg-white transition"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                  <path d="M11 8v6M8 11h6" />
                </svg>
                <span>{t('tapToZoom')}</span>
              </button>
            </div>

            {/* Thumbnails Strip */}
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {imagesList.map((img, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 transition ${
                    safeImgIndex === idx
                      ? 'border-blue-600 ring-2 ring-blue-200'
                      : 'border-gray-200 opacity-75 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="thumb" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {/* Desktop Primary Purchase CTA right under gallery */}
            <div className="hidden lg:block pt-2">
              {!user && (
                <p className="text-[11px] font-semibold text-amber-700 mb-2 text-center">
                  {t('loginRequiredBook')}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    const redirectTarget = `/product/${product.id}?openOrder=1`;
                    navigate(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
                    return;
                  }
                  setShowOrderModal(true);
                }}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>
                  {user ? `${t('orderNow')} — ₹${finalTotalPayable}` : `Sign in with Gmail to Order — ₹${finalTotalPayable}`}
                </span>
              </button>
            </div>
          </div>

          {/* Right Column: Contiguous Product Information & Reviews */}
          <div className="lg:col-span-7 space-y-3 mt-2 sm:mt-4 lg:mt-0">
            <div className="bg-white sm:rounded-xl border-y sm:border border-gray-200 p-4 sm:p-6 space-y-4">
              {/* Unboxed Category + Rating Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  {product.category}
                </span>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <span className="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded tabular-nums">
                    {product.rating || 4.8} ★
                  </span>
                  <span className="tabular-nums">({reviewsList.length} reviews)</span>
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-snug">
                {product.name}
              </h2>

              {/* Price & Tax Breakdown Box */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-1.5">
                <div className="flex items-baseline gap-3 flex-wrap tabular-nums">
                  <span className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                    ₹{finalTotalPayable}
                  </span>
                  {totals.originalTotal > finalTotalPayable && (
                    <span className="text-sm sm:text-base text-gray-400 line-through">
                      ₹{totals.originalTotal}
                    </span>
                  )}
                  {discountPercent > 0 && (
                    <span className="text-xs font-bold text-emerald-700">
                      {discountPercent}% {t('specialDiscount')}
                    </span>
                  )}
                </div>

                <div className="text-xs font-semibold space-y-1 pt-0.5 tabular-nums">
                  <p className="text-gray-700">
                    Item ₹{itemBasePrice}
                    {totals.gstPercent > 0 && ` + ${totals.gstPercent}% GST (₹${totals.gstAmount})`}
                    {deliveryFee > 0 ? ` + Delivery ₹${deliveryFee}` : ` · ${t('freeDelivery')}`}
                    {` = ₹${finalTotalPayable}`}
                  </p>
                  {paymentSettings.gstNumber && (
                    <p className="text-[11px] text-amber-700 font-mono">
                      GSTIN: {paymentSettings.gstNumber}
                    </p>
                  )}
                  {estDeliveryText && (
                    <p className="text-xs font-bold text-emerald-700">
                      Estimated Delivery: {estDeliveryText}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                {product.description}
              </p>

              {/* Key Features */}
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2.5">
                  Product Highlights
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(product.features || ['Heat Reflective Fabric', 'UV Sun Shield', 'Lightweight & Breathable', 'All-Day Comfort']).map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-blue-50/70 px-3 py-2.5 rounded-lg border border-blue-100 text-xs font-semibold text-blue-900"
                    >
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Assurance */}
              <div className="border-t border-gray-200 pt-4 grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
                <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="font-bold text-gray-800">Fast Delivery</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="font-bold text-gray-800">UPI & COD</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="font-bold text-gray-800">Verified Store</p>
                </div>
              </div>
            </div>

            {/* Customer Reviews & Rating Submission Section */}
            <div className="bg-white sm:rounded-xl border-y sm:border border-gray-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm sm:text-base text-gray-900">Customer Reviews & Ratings</h3>
                <button
                  type="button"
                  onClick={() => setShowReviewForm(!showReviewForm)}
                  className="h-8 bg-blue-50 text-blue-700 text-xs font-bold px-3 rounded-lg border border-blue-200 hover:bg-blue-100 transition whitespace-nowrap"
                >
                  {showReviewForm ? 'Close' : '★ Write a Review'}
                </button>
              </div>

              {showReviewForm && (
                <form onSubmit={handleReviewSubmit} className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 space-y-3">
                  <p className="text-xs font-bold text-blue-900">Add Rating & Review:</p>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Select Rating Stars:</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setNewRating(star)}
                          className={`text-2xl transition hover:scale-110 ${
                            star <= newRating ? 'text-amber-500 scale-110' : 'text-gray-300'
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    placeholder="Share your experience with this product..."
                    required
                    rows={3}
                    value={reviewerComment}
                    onChange={e => setReviewerComment(e.target.value)}
                    className="w-full p-3 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  <button
                    type="submit"
                    className="w-full h-10 bg-blue-600 text-white font-bold rounded-lg text-xs shadow-xs hover:bg-blue-700 transition"
                  >
                    Submit Review
                  </button>
                </form>
              )}

              <div className="space-y-2.5">
                {reviewsList.map((rev, idx) => (
                  <div key={idx} className="p-3.5 bg-gray-50 rounded-xl text-xs border border-gray-100 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-gray-900">
                        {rev.name} ({rev.location})
                      </span>
                      <span className="text-amber-500 font-bold tabular-nums">
                        {'★'.repeat(rev.rating)}
                        {'☆'.repeat(5 - rev.rating)}
                      </span>
                    </div>
                    <p className="text-gray-700 leading-relaxed">{rev.comment}</p>
                    <p className="text-[10px] text-gray-400 text-right">{rev.date}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / Tablet Sticky Bottom Purchase CTA */}
      <div className="lg:hidden fixed bottom-14 left-0 right-0 bg-white border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-3 shadow-lg z-40">
        <div className="min-w-0 tabular-nums">
          <p className="text-[10px] font-semibold text-gray-500 truncate">
            {user ? 'Total Payable' : t('loginRequiredBook')}
          </p>
          <p className="text-base font-extrabold text-gray-900 leading-tight">₹{finalTotalPayable}</p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!user) {
              const redirectTarget = `/product/${product.id}?openOrder=1`;
              navigate(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
              return;
            }
            setShowOrderModal(true);
          }}
          className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm rounded-lg shadow-xs active:scale-[0.98] transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <span>{user ? t('orderNow') : 'Sign in to Order'}</span>
        </button>
      </div>

      {/* Interactive Product Image Zoom Modal */}
      {isZoomOpen && (
        <div className="fixed inset-0 bg-black/95 z-[300] flex flex-col">
          {/* Zoom Modal Top Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/15 text-white shrink-0">
            <span className="text-xs font-bold truncate max-w-[45%]">{product.name}</span>

            <div className="flex items-center gap-1.5">
              {([1, 2, 3] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setZoomScale(level)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-bold transition ${
                    zoomScale === level
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/10 text-gray-200 hover:bg-white/20'
                  }`}
                >
                  {level}x
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                aria-label="Close zoom viewer"
                className="h-8 w-8 ml-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold text-sm flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Scrollable / Pannable Zoom Stage */}
          <div
            onClick={() => setZoomScale(prev => (prev === 1 ? 2 : prev === 2 ? 3 : 1))}
            className="flex-1 overflow-auto flex items-center justify-center p-4 cursor-zoom-in relative"
          >
            <img
              src={imagesList[safeImgIndex]}
              alt={product.name}
              referrerPolicy="no-referrer"
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'center center',
              }}
              className="max-h-[75vh] max-w-full object-contain rounded-lg transition-transform duration-200 select-none"
            />
          </div>

          {/* Thumbnail switcher inside zoom modal */}
          {imagesList.length > 1 && (
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/15 overflow-x-auto shrink-0">
              {imagesList.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedImageIndex(idx);
                    setZoomScale(2);
                  }}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 ${
                    safeImgIndex === idx ? 'border-blue-500' : 'border-white/20 opacity-60'
                  }`}
                >
                  <img src={img} alt="zoom thumb" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Order Booking Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            {submittedOrderId ? (
              <div className="py-3 space-y-4 text-center">
                {/* Pending Verification Header */}
                <div className="w-16 h-16 bg-amber-100 text-amber-600 text-3xl rounded-full flex items-center justify-center mx-auto mb-1 animate-pulse">
                  ⏳
                </div>
                <span className="inline-block bg-amber-100 text-amber-800 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                  Status: PENDING VERIFICATION
                </span>
                
                <h3 className="text-2xl font-extrabold text-gray-900">Order Submitted (Pending)</h3>
                <p className="text-xs text-gray-600">
                  Your order <span className="font-bold">#{submittedOrderId}</span> is recorded in <span className="font-bold text-amber-700">PENDING status</span>. Upload your payment screenshot below (if applicable) for quick Admin verification.
                </p>

                {/* Upload Payment Screenshot Box */}
                <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-4 rounded-2xl text-left space-y-3">
                  <p className="text-xs font-bold text-amber-900 flex items-center gap-1">
                    <span>📷</span> Upload Payment Screenshot (യുപിഐ പേയ്‌മെന്റ് സ്ക്രീൻഷോട്ട്):
                  </p>

                  {uploadingScreenshot && (
                    <p className="text-xs font-bold text-blue-700">⏳ Compressing & saving screenshot...</p>
                  )}
                  
                  {screenshotPreview ? (
                    <div className="space-y-2">
                      <div className="w-full h-44 bg-gray-900 rounded-xl overflow-hidden relative">
                        <img src={screenshotPreview} alt="Payment Screenshot" className="w-full h-full object-contain" />
                      </div>
                      <p className="text-[11px] text-green-700 font-bold text-center">
                        ✓ Screenshot Uploaded Successfully! Admin will review it shortly.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleScreenshotChange}
                        className="block w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-600 file:text-white hover:file:bg-amber-700 cursor-pointer"
                      />
                      <p className="text-[10px] text-amber-800 mt-2">
                        Take a screenshot of your payment and upload here to speed up approval.
                      </p>
                    </div>
                  )}

                  {formData.paymentMethod === 'UPI' && paymentSettings.enableUPI !== false && (
                    <button
                      type="button"
                      onClick={() => triggerUpiPayment(submittedOrderId, finalTotalPayable)}
                      className="w-full bg-blue-600 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1 shadow-sm mt-2"
                    >
                      <span>📱</span> Re-open UPI App (GPay / PhonePe / Paytm)
                    </button>
                  )}

                  {/* Direct WhatsApp Support Contact Button */}
                  <a
                    href={`https://wa.me/91${formData.whatsappNumber || '6238113451'}?text=${encodeURIComponent(
                      `Hello Amal Coolguard Customer Care,\nI have submitted my order!\n\nOrder ID: #${submittedOrderId}\nProduct: ${product.name}\nTotal Amount: ₹${finalTotalPayable}\nCustomer: ${formData.customerName}\nPhone: ${formData.phoneNumber}\nAddress: ${formData.address}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition mt-2"
                  >
                    <span className="text-base">💬</span>
                    <span>Contact Customer Care on WhatsApp ({formData.whatsappNumber || '6238113451'})</span>
                  </a>
                </div>

                {/* Order Summary Box */}
                <div className="bg-gray-100 p-4 rounded-2xl text-xs text-gray-800 space-y-1.5 text-left border">
                  <p><span className="font-bold">Order ID:</span> {submittedOrderId}</p>
                  <p><span className="font-bold">Product Price:</span> ₹{itemBasePrice}</p>
                  {totals.gstPercent > 0 && (
                    <p>
                      <span className="font-bold">GST ({totals.gstPercent}%):</span> ₹{totals.gstAmount}
                      {paymentSettings.gstNumber ? ` • GSTIN: ${paymentSettings.gstNumber}` : ''}
                    </p>
                  )}
                  <p><span className="font-bold">Delivery Charge:</span> {deliveryFee > 0 ? `₹${deliveryFee}` : 'Free'}</p>
                  {estDeliveryText && (
                    <p><span className="font-bold">Estimated Delivery:</span> {estDeliveryText}</p>
                  )}
                  <p><span className="font-bold">Total Amount:</span> ₹{finalTotalPayable}</p>
                  <p><span className="font-bold">Customer:</span> {formData.customerName}</p>
                  <p><span className="font-bold">Phone:</span> {formData.phoneNumber}</p>
                  <p><span className="font-bold">Delivery Address:</span> {formData.address}, {formData.pincode}</p>
                  <p><span className="font-bold">Payment Mode:</span> {formData.paymentMethod}</p>
                  <p><span className="font-bold">Current Status:</span> <span className="text-amber-700 font-bold">Pending Admin Approval</span></p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setShowOrderModal(false);
                      setSubmittedOrderId(null);
                      navigate('/orders');
                    }}
                    className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl text-xs shadow"
                  >
                    View My Orders Page
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setShowOrderModal(false);
                      setSubmittedOrderId(null);
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 font-bold py-3 rounded-xl text-xs"
                  >
                    Close Window
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleOrderSubmit} className="space-y-3.5">
                <div className="flex justify-between items-center border-b pb-2.5">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Book / Order Details</h3>
                    {user?.email && (
                      <p className="text-[10px] font-bold text-blue-600">✉️ Ordering via {user.email}</p>
                    )}
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowOrderModal(false)}
                    className="text-gray-400 hover:text-gray-600 font-bold text-xl"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center gap-3 bg-blue-50 p-2.5 rounded-xl border border-blue-100">
                  <img src={product.imageUrl} alt={product.name} className="w-12 h-12 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-gray-900 truncate">{product.name}</p>
                    <p className="text-sm font-extrabold text-blue-700">Total: ₹{finalTotalPayable}</p>
                    <p className="text-[10px] text-gray-600">
                      Item ₹{itemBasePrice}
                      {totals.gstPercent > 0 ? ` + ${totals.gstPercent}% GST ₹${totals.gstAmount}` : ''}
                      {deliveryFee > 0 ? ` + Delivery ₹${deliveryFee}` : ' • Free Delivery'}
                    </p>
                    {estDeliveryText && (
                      <p className="text-[10px] text-emerald-700 font-bold">
                        ⏱️ Estimated Delivery: {estDeliveryText}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Your Full Name *</label>
                  <input 
                    type="text" 
                    placeholder="Enter your full name"
                    required
                    value={formData.customerName}
                    onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number (WhatsApp) *</label>
                  <input 
                    type="tel" 
                    placeholder="10-digit mobile number"
                    required
                    value={formData.phoneNumber}
                    onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Delivery Address *</label>
                  <textarea 
                    placeholder="House name, street, area details"
                    required
                    rows={2}
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pincode *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 673001"
                    required
                    value={formData.pincode}
                    onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Payment Method</label>
                  {allowedPaymentMethods.length === 0 ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 text-center">
                      All online & COD payment gateways are currently blocked by Admin. Please contact Customer Care on WhatsApp.
                    </div>
                  ) : (
                    <div className={`grid gap-2 mb-2 ${
                      allowedPaymentMethods.length === 1 ? 'grid-cols-1' :
                      allowedPaymentMethods.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                    }`}>
                      {allowedPaymentMethods.map(method => (
                        <button
                          type="button"
                          key={method.id}
                          onClick={() => setFormData({ ...formData, paymentMethod: method.id })}
                          className={`p-2 rounded-xl text-xs font-bold border text-center transition ${
                            formData.paymentMethod === method.id 
                              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-200' 
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {formData.paymentMethod === 'UPI' && paymentSettings.enableUPI !== false && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-3 rounded-xl text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-900">📲 Mobile UPI Launcher</span>
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">GPay / PhonePe / Paytm</span>
                      </div>
                      <p className="text-[11px] text-gray-600">
                        When you submit, your mobile UPI app will open for ₹{finalTotalPayable}. Upload the payment screenshot on the next screen for Admin approval.
                      </p>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Store / Merchant UPI ID</label>
                        <input 
                          type="text" 
                          readOnly
                          value={formData.merchantUpiId}
                          className="w-full p-2 text-xs border border-gray-300 rounded-lg outline-none bg-white font-mono text-gray-700"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting || allowedPaymentMethods.length === 0}
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white font-extrabold py-3.5 rounded-xl shadow-lg hover:brightness-110 active:scale-98 transition mt-2 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  <span>⏳</span>
                  <span>{submitting ? 'Saving Order...' : `Submit Order (Pending Verification) • ₹${finalTotalPayable}`}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
