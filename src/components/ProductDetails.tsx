import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, addDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { MOCK_PRODUCTS, Product } from '../data/mockProducts';

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Synchronous initial product state lookup for instant rendering
  const [product, setProduct] = useState<Product | null>(() => {
    try {
      if (!id) return MOCK_PRODUCTS[0];
      const cachedRemote = localStorage.getItem('amal_cached_products');
      if (cachedRemote) {
        const parsed = JSON.parse(cachedRemote);
        const hit = parsed.find((p: any) => p.id === id);
        if (hit) return hit;
      }
      const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
      const foundCustom = customLocal.find((p: any) => p.id === id);
      if (foundCustom) return foundCustom;
      return MOCK_PRODUCTS.find(p => p.id === id) || MOCK_PRODUCTS[0];
    } catch {
      return MOCK_PRODUCTS[0];
    }
  });
  const [loading, setLoading] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
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

  // Customer order form state with auto-fill from logged in session
  const [formData, setFormData] = useState(() => {
    try {
      const session = JSON.parse(localStorage.getItem('amal_customer_session') || 'null');
      const savedAddress = localStorage.getItem('amal_saved_address') || '';
      const savedPincode = localStorage.getItem('amal_saved_pincode') || '';
      return {
        customerName: session?.name || '',
        phoneNumber: session?.mobile || '',
        address: session?.address || savedAddress || '',
        pincode: session?.pincode || savedPincode || '',
        paymentMethod: 'UPI',
        merchantUpiId: 'amalcoolguard@upi',
        whatsappNumber: '6238113451'
      };
    } catch {
      return {
        customerName: '',
        phoneNumber: '',
        address: '',
        pincode: '',
        paymentMethod: 'UPI',
        merchantUpiId: 'amalcoolguard@upi',
        whatsappNumber: '6238113451'
      };
    }
  });

  useEffect(() => {
    let isMounted = true;

    // Load admin payment settings
    const savedSettings = JSON.parse(localStorage.getItem('amal_payment_settings') || 'null');
    if (savedSettings) {
      setFormData(prev => ({
        ...prev,
        paymentMethod: savedSettings.enableUPI ? 'UPI' : savedSettings.enableCOD ? 'COD' : 'Card',
        merchantUpiId: savedSettings.merchantUpiId || prev.merchantUpiId,
        whatsappNumber: savedSettings.whatsappNumber || prev.whatsappNumber || '6238113451'
      }));
    }

    const fetchProduct = async () => {
      try {
        if (id) {
          const docRef = doc(db, 'products', id);
          const fetchPromise = getDoc(docRef);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 1200)
          );
          const docSnap = await Promise.race([fetchPromise, timeoutPromise]);
          if (docSnap.exists() && isMounted) {
            const data = docSnap.data();
            setProduct({
              id: docSnap.id,
              name: data.name || 'Amal Coolguard Vest',
              price: data.price || 2499,
              discountPrice: data.discountPrice || data.price || 1999,
              description: data.description || 'Premium heat protection cooling vest for bike riders.',
              imageUrl: data.imageUrl || 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600',
              galleryImages: data.galleryImages || (data.imageUrl ? [data.imageUrl] : []),
              category: data.category || 'Coats',
              rating: data.rating || 4.8,
              reviewsCount: data.reviewsCount || 120,
              features: data.features || ['Heat Reflective', 'UV Protection', 'Water Resistant'],
            });
            return;
          }
        }
      } catch (err) {
        // Fallback silently
      }

      if (isMounted) {
        // Search in local custom products
        const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
        const foundCustom = customLocal.find((p: any) => p.id === id);

        const mockItem = foundCustom || MOCK_PRODUCTS.find(p => p.id === id) || MOCK_PRODUCTS[0];
        setProduct(mockItem);
      }
    };

    fetchProduct();

    // Load local reviews for this product
    const localRev = JSON.parse(localStorage.getItem(`amal_reviews_${id}`) || '[]');
    if (localRev.length > 0) {
      setReviewsList(prev => [...localRev, ...prev]);
    }

    return () => { isMounted = false; };
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

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingScreenshot(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setScreenshotPreview(result);
        setUploadingScreenshot(false);

        // Update local storage order if present
        if (submittedOrderId) {
          const localOrders = JSON.parse(localStorage.getItem('amal_orders') || '[]');
          const updated = localOrders.map((o: any) => 
            o.orderId === submittedOrderId ? { ...o, screenshot: result, status: 'pending_verification' } : o
          );
          localStorage.setItem('amal_orders', JSON.stringify(updated));
        }

        // Update Firestore document if doc ID exists
        if (submittedDocId) {
          updateDoc(doc(db, 'bookings', submittedDocId), {
            paymentScreenshot: result,
            status: 'pending_verification',
          }).catch(err => console.warn('Firestore update screenshot err:', err));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setSubmitting(true);

    // Generate sequential Order ID starting with 'A' + 6 digit counter (A000001, A000002...)
    let currentCounter = 1;
    try {
      const counterDoc = await getDoc(doc(db, 'settings', 'order_counter'));
      if (counterDoc.exists()) {
        currentCounter = counterDoc.data().nextVal || 1;
      } else {
        const localVal = Number(localStorage.getItem('amal_order_sequence_counter') || '1');
        currentCounter = localVal;
      }
    } catch (err) {
      currentCounter = Number(localStorage.getItem('amal_order_sequence_counter') || '1');
    }

    const orderId = 'A' + String(currentCounter).padStart(6, '0');
    const nextCounter = currentCounter + 1;
    localStorage.setItem('amal_order_sequence_counter', String(nextCounter));
    setDoc(doc(db, 'settings', 'order_counter'), { nextVal: nextCounter }).catch(err => console.warn('Counter sync err:', err));

    const amount = product.discountPrice || product.price;

    // Check active promoter referral code
    const activeRefCode = localStorage.getItem('amal_active_referral_code') || null;

    let createdDocId: string | null = null;
    try {
      const docRef = await addDoc(collection(db, 'bookings'), {
        orderId,
        productId: product.id,
        productName: product.name,
        price: amount,
        customerName: formData.customerName,
        phoneNumber: formData.phoneNumber,
        address: formData.address,
        pincode: formData.pincode,
        paymentMethod: formData.paymentMethod,
        referralCode: activeRefCode,
        promoterId: activeRefCode,
        promoterCommission: activeRefCode ? 100 : 0,
        status: 'pending_verification',
        paymentScreenshot: screenshotPreview || null,
        createdAt: serverTimestamp(),
      });
      createdDocId = docRef.id;
    } catch (error) {
      console.warn('Saved locally due to offline/permission:', error);
    }

    const localOrders = JSON.parse(localStorage.getItem('amal_orders') || '[]');
    localOrders.unshift({
      orderId,
      docId: createdDocId,
      productId: product.id,
      productName: product.name,
      price: amount,
      customerName: formData.customerName,
      phoneNumber: formData.phoneNumber,
      address: formData.address,
      pincode: formData.pincode,
      paymentMethod: formData.paymentMethod,
      referralCode: activeRefCode,
      promoterId: activeRefCode,
      promoterCommission: activeRefCode ? 100 : 0,
      status: 'pending_verification',
      screenshot: screenshotPreview || null,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem('amal_orders', JSON.stringify(localOrders));

    // Save default delivery address for future orders
    if (formData.address) {
      localStorage.setItem('amal_saved_address', formData.address);
    }
    if (formData.pincode) {
      localStorage.setItem('amal_saved_pincode', formData.pincode);
    }

    // Also update registered user's saved address in customer dictionary
    if (formData.phoneNumber) {
      const regUsers = JSON.parse(localStorage.getItem('amal_registered_users') || '{}');
      if (regUsers[formData.phoneNumber]) {
        regUsers[formData.phoneNumber].address = formData.address;
        regUsers[formData.phoneNumber].pincode = formData.pincode;
        localStorage.setItem('amal_registered_users', JSON.stringify(regUsers));
      }
    }

    setSubmitting(false);
    setSubmittedOrderId(orderId);
    setSubmittedDocId(createdDocId);

    // Trigger UPI app launch if UPI payment selected
    if (formData.paymentMethod === 'UPI') {
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
      <div className="min-h-screen bg-gray-50 p-6 text-center">
        <p className="text-red-500 font-bold mb-4">Product not found</p>
        <Link to="/" className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold">Back to Shop</Link>
      </div>
    );
  }

  const imagesList = product.galleryImages && product.galleryImages.length > 0 
    ? product.galleryImages 
    : [
        product.imageUrl,
        'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600',
        'https://images.unsplash.com/photo-1554568218-0f1715e72254?w=600',
        'https://images.unsplash.com/photo-1523381210434-271e8be1952b?w=600'
      ];

  const discountPercent = product.price && product.discountPrice 
    ? Math.round(((product.price - product.discountPrice) / product.price) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gray-100 pb-28">
      {/* Header */}
      <div className="bg-white px-4 py-3 shadow-sm flex items-center justify-between sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-700 font-bold text-lg flex items-center gap-1">
          ← Back
        </button>
        <h1 className="font-bold text-gray-800 text-base truncate max-w-[200px]">{product.name}</h1>
        <Link to="/" className="text-xl">🏠</Link>
      </div>

      {/* Main Image Gallery */}
      <div className="bg-white p-4">
        <div className="relative w-full h-80 bg-gray-50 rounded-2xl overflow-hidden mb-3">
          <img 
            src={imagesList[selectedImageIndex]} 
            alt={product.name} 
            className="w-full h-full object-cover transition-all duration-300"
          />
          {discountPercent > 0 && (
            <span className="absolute top-3 left-3 bg-red-600 text-white text-xs font-extrabold px-3 py-1 rounded-full shadow">
              {discountPercent}% OFF
            </span>
          )}
        </div>

        {/* Thumbnails */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {imagesList.map((img, idx) => (
            <button 
              key={idx}
              onClick={() => setSelectedImageIndex(idx)}
              className={`w-16 h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 ${
                selectedImageIndex === idx ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-200 opacity-70'
              }`}
            >
              <img src={img} alt="thumb" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {/* Product Information */}
      <div className="bg-white mt-2 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full uppercase">
            {product.category}
          </span>
          <div className="flex items-center gap-1 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-md">
            ★ {product.rating || 4.8} ({reviewsList.length} reviews)
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-900 leading-tight mb-3">{product.name}</h2>

        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-3xl font-extrabold text-gray-900">₹{product.discountPrice}</span>
          {product.price && product.price > product.discountPrice && (
            <span className="text-base text-gray-400 line-through">₹{product.price}</span>
          )}
          <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
            Inclusive of all taxes
          </span>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
          {product.description}
        </p>

        {/* Key Features */}
        <div className="mb-6">
          <h3 className="font-bold text-sm text-gray-800 mb-3 uppercase tracking-wider">Product Highlights</h3>
          <div className="grid grid-cols-2 gap-2">
            {(product.features || ['Heat Reflective Fabric', 'UV Sun Shield', 'Water Resistant', 'Lightweight Design']).map((feature, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-blue-50/60 p-3 rounded-xl border border-blue-100/60 text-xs font-medium text-blue-900">
                <span className="text-blue-600">✓</span>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Customer Guarantee */}
        <div className="border-t pt-4 grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
          <div className="p-2 bg-gray-50 rounded-lg">
            <p className="text-base mb-1">🚚</p>
            <p className="font-semibold">Fast Delivery</p>
          </div>
          <div className="p-2 bg-gray-50 rounded-lg">
            <p className="text-base mb-1">📱</p>
            <p className="font-semibold">Auto UPI Launch</p>
          </div>
          <div className="p-2 bg-gray-50 rounded-lg">
            <p className="text-base mb-1">🛡️</p>
            <p className="font-semibold">Admin Verification</p>
          </div>
        </div>
      </div>

      {/* Customer Reviews & Rating Submission Section */}
      <div className="bg-white mt-2 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base text-gray-900">Customer Reviews & Ratings</h3>
          <button 
            onClick={() => setShowReviewForm(!showReviewForm)}
            className="bg-blue-50 text-blue-700 text-xs font-extrabold px-3 py-1.5 rounded-xl border border-blue-200"
          >
            {showReviewForm ? '✕ Close' : '★ Write a Review'}
          </button>
        </div>

        {/* Interactive Review Form */}
        {showReviewForm && (
          <form onSubmit={handleReviewSubmit} className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 mb-4 space-y-3">
            <p className="text-xs font-bold text-blue-900">Add Rating & Details (റേറ്റിംഗ് സമർപ്പിക്കുക):</p>
            
            {/* Star Rating selector */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Select Rating Stars:</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => setNewRating(star)}
                    className={`text-2xl transition hover:scale-110 ${star <= newRating ? 'text-amber-500 scale-110' : 'text-gray-300'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <textarea 
              placeholder="പ്രോഡക്റ്റിനെ കുറിച്ച് പറയാനുള്ള ഡീറ്റെയിൽസ് ഇവിടെ ടൈപ്പ് ചെയ്യുക... (Type your product review/details here)"
              required
              rows={3}
              value={reviewerComment}
              onChange={e => setReviewerComment(e.target.value)}
              className="w-full p-3 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs shadow hover:bg-blue-700 active:scale-98 transition"
            >
              💾 Save Rating & Review (സേവ് ചെയ്യുക)
            </button>
          </form>
        )}

        {/* Reviews List */}
        <div className="space-y-3">
          {reviewsList.map((rev, idx) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-xl text-xs border border-gray-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">{rev.name} ({rev.location})</span>
                <span className="text-amber-500 font-bold">
                  {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                </span>
              </div>
              <p className="text-gray-700 leading-relaxed">{rev.comment}</p>
              <p className="text-[10px] text-gray-400 text-right">{rev.date}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-14 left-0 right-0 bg-white border-t p-3 flex gap-3 shadow-2xl z-40">
        <button 
          onClick={() => setShowOrderModal(true)}
          className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-extrabold text-base py-3.5 px-4 rounded-xl shadow-lg hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-2"
        >
          <span>🛒</span>
          <span>ORDER NOW - ₹{product.discountPrice}</span>
        </button>
      </div>

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
                  Your order <span className="font-bold">#{submittedOrderId}</span> is recorded in <span className="font-bold text-amber-700">PENDING status</span>. Please upload your payment screenshot below. Admin will verify and confirm your order.
                </p>

                {/* Upload Payment Screenshot Box */}
                <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-4 rounded-2xl text-left space-y-3">
                  <p className="text-xs font-bold text-amber-900 flex items-center gap-1">
                    <span>📷</span> Upload Payment Screenshot (യുപിഐ പേയ്‌മെന്റ് സ്ക്രീൻഷോട്ട്):
                  </p>
                  
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
                        Take a screenshot of your GPay/PhonePe/Paytm payment and upload here to speed up approval.
                      </p>
                    </div>
                  )}

                  {formData.paymentMethod === 'UPI' && (
                    <button
                      type="button"
                      onClick={() => triggerUpiPayment(submittedOrderId, product.discountPrice || product.price)}
                      className="w-full bg-blue-600 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1 shadow-sm mt-2"
                    >
                      <span>📱</span> Re-open UPI App (GPay / PhonePe / Paytm)
                    </button>
                  )}

                  {/* Direct WhatsApp Support Contact Button */}
                  <a
                    href={`https://wa.me/91${formData.whatsappNumber || '6238113451'}?text=${encodeURIComponent(
                      `Hello Amal Coolguard Customer Care,\nI have submitted my order & uploaded payment screenshot!\n\nOrder ID: #${submittedOrderId}\nProduct: ${product.name}\nAmount: ₹${product.discountPrice}\nCustomer: ${formData.customerName}\nPhone: ${formData.phoneNumber}\nAddress: ${formData.address}`
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
                  <p><span className="font-bold">Total Amount:</span> ₹{product.discountPrice}</p>
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
                  <h3 className="text-base font-bold text-gray-900">Book / Order Details</h3>
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
                    <p className="text-sm font-extrabold text-blue-700">₹{product.discountPrice}</p>
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
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[
                      { id: 'UPI', label: '⚡ UPI / GPay' },
                      { id: 'COD', label: '💵 Cash on Delivery' },
                      { id: 'Card', label: '💳 Card / NetBank' }
                    ].map(method => (
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

                  {formData.paymentMethod === 'UPI' && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-3 rounded-xl text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-900">📲 Mobile UPI Launcher</span>
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">GPay / PhonePe / Paytm</span>
                      </div>
                      <p className="text-[11px] text-gray-600">
                        When you submit, your mobile UPI app will open. Upload the payment screenshot on the next screen for Admin approval.
                      </p>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Store / Merchant UPI ID</label>
                        <input 
                          type="text" 
                          value={formData.merchantUpiId}
                          onChange={e => setFormData({ ...formData, merchantUpiId: e.target.value })}
                          className="w-full p-2 text-xs border border-gray-300 rounded-lg outline-none bg-white font-mono"
                          placeholder="e.g. amalcoolguard@upi"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white font-extrabold py-3.5 rounded-xl shadow-lg hover:brightness-110 active:scale-98 transition mt-2 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  <span>⏳</span>
                  <span>{submitting ? 'Saving Order...' : `Submit Order (Pending Verification) • ₹${product.discountPrice}`}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
