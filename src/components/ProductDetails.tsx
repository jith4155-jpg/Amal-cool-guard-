import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  toAppUser,
  mapProductFromDb,
  uploadDataUrlToStorage,
  OperationType,
  handleFirestoreError,
} from '../firebase';
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
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  const [submittedDocId, setSubmittedDocId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderErrorMsg, setOrderErrorMsg] = useState('');
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [cardPreview, setCardPreview] = useState({ number: '', expiry: '', cvv: '' });
  const [selectedLocation] = useState<string>(() => {
    try {
      return localStorage.getItem('amal_user_location') || 'Kerala, India';
    } catch {
      return 'Kerala, India';
    }
  });

  const openCheckout = () => {
    setOrderErrorMsg('');
    setSubmittedOrderId(null);
    setSubmittedDocId(null);
    setCheckoutStep(1);
    setShowPriceBreakdown(false);
    setShowOrderModal(true);
  };

  const closeCheckout = () => {
    setShowOrderModal(false);
    setSubmittedOrderId(null);
    setSubmittedDocId(null);
    setCheckoutStep(1);
    setOrderErrorMsg('');
    setShowPriceBreakdown(false);
  };

  const handleCopyUpi = () => {
    const upi = formData.merchantUpiId || 'amalcoolguard@upi';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(upi).catch(() => {});
    }
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 1800);
  };

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
      openCheckout();
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

    const fetchRemoteSettingsAndProduct = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'payment'));
        if (settingsSnap.exists() && isMounted) {
          const remoteSettings = settingsSnap.data() as StorePaymentSettings;
          const synced = savePaymentSettingsSync(remoteSettings);
          applySettings(synced);
        }
      } catch {
        // Fallback silently to local settings
      }

      if (id) {
        if (isProductDeleted(id)) {
          if (isMounted) setProduct(null);
        } else {
          try {
            const prodSnap = await getDoc(doc(db, 'products', id));
            if (isMounted) {
              if (prodSnap.exists()) {
                setProduct(mapProductFromDb(prodSnap.data(), prodSnap.id));
              } else {
                setProduct(findProductFromCatalog(id));
              }
            }
          } catch {
            if (isMounted) setProduct(findProductFromCatalog(id));
          }
        }
      }
    };

    fetchRemoteSettingsAndProduct();

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'payment'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        const synced = savePaymentSettingsSync(snap.data() as StorePaymentSettings);
        applySettings(synced);
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'settings/payment');
      }
    );

    const unsubProd = id
      ? onSnapshot(
          doc(db, 'products', id),
          snap => {
            if (!isMounted) return;
            if (isProductDeleted(id)) {
              setProduct(null);
              return;
            }
            if (snap.exists()) {
              setProduct(mapProductFromDb(snap.data(), snap.id));
            }
          },
          error => {
            handleFirestoreError(error, OperationType.GET, `products/${id}`);
          }
        )
      : null;

    const localRev = safeJsonParse<any[]>(localStorage.getItem(`amal_reviews_${id}`), []);
    if (localRev.length > 0) {
      setReviewsList(prev => [...localRev, ...prev]);
    }

    return () => {
      isMounted = false;
      unsubSettings();
      if (unsubProd) unsubProd();
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
      const { dataUrl: compressedDataUrl } = await compressProductImageToRange(file, 20, 180);
      let finalScreenshotUrl = compressedDataUrl;

      const activeUid = auth.currentUser?.uid || user?.uid;
      if (activeUid) {
        const storagePath = `screenshots/${activeUid}/${submittedOrderId || 'pending'}_${Date.now()}.jpg`;
        const uploadedUrl = await uploadDataUrlToStorage(compressedDataUrl, storagePath);
        if (uploadedUrl) {
          finalScreenshotUrl = uploadedUrl;
        }
      }

      setScreenshotPreview(finalScreenshotUrl);

      if (submittedOrderId) {
        const currentOrders = getLocalOrders();
        const updated = currentOrders.map((o: any) =>
          o.orderId === submittedOrderId
            ? {
                ...o,
                screenshot: finalScreenshotUrl,
                paymentScreenshot: finalScreenshotUrl,
                status: 'pending_verification',
              }
            : o
        );
        saveAllOrders(updated);
      }

      if (submittedDocId && activeUid) {
        try {
          await updateDoc(doc(db, 'bookings', submittedDocId), {
            paymentScreenshot: finalScreenshotUrl.slice(0, 950000),
            status: 'pending_verification',
          });
          await refreshMyOrders();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `bookings/${submittedDocId}`);
        }
      }
    } catch (err) {
      console.warn('Screenshot upload/compression err:', err);
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setOrderErrorMsg('');

    const fbUser = auth.currentUser;
    const currentUser = toAppUser(fbUser) || user;

    let guestUid = localStorage.getItem('amal_guest_uid');
    if (!guestUid) {
      guestUid = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('amal_guest_uid', guestUid);
    }
    const currentUid = currentUser?.uid || guestUid;
    const cleanCustomerName = (formData.customerName || 'Customer').trim().slice(0, 120) || 'Customer';
    const cleanPhone = (formData.phoneNumber || '0000000000').trim().slice(0, 30) || '0000000000';
    const cleanAddress = (formData.address || '').trim().slice(0, 500);
    const cleanPincode = (formData.pincode || '').trim().slice(0, 20);
    const currentEmail =
      currentUser?.email ||
      (cleanPhone && cleanPhone !== '0000000000'
        ? `${cleanPhone.replace(/\D/g, '')}@guest.amalcoolguard.in`
        : 'guest@amalcoolguard.in');
    const currentDisplayName = currentUser?.displayName || cleanCustomerName;
    const currentPhoto = currentUser?.photoURL || '';

    setSubmitting(true);

    // Generate sequential Order ID atomically via Firestore transaction, or unique fallback ID
    const makeUniqueFallbackOrderId = () => {
      const tsPart = String(Date.now()).slice(-6);
      const randPart = String(Math.floor(10 + Math.random() * 89));
      return `A${tsPart}${randPart}`;
    };

    let orderId = '';
    try {
      const nextNum = await runTransaction(db, async tx => {
        const counterRef = doc(db, 'settings', 'order_counter');
        const counterSnap = await tx.get(counterRef);
        const currentVal = counterSnap.exists() ? Number(counterSnap.data()?.nextVal || 1) : 1;
        tx.set(counterRef, { nextVal: currentVal + 1 });
        return currentVal;
      });
      orderId = 'A' + String(nextNum).padStart(6, '0');
      localStorage.setItem('amal_order_sequence_counter', String(nextNum + 1));
    } catch {
      orderId = makeUniqueFallbackOrderId();
    }

    const totals = calculateProductTotals(product);
    const amount = totals.finalTotal;
    const estDelivery =
      (product.estimatedDeliveryDays || '').trim() ||
      (paymentSettings.defaultDeliveryDays || '').trim() ||
      '';

    // Attribute promoter cleanly whenever customer entered through any referral link
    const rawRefCode = getActiveReferralCode();
    const activeRefCode = rawRefCode ? rawRefCode.trim().toUpperCase().slice(0, 64) : null;
    let commissionAmt = 100;
    let promoterUserId = '';
    let promoterEmail = '';
    if (activeRefCode) {
      try {
        const refSnap = await getDoc(doc(db, 'promoter_refs', activeRefCode));
        if (refSnap.exists()) {
          const refData = refSnap.data();
          commissionAmt = Number(refData?.commissionPerSale ?? 100);
          promoterUserId = String(refData?.promoterUserId || '');
        }
      } catch {
        // Fallback to local promoters dictionary
      }
      const promotersList = safeJsonParse<Record<string, any>>(
        localStorage.getItem('amal_promoters_list'),
        {}
      );
      const foundProm = promotersList[activeRefCode];
      if (foundProm) {
        if (!promoterUserId) promoterUserId = foundProm.userId || '';
        promoterEmail = foundProm.email || '';
        if (typeof foundProm.commissionPerSale === 'number') {
          commissionAmt = foundProm.commissionPerSale;
        }
      }
    }

    let resolvedScreenshot = screenshotPreview;
    if (resolvedScreenshot && resolvedScreenshot.startsWith('data:')) {
      const uploadedUrl = await uploadDataUrlToStorage(
        resolvedScreenshot,
        `screenshots/${currentUid}/${orderId}_${Date.now()}.jpg`
      );
      if (uploadedUrl) resolvedScreenshot = uploadedUrl;
    }
    const safeScreenshot =
      resolvedScreenshot && resolvedScreenshot.length <= 950000 ? resolvedScreenshot : null;

    const rawProductImg = product.imageUrl || (product.galleryImages && product.galleryImages[0]) || '';
    const safeProductImage = rawProductImg && rawProductImg.length <= 950000 ? rawProductImg : '';

    let createdDocId: string | null = null;
    try {
      const bookingRef = await addDoc(collection(db, 'bookings'), {
        orderId,
        userId: currentUid,
        userEmail: currentEmail.slice(0, 200),
        userName: currentDisplayName.slice(0, 120),
        userPhoto: currentPhoto.slice(0, 1000),
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
        referralCode: activeRefCode || null,
        promoterId: activeRefCode || null,
        promoterUserId: activeRefCode ? promoterUserId.slice(0, 128) : '',
        promoterEmail: activeRefCode ? promoterEmail.slice(0, 200) : '',
        promoterCommission: activeRefCode ? commissionAmt : 0,
        deliveryStatus: 'pending',
        status: 'pending_verification',
        paymentScreenshot: safeScreenshot,
        createdAt: serverTimestamp(),
      });
      createdDocId = bookingRef.id;
    } catch (err: any) {
      setSubmitting(false);
      setOrderErrorMsg(
        err?.message
          ? `Order could not be sent to store: ${err.message}`
          : 'Unable to send your order to the store right now. Please retry.'
      );
      handleFirestoreError(err, OperationType.CREATE, 'bookings');
      return;
    }

    // Write PII-free referral sale summary so the owning Promoter sees live cross-device order stats
    if (activeRefCode && createdDocId) {
      try {
        await setDoc(doc(db, 'promoter_sales', orderId), {
          orderId,
          bookingDocId: createdDocId,
          buyerUserId: currentUid,
          promoterId: activeRefCode,
          promoterUserId: promoterUserId.slice(0, 128),
          promoterEmail: promoterEmail.slice(0, 200),
          productId: String(product.id).slice(0, 128),
          productName: (product.name || '').slice(0, 200),
          price: amount,
          commission: commissionAmt,
          deliveryStatus: 'pending',
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
      userId: currentUid,
      userEmail: currentEmail,
      userName: currentDisplayName,
      userPhoto: currentPhoto,
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
      customerName: cleanCustomerName,
      phoneNumber: cleanPhone,
      address: cleanAddress,
      pincode: cleanPincode,
      paymentMethod: formData.paymentMethod,
      referralCode: activeRefCode,
      promoterId: activeRefCode,
      promoterUserId: activeRefCode ? promoterUserId : '',
      promoterEmail: activeRefCode ? promoterEmail : '',
      promoterCommission: activeRefCode ? commissionAmt : 0,
      deliveryStatus: 'pending',
      status: 'pending_verification',
      screenshot: screenshotPreview || null,
      paymentScreenshot: screenshotPreview || null,
      createdAt: new Date().toISOString(),
    };

    recordLocalOrder(newOrderRecord);

    if (formData.phoneNumber) {
      restoreDeletedCustomerMobile(formData.phoneNumber);
      localStorage.setItem('amal_customer_phone', cleanPhone);
    }
    localStorage.setItem('amal_customer_name', cleanCustomerName);
    localStorage.setItem('amal_customer_address', cleanAddress);
    localStorage.setItem('amal_customer_pincode', cleanPincode);

    if (currentUser && fbUser) {
      try {
        await updateUserProfile({
          name: formData.customerName,
          mobile: formData.phoneNumber,
          address: formData.address,
          pincode: formData.pincode,
        });
        await refreshMyOrders();
      } catch {
        // ignore profile error
      }
    }

    setSubmitting(false);
    setSubmittedOrderId(orderId);
    setSubmittedDocId(createdDocId);
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
  const savingsAmount = Math.max(0, totals.originalTotal - totals.finalTotal);
  const estDeliveryText =
    (product.estimatedDeliveryDays || '').trim() ||
    (paymentSettings.defaultDeliveryDays || '').trim();

  const allowedPaymentMethods = [
    ...(paymentSettings.enableUPI !== false ? [{ id: 'UPI', label: 'UPI' }] : []),
    ...(paymentSettings.enableCard !== false ? [{ id: 'Card', label: 'Credit / Debit / ATM Card' }] : []),
    ...(paymentSettings.enableCOD !== false ? [{ id: 'COD', label: 'Cash on Delivery' }] : []),
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
            {user ? (
              <Link
                to="/account"
                title={profile?.email || user.email || 'My Profile'}
                className="h-9 inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-extrabold px-2 sm:px-2.5 rounded-lg hover:bg-blue-100 transition whitespace-nowrap shrink-0"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={profile?.name || user.displayName || 'User'}
                    className="w-5 h-5 rounded-full object-cover border border-blue-300 shrink-0"
                  />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                    {(profile?.name || user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[64px] sm:max-w-[100px] truncate">
                  {(profile?.name || user.displayName || user.email || 'Account').split(' ')[0]}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                to={`/login?redirect=${encodeURIComponent(`/product/${product.id}?openOrder=1`)}`}
                className="h-9 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 rounded-lg shadow-xs transition whitespace-nowrap shrink-0"
              >
                {t('login')}
              </Link>
            )}
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
              <button
                type="button"
                onClick={openCheckout}
                className="flipkart-cta-btn w-full h-12 bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-sm rounded-xl shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer tabular-nums"
              >
                <span>
                  {t('orderNow')} — ₹{finalTotalPayable}
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
                <div className="flex items-baseline gap-2.5 flex-wrap tabular-nums">
                  {discountPercent > 0 && (
                    <span className="text-lg sm:text-xl font-extrabold text-emerald-600">
                      ↓{discountPercent}%
                    </span>
                  )}
                  {totals.originalTotal > finalTotalPayable && (
                    <span className="text-base sm:text-lg text-gray-400 line-through">
                      ₹{totals.originalTotal}
                    </span>
                  )}
                  <span className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                    ₹{finalTotalPayable}
                  </span>
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
                </div>
              </div>

              {/* Flipkart-Style Delivery Details Card */}
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-extrabold text-gray-900">Delivery details</h3>
                  {deliveryFee === 0 && (
                    <span className="text-[11px] font-bold text-emerald-700">Free Delivery</span>
                  )}
                </div>

                <div className="divide-y divide-gray-100 text-xs sm:text-sm">
                  <div className="px-4 py-3 flex items-center justify-between gap-3 bg-blue-50/50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <svg className="w-4 h-4 text-gray-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
                        <circle cx="12" cy="11" r="2.2" />
                      </svg>
                      <span className="text-gray-800 font-semibold truncate">
                        Deliver to {formData.pincode ? `${formData.pincode} · ` : ''}{selectedLocation}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={openCheckout}
                      className="text-xs font-bold text-blue-600 hover:underline shrink-0 whitespace-nowrap"
                    >
                      Change
                    </button>
                  </div>

                  <div className="px-4 py-3 flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-gray-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 7h11v10H3z" />
                      <path d="M14 10h4l3 3v4h-7v-7Z" />
                      <circle cx="7.5" cy="17.5" r="1.5" />
                      <circle cx="17.5" cy="17.5" r="1.5" />
                    </svg>
                    <div>
                      <p className="font-bold text-gray-900">
                        Delivery by {estDeliveryText || '3–5 Days'}
                      </p>
                      <p className="text-[11px] text-gray-500">Order now for priority dispatch</p>
                    </div>
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <svg className="w-4 h-4 text-gray-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l1-4h16l1 4" />
                        <path d="M5 9v11h14V9" />
                        <path d="M9 20v-6h6v6" />
                      </svg>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">Fulfilled by Amal Coolguard</p>
                        <p className="text-[11px] text-gray-500 tabular-nums">
                          {product.rating || 4.8} ★ · Verified Seller
                        </p>
                      </div>
                    </div>
                  </div>
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

              {/* 4-Pillar Customer Assurance Strip */}
              <div className="border-t border-gray-200 pt-4 grid grid-cols-4 gap-2 text-center text-[11px] text-gray-700">
                <div className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex flex-col items-center gap-1.5">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <p className="font-semibold leading-tight">Fast Dispatch</p>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex flex-col items-center gap-1.5">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
                    <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M3 21v-5h5" />
                  </svg>
                  <p className="font-semibold leading-tight">Quality Checked</p>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex flex-col items-center gap-1.5">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <rect x="3" y="6" width="18" height="12" rx="2" />
                    <circle cx="12" cy="12" r="2.2" />
                  </svg>
                  <p className="font-semibold leading-tight">
                    {paymentSettings.enableCOD !== false ? 'Cash on Delivery' : 'UPI & Cards'}
                  </p>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex flex-col items-center gap-1.5">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6l-7-3Z" />
                    <path d="m9.5 12 1.8 1.8L15 10" />
                  </svg>
                  <p className="font-semibold leading-tight">Amal Assured</p>
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
      <div className="lg:hidden fixed bottom-14 left-0 right-0 bg-white border-t border-gray-200 px-3 py-2.5 flex items-center justify-between gap-3 shadow-lg z-40">
        <div className="min-w-0 tabular-nums">
          {totals.originalTotal > finalTotalPayable && (
            <p className="text-[11px] text-gray-400 line-through leading-none">
              ₹{totals.originalTotal}
            </p>
          )}
          <p className="text-lg font-extrabold text-gray-900 leading-tight">₹{finalTotalPayable}</p>
        </div>

        <button
          type="button"
          onClick={openCheckout}
          className="flipkart-cta-btn h-11 px-6 bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-sm rounded-lg shadow-xs active:scale-[0.98] transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
        >
          <span>{t('orderNow')} — ₹{finalTotalPayable}</span>
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

      {/* Full-Screen Flipkart-Style 3-Step Checkout Experience */}
      {showOrderModal && (
        <div className="fixed inset-0 z-[200] bg-gray-100 overflow-y-auto">
          <div className="max-w-2xl mx-auto min-h-screen flex flex-col bg-gray-100">
            {/* Sticky Top Checkout Navigation Bar */}
            <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    if (submittedOrderId) {
                      closeCheckout();
                    } else if (checkoutStep > 1) {
                      setOrderErrorMsg('');
                      setCheckoutStep((checkoutStep - 1) as 1 | 2 | 3);
                    } else {
                      closeCheckout();
                    }
                  }}
                  aria-label="Go back"
                  className="w-9 h-9 -ml-1.5 rounded-lg flex items-center justify-center text-gray-800 hover:bg-gray-100 transition shrink-0"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="min-w-0">
                  {!submittedOrderId && checkoutStep === 3 && (
                    <p className="text-[11px] font-semibold text-gray-500 leading-none mb-0.5">
                      Step 3 of 3
                    </p>
                  )}
                  <h2 className="text-base font-extrabold text-gray-900 truncate leading-tight">
                    {submittedOrderId
                      ? 'Order Confirmed'
                      : checkoutStep === 1
                        ? 'Delivery Address'
                        : checkoutStep === 2
                          ? 'Order Summary'
                          : 'Payments'}
                  </h2>
                </div>
              </div>

              {!submittedOrderId && checkoutStep === 3 ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 shrink-0 whitespace-nowrap">
                  <svg className="w-3.5 h-3.5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  <span>100% Secure</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={closeCheckout}
                  aria-label="Close checkout"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 font-bold text-base shrink-0"
                >
                  ✕
                </button>
              )}
            </header>

            {/* 3-Step Progress Stepper */}
            {!submittedOrderId && (
              <div className="bg-white border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between max-w-md mx-auto">
                  {[
                    { step: 1, label: 'Address' },
                    { step: 2, label: 'Order Summary' },
                    { step: 3, label: 'Payment' },
                  ].map((item, idx) => {
                    const isActive = checkoutStep === item.step;
                    const isDone = checkoutStep > item.step;
                    return (
                      <div key={item.step} className="flex items-center flex-1 last:flex-none">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold tabular-nums transition ${
                              isDone
                                ? 'bg-emerald-600 text-white'
                                : isActive
                                  ? 'bg-[#2874F0] text-white'
                                  : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {isDone ? '✓' : item.step}
                          </span>
                          <span
                            className={`text-xs font-bold whitespace-nowrap ${
                              isActive
                                ? 'text-[#2874F0]'
                                : isDone
                                  ? 'text-gray-900'
                                  : 'text-gray-500'
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>
                        {idx < 2 && (
                          <div
                            className={`h-[2px] flex-1 mx-2 sm:mx-3 rounded ${
                              isDone ? 'bg-emerald-600' : 'bg-gray-200'
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main Checkout Content */}
            {submittedOrderId ? (
              <div className="flex-1 p-4 sm:p-6 flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  {/* Clean Confirmed Hero Card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6 text-center space-y-3 shadow-xs">
                    <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900">
                        Order Confirmed!
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-600">
                        Thank you, <span className="font-bold text-gray-900">{formData.customerName || 'Customer'}</span>. Your order has been placed.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 tabular-nums">
                      <span>Order ID:</span>
                      <span className="font-mono text-gray-900">#{submittedOrderId}</span>
                    </div>
                    <p className="text-xs font-semibold text-emerald-700">
                      Expected Delivery: {estDeliveryText || '3–5 Days'}
                    </p>
                  </div>

                  {/* Clean Order Summary Box */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 shadow-xs">
                    <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{product.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 tabular-nums">Qty: 1</p>
                        <p className="text-sm font-extrabold text-gray-900 mt-1 tabular-nums">
                          ₹{finalTotalPayable}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500 font-medium">Payment Method</span>
                        <span className="font-bold text-gray-900">
                          {formData.paymentMethod === 'COD'
                            ? 'Cash on Delivery'
                            : formData.paymentMethod === 'Card'
                              ? 'Credit / Debit Card'
                              : 'UPI'}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-gray-500 font-medium shrink-0">Deliver to</span>
                        <span className="font-semibold text-gray-900 text-right">
                          {formData.customerName}, {formData.address} - {formData.pincode}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500 font-medium">Mobile</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {formData.phoneNumber}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                      <span className="text-gray-500">Need help with this order?</span>
                      <a
                        href={`https://wa.me/91${formData.whatsappNumber || '6238113451'}?text=${encodeURIComponent(
                          `Hello Amal Coolguard Support,\nOrder ID: #${submittedOrderId}\nProduct: ${product.name}\nAmount: ₹${finalTotalPayable}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-blue-600 hover:underline whitespace-nowrap"
                      >
                        WhatsApp Support
                      </a>
                    </div>
                  </div>
                </div>

                {/* Single Continue Button */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      closeCheckout();
                      navigate('/orders');
                    }}
                    className="flipkart-cta-btn w-full h-12 bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-sm rounded-xl shadow-xs transition cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : checkoutStep === 1 ? (
              /* STEP 1: Delivery Address */
              <div className="flex-1 flex flex-col justify-between">
                <div className="p-4 space-y-3">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-extrabold text-gray-900">Contact & Delivery Details</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Enter the address where you want this order delivered.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">Full Name *</label>
                      <input
                        type="text"
                        placeholder="Enter your full name"
                        required
                        value={formData.customerName}
                        onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                        className="w-full h-11 px-3.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        10-Digit Mobile Number (WhatsApp) *
                      </label>
                      <input
                        type="tel"
                        placeholder="Enter 10-digit mobile number"
                        required
                        value={formData.phoneNumber}
                        onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                        className="w-full h-11 px-3.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        House No., Building, Road, Area *
                      </label>
                      <textarea
                        placeholder="House name, street, landmark, town"
                        required
                        rows={3}
                        value={formData.address}
                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                        className="w-full p-3.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">Pincode *</label>
                      <input
                        type="text"
                        placeholder="e.g. 673001"
                        required
                        value={formData.pincode}
                        onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                        className="w-full h-11 px-3.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white tabular-nums"
                      />
                    </div>

                    {orderErrorMsg && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700">
                        {orderErrorMsg}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sticky Step 1 Footer */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
                  <div className="tabular-nums">
                    {totals.originalTotal > finalTotalPayable && (
                      <p className="text-[11px] text-gray-400 line-through leading-none">
                        ₹{totals.originalTotal}
                      </p>
                    )}
                    <p className="text-lg font-extrabold text-gray-900 leading-tight">
                      ₹{finalTotalPayable}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !formData.customerName.trim() ||
                        !formData.phoneNumber.trim() ||
                        !formData.address.trim() ||
                        !formData.pincode.trim()
                      ) {
                        setOrderErrorMsg('Please fill in your name, mobile number, address, and pincode.');
                        return;
                      }
                      setOrderErrorMsg('');
                      setCheckoutStep(2);
                    }}
                    className="flipkart-cta-btn h-11 px-8 bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-sm rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : checkoutStep === 2 ? (
              /* STEP 2: Flipkart-Style Order Summary (No Donation Section) */
              <div className="flex-1 flex flex-col justify-between">
                <div className="p-4 space-y-3">
                  {/* Deliver To Card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        Deliver to:
                      </p>
                      <p className="text-sm font-extrabold text-gray-900 truncate">
                        {formData.customerName}
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {formData.address}, {formData.pincode}
                      </p>
                      <p className="text-xs font-semibold text-gray-800 tabular-nums">
                        {formData.phoneNumber}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderErrorMsg('');
                        setCheckoutStep(1);
                      }}
                      className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-blue-600 font-bold text-xs hover:bg-blue-50 transition shrink-0 whitespace-nowrap"
                    >
                      Change
                    </button>
                  </div>

                  {/* Product Summary Card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-start gap-3.5">
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className="w-20 h-20 rounded-lg object-cover border border-gray-200"
                        />
                        <span className="px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-700 tabular-nums">
                          Qty: 1
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">
                          {product.name}
                        </p>
                        <div className="inline-flex items-center gap-1.5 text-xs">
                          <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums">
                            {product.rating || 4.8} ★
                          </span>
                          <span className="text-gray-500 text-[11px]">Amal Assured</span>
                        </div>
                        <div className="flex items-baseline gap-2 pt-0.5 tabular-nums flex-wrap">
                          {discountPercent > 0 && (
                            <span className="text-xs font-extrabold text-emerald-700">
                              ↓{discountPercent}%
                            </span>
                          )}
                          {totals.originalTotal > finalTotalPayable && (
                            <span className="text-xs text-gray-400 line-through">
                              ₹{totals.originalTotal}
                            </span>
                          )}
                          <span className="text-base font-extrabold text-gray-900">
                            ₹{finalTotalPayable}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-700">
                      <span>Delivery by {estDeliveryText || '3–5 Days'}</span>
                      <span className="font-bold text-emerald-700">
                        {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}
                      </span>
                    </div>
                  </div>

                  {/* Price Details Card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <h3 className="text-sm font-extrabold text-gray-900">Price Details</h3>
                    <div className="space-y-2 text-xs sm:text-sm tabular-nums">
                      <div className="flex items-center justify-between text-gray-700">
                        <span>Selling Price</span>
                        <span className="font-semibold text-gray-900">₹{totals.originalTotal}</span>
                      </div>
                      {savingsAmount > 0 && (
                        <div className="flex items-center justify-between text-gray-700">
                          <span>Discount</span>
                          <span className="font-bold text-emerald-700">-₹{savingsAmount}</span>
                        </div>
                      )}
                      {totals.gstPercent > 0 && (
                        <div className="flex items-center justify-between text-gray-700">
                          <span>GST ({totals.gstPercent}%)</span>
                          <span className="font-semibold text-gray-900">₹{totals.gstAmount}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-gray-700">
                        <span>Delivery Charges</span>
                        <span className={deliveryFee === 0 ? 'font-bold text-emerald-700' : 'font-semibold text-gray-900'}>
                          {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}
                        </span>
                      </div>
                      <div className="pt-2.5 border-t border-dashed border-gray-200 flex items-center justify-between text-sm sm:text-base font-extrabold text-gray-900">
                        <span>Total Amount</span>
                        <span>₹{finalTotalPayable}</span>
                      </div>
                    </div>

                    {savingsAmount > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs font-bold text-emerald-800 flex items-center gap-2 tabular-nums">
                        <svg className="w-4 h-4 text-emerald-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="m9 12 2 2 4-4" />
                        </svg>
                        <span>You&apos;ll save ₹{savingsAmount} on this order!</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sticky Step 2 Footer */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
                  <div className="tabular-nums">
                    {totals.originalTotal > finalTotalPayable && (
                      <p className="text-[11px] text-gray-400 line-through leading-none">
                        ₹{totals.originalTotal}
                      </p>
                    )}
                    <p className="text-lg font-extrabold text-gray-900 leading-tight">
                      ₹{finalTotalPayable}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderErrorMsg('');
                      setCheckoutStep(3);
                    }}
                    className="flipkart-cta-btn h-11 px-8 bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-sm rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 3: Flipkart-Style Secure Payments Accordion */
              <form onSubmit={handleOrderSubmit} className="flex-1 flex flex-col justify-between p-4 space-y-4">
                <div className="space-y-3">
                  {/* Total Amount Summary Bar */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowPriceBreakdown(prev => !prev)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left"
                    >
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700">
                        <span>Total Amount</span>
                        <svg
                          className={`w-4 h-4 transition-transform ${showPriceBreakdown ? 'rotate-180' : ''}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                      <span className="text-base font-extrabold text-blue-700 tabular-nums">
                        ₹{finalTotalPayable}
                      </span>
                    </button>
                    {showPriceBreakdown && (
                      <div className="px-4 pb-3 pt-1 border-t border-blue-200/70 text-xs text-gray-700 space-y-1 tabular-nums">
                        <div className="flex justify-between">
                          <span>Item Price</span>
                          <span>₹{itemBasePrice}</span>
                        </div>
                        {totals.gstPercent > 0 && (
                          <div className="flex justify-between">
                            <span>GST ({totals.gstPercent}%)</span>
                            <span>₹{totals.gstAmount}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Delivery</span>
                          <span>{deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Accordion Payment Options */}
                  {allowedPaymentMethods.length === 0 ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 text-center">
                      All payment methods are temporarily unavailable. Please contact WhatsApp support ({formData.whatsappNumber || '6238113451'}).
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* 1. UPI Payment Option */}
                      {paymentSettings.enableUPI !== false && (
                        <div
                          className={`bg-white rounded-xl border transition overflow-hidden ${
                            formData.paymentMethod === 'UPI'
                              ? 'border-blue-600 ring-1 ring-blue-200'
                              : 'border-gray-200'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, paymentMethod: 'UPI' })}
                            className="w-full p-4 flex items-center justify-between gap-3 text-left"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[11px] font-black text-gray-800 shrink-0">
                                UPI
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">UPI</p>
                                <p className="text-xs text-gray-500">
                                  Pay by any UPI app (GPay, PhonePe, Paytm, BHIM)
                                </p>
                              </div>
                            </div>
                            <svg
                              className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${
                                formData.paymentMethod === 'UPI' ? 'rotate-180 text-blue-600' : ''
                              }`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>

                          {formData.paymentMethod === 'UPI' && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
                              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-gray-500">Merchant UPI ID</p>
                                  <p className="text-xs sm:text-sm font-mono font-bold text-gray-900 truncate">
                                    {formData.merchantUpiId}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleCopyUpi}
                                  className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-bold text-gray-800 hover:bg-gray-100 transition shrink-0 whitespace-nowrap"
                                >
                                  {copiedUpi ? 'Copied' : 'Copy'}
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => triggerUpiPayment('PAY', finalTotalPayable)}
                                className="w-full h-10 rounded-lg border border-blue-600 text-blue-700 font-bold text-xs hover:bg-blue-50 transition flex items-center justify-center gap-2"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="6" y="2" width="12" height="20" rx="2" />
                                  <path d="M12 18h.01" />
                                </svg>
                                <span>Open UPI App (GPay / PhonePe / Paytm)</span>
                              </button>

                              {/* Optional UPI receipt attachment */}
                              <div className="rounded-lg border border-dashed border-gray-300 p-3 space-y-2 bg-gray-50/70">
                                <p className="text-[11px] font-semibold text-gray-700">
                                  Attach payment screenshot (optional)
                                </p>
                                {uploadingScreenshot && (
                                  <p className="text-[11px] font-semibold text-blue-700">
                                    Optimizing screenshot...
                                  </p>
                                )}
                                {screenshotPreview ? (
                                  <div className="flex items-center gap-3">
                                    <img
                                      src={screenshotPreview}
                                      alt="Payment screenshot"
                                      className="w-12 h-12 rounded-md object-cover border border-gray-200"
                                    />
                                    <span className="text-xs font-bold text-emerald-700 flex-1">
                                      Receipt attached
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setScreenshotPreview(null)}
                                      className="text-xs font-bold text-red-600 hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleScreenshotChange}
                                    className="block w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-xs file:font-bold file:bg-white file:text-gray-800 hover:file:bg-gray-100 cursor-pointer"
                                  />
                                )}
                              </div>

                              <button
                                type="submit"
                                disabled={submitting}
                                className="flipkart-cta-btn w-full h-11 bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-sm rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50 tabular-nums"
                              >
                                {submitting ? 'Confirming Order...' : `Pay & Confirm Order • ₹${finalTotalPayable}`}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. Credit / Debit / ATM Card Option */}
                      {paymentSettings.enableCard !== false && (
                        <div
                          className={`bg-white rounded-xl border transition overflow-hidden ${
                            formData.paymentMethod === 'Card'
                              ? 'border-blue-600 ring-1 ring-blue-200'
                              : 'border-gray-200'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, paymentMethod: 'Card' })}
                            className="w-full p-4 flex items-center justify-between gap-3 text-left"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-700 shrink-0">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                                  <rect x="2" y="5" width="20" height="14" rx="2" />
                                  <path d="M2 10h20" />
                                </svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">Credit / Debit / ATM Card</p>
                                <p className="text-xs text-gray-500">
                                  Visa, Mastercard, RuPay & Maestro supported
                                </p>
                              </div>
                            </div>
                            <svg
                              className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${
                                formData.paymentMethod === 'Card' ? 'rotate-180 text-blue-600' : ''
                              }`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>

                          {formData.paymentMethod === 'Card' && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
                              <div className="space-y-2.5">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={19}
                                  placeholder="Card Number (XXXX XXXX XXXX XXXX)"
                                  value={cardPreview.number}
                                  onChange={e => setCardPreview({ ...cardPreview, number: e.target.value })}
                                  className="w-full h-10 px-3 text-xs sm:text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white tabular-nums"
                                />
                                <div className="grid grid-cols-2 gap-2.5">
                                  <input
                                    type="text"
                                    maxLength={5}
                                    placeholder="Valid Thru (MM/YY)"
                                    value={cardPreview.expiry}
                                    onChange={e => setCardPreview({ ...cardPreview, expiry: e.target.value })}
                                    className="w-full h-10 px-3 text-xs sm:text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white tabular-nums"
                                  />
                                  <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={4}
                                    placeholder="CVV"
                                    value={cardPreview.cvv}
                                    onChange={e => setCardPreview({ ...cardPreview, cvv: e.target.value })}
                                    className="w-full h-10 px-3 text-xs sm:text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white tabular-nums"
                                  />
                                </div>
                              </div>
                              <button
                                type="submit"
                                disabled={submitting}
                                className="flipkart-cta-btn w-full h-11 bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-sm rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50 tabular-nums"
                              >
                                {submitting ? 'Confirming Order...' : `Pay & Confirm Order • ₹${finalTotalPayable}`}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. Cash on Delivery Option */}
                      {paymentSettings.enableCOD !== false && (
                        <div
                          className={`bg-white rounded-xl border transition overflow-hidden ${
                            formData.paymentMethod === 'COD'
                              ? 'border-blue-600 ring-1 ring-blue-200'
                              : 'border-gray-200'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, paymentMethod: 'COD' })}
                            className="w-full p-4 flex items-center justify-between gap-3 text-left"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-700 shrink-0">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                                  <rect x="2" y="6" width="20" height="12" rx="2" />
                                  <circle cx="12" cy="12" r="2.5" />
                                </svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">Cash on Delivery</p>
                                <p className="text-xs text-gray-500">
                                  Pay in cash or UPI when your order arrives
                                </p>
                              </div>
                            </div>
                            <svg
                              className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${
                                formData.paymentMethod === 'COD' ? 'rotate-180 text-blue-600' : ''
                              }`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>

                          {formData.paymentMethod === 'COD' && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
                              <p className="text-xs text-gray-600 leading-relaxed tabular-nums">
                                Pay <span className="font-bold text-gray-900">₹{finalTotalPayable}</span> directly at delivery to the courier partner.
                              </p>
                              <button
                                type="submit"
                                disabled={submitting}
                                className="flipkart-cta-btn w-full h-11 bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 font-extrabold text-sm rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50 tabular-nums"
                              >
                                {submitting ? 'Confirming Order...' : `Confirm Order • ₹${finalTotalPayable}`}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {orderErrorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 text-center">
                      {orderErrorMsg}
                    </div>
                  )}
                </div>

                {/* Trust Footer */}
                <div className="py-4 text-center text-[11px] font-medium text-gray-500 flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6l-7-3Z" />
                    <path d="m9.5 12 1.8 1.8L15 10" />
                  </svg>
                  <span>100% Safe & Secure Payments • Genuine Amal Coolguard Products</span>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
