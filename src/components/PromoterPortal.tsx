import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, query, where, getDoc } from 'firebase/firestore';

export interface PromoterProfile {
  id: string; // Auto-generated code e.g. L01N (First Letter + Counter + Last Letter)
  name: string;
  phone: string;
  channelName?: string; // YouTube / Instagram channel
  paymentType: 'upi' | 'bank'; // 'upi' or 'bank'
  upiId?: string; // for receiving commission payouts
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  password?: string;
  createdAt: string;
  commissionPerSale: number; // default ₹100
  paidAmount?: number;
}

export default function PromoterPortal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(false);
  const [promoter, setPromoter] = useState<PromoterProfile | null>(() => {
    try {
      const saved = localStorage.getItem('amal_promoter_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Registration / Login Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [channelName, setChannelName] = useState('');
  const [paymentType, setPaymentType] = useState<'upi' | 'bank'>('upi');
  const [upiId, setUpiId] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Stats
  const [referredOrders, setReferredOrders] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (promoter) {
      loadPromoterOrders(promoter.id);
    }
  }, [promoter]);

  const loadPromoterOrders = async (promoterCode: string) => {
    setLoadingStats(true);
    let matched: any[] = [];
    try {
      // Check local storage orders first
      const localOrders = JSON.parse(localStorage.getItem('amal_orders') || '[]');
      const localMatched = localOrders.filter(
        (o: any) => o.referralCode?.toUpperCase() === promoterCode.toUpperCase() ||
                    o.promoterId?.toUpperCase() === promoterCode.toUpperCase()
      );
      matched = [...localMatched];
    } catch {}

    try {
      // Also fetch remote bookings if possible
      const q = query(collection(db, 'bookings'));
      const snap = await getDocs(q);
      const remoteMatched = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((o: any) => 
          o.referralCode?.toUpperCase() === promoterCode.toUpperCase() ||
          o.promoterId?.toUpperCase() === promoterCode.toUpperCase()
        );
      
      const seen = new Set(matched.map(m => m.orderId || m.id));
      for (const r of remoteMatched) {
        if (!seen.has(r.orderId || r.id)) {
          matched.push(r);
        }
      }
    } catch (err) {
      console.warn('Promoter remote orders fetch fallback:', err);
    }

    setReferredOrders(matched);
    setLoadingStats(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim() || !phone.trim()) {
      setErrorMsg('Please enter your Name and WhatsApp Mobile Number.');
      return;
    }

    if (paymentType === 'upi' && !upiId.trim()) {
      setErrorMsg('Please enter your UPI ID (e.g. name@okaxis) to receive payouts.');
      return;
    }

    if (paymentType === 'bank' && (!accountNumber.trim() || !ifscCode.trim())) {
      setErrorMsg('Please enter Bank Account Number and IFSC code.');
      return;
    }

    // Auto-generate promoter code from Name: First Letter + Counter (01, 02, 03...) + Last Letter
    // Example: "Libin" -> L + 01 + N = "L01N"
    const trimmedName = name.trim().toUpperCase().replace(/[^A-Z]/g, '');
    const firstLetter = trimmedName.charAt(0) || 'P';
    const lastLetter = trimmedName.length > 1 ? trimmedName.charAt(trimmedName.length - 1) : 'M';

    const allPromoters = JSON.parse(localStorage.getItem('amal_promoters_list') || '{}');
    let counterVal = Number(localStorage.getItem('amal_promoter_counter') || '1');
    let generatedCode = '';

    while (true) {
      const paddedNum = String(counterVal).padStart(2, '0'); // '01', '02', '03'...
      generatedCode = `${firstLetter}${paddedNum}${lastLetter}`;
      if (!allPromoters[generatedCode]) {
        break;
      }
      counterVal++;
    }

    // Save incremented counter
    localStorage.setItem('amal_promoter_counter', String(counterVal + 1));

    const newProfile: PromoterProfile = {
      id: generatedCode,
      name: name.trim(),
      phone: phone.trim(),
      channelName: channelName.trim() || 'YouTuber / Influencer',
      paymentType,
      upiId: paymentType === 'upi' ? upiId.trim() : undefined,
      bankName: paymentType === 'bank' ? bankName.trim() : undefined,
      accountNumber: paymentType === 'bank' ? accountNumber.trim() : undefined,
      ifscCode: paymentType === 'bank' ? ifscCode.trim().toUpperCase() : undefined,
      accountHolderName: paymentType === 'bank' ? (accountHolderName.trim() || name.trim()) : undefined,
      password: password.trim() || '123456',
      createdAt: new Date().toISOString(),
      commissionPerSale: 100, // ₹100 per coat
      paidAmount: 0
    };

    allPromoters[generatedCode] = newProfile;
    localStorage.setItem('amal_promoters_list', JSON.stringify(allPromoters));
    localStorage.setItem('amal_promoter_session', JSON.stringify(newProfile));

    try {
      await setDoc(doc(db, 'promoters', generatedCode), newProfile);
    } catch (err) {
      console.warn('Promoter firestore sync err:', err);
    }

    setPromoter(newProfile);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const inputVal = loginPhone.trim().toUpperCase();

    if (!inputVal) {
      setErrorMsg('Please enter your Mobile Number or Referral Code.');
      return;
    }

    const allPromoters = JSON.parse(localStorage.getItem('amal_promoters_list') || '{}');
    // Search by referral code or by phone number
    let found: PromoterProfile | null = allPromoters[inputVal] || null;
    if (!found) {
      found = Object.values(allPromoters).find(
        (p: any) => p.phone?.trim() === inputVal || p.phone?.replace(/\D/g, '') === inputVal.replace(/\D/g, '')
      ) as PromoterProfile || null;
    }

    if (!found) {
      setErrorMsg(`No promoter account found for "${inputVal}". Please register your Mobile Number first.`);
      return;
    }

    localStorage.setItem('amal_promoter_session', JSON.stringify(found));
    setPromoter(found);
  };

  const handleLogout = () => {
    localStorage.removeItem('amal_promoter_session');
    setPromoter(null);
  };

  const copyReferralLink = (paramType: 'promoter' | 'ref' = 'promoter') => {
    if (!promoter) return;
    const origin = window.location.origin;
    const fullLink = `${origin}/?${paramType}=${encodeURIComponent(promoter.id)}`;
    navigator.clipboard.writeText(fullLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const shareOnWhatsApp = () => {
    if (!promoter) return;
    const origin = window.location.origin;
    const fullLink = `${origin}/?promoter=${encodeURIComponent(promoter.id)}`;
    const text = encodeURIComponent(
      `🛡️ Amal Coolguard - Kerala's Best Sun Protection Vest & Coat!\n` +
      `Beat the summer heat while riding. Get genuine discounts using my special promoter link:\n👉 ${fullLink}\n` +
      `Promoter Code: ${promoter.id}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // Commission calculations
  const commissionRate = promoter?.commissionPerSale || 100;
  const confirmedSales = referredOrders.filter(o => o.status === 'confirmed').length;
  const pendingSales = referredOrders.filter(o => !o.status || o.status === 'pending' || o.status === 'pending_verification').length;
  const totalEarnedCommission = confirmedSales * commissionRate;
  const pendingCommission = pendingSales * commissionRate;
  const paidOutCommission = promoter?.paidAmount || 0;
  const balancePayable = Math.max(0, totalEarnedCommission - paidOutCommission);

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-24">
      {/* Top Header */}
      <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 px-4 py-3 sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-sm font-bold text-slate-400 hover:text-white flex items-center gap-1">
            <span>←</span> Store
          </Link>
          <div className="h-4 w-px bg-slate-700 mx-1"></div>
          <span className="font-black text-sm tracking-tight text-white flex items-center gap-1">
            <span>🤝</span>
            <span>Promoter & Affiliate Portal</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
              ₹100 / Sale
            </span>
          </span>
        </div>

        {promoter && (
          <button 
            onClick={handleLogout}
            className="text-[11px] font-extrabold text-red-400 hover:text-red-300 bg-red-950/50 border border-red-800/60 px-3 py-1.5 rounded-xl transition"
          >
            Logout 🚪
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto p-4 space-y-5">
        {!promoter ? (
          /* Authentication Screen */
          <div className="bg-slate-800/80 border border-slate-700/80 p-6 md:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-lg shadow-blue-500/30">
                💰
              </div>
              <h1 className="text-xl font-black text-white">
                {isLogin ? 'Promoter Sign In (ലോഗിൻ)' : 'Join as Amal Coolguard Promoter'}
              </h1>
              <p className="text-xs text-slate-400">
                Are you a YouTuber, Instagram creator, or influencer? Promote Amal Coolguard and earn{' '}
                <strong className="text-amber-400 font-extrabold">₹100 commission</strong> on every vest or coat sold via your link!
              </p>
            </div>

            {/* Toggle Sign Up / Sign In */}
            <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-2xl text-xs font-bold border border-slate-700">
              <button
                type="button"
                onClick={() => { setIsLogin(false); setErrorMsg(''); }}
                className={`py-2.5 rounded-xl transition ${!isLogin ? 'bg-blue-600 text-white shadow' : 'text-slate-400'}`}
              >
                Sign Up (രജിസ്റ്റർ ചെയ്യുക)
              </button>
              <button
                type="button"
                onClick={() => { setIsLogin(true); setErrorMsg(''); }}
                className={`py-2.5 rounded-xl transition ${isLogin ? 'bg-blue-600 text-white shadow' : 'text-slate-400'}`}
              >
                Sign In (ലോഗിൻ)
              </button>
            </div>

            <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4 text-xs">
              {!isLogin && (
                <>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Your Full Name (പേര്) *</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul V."
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">WhatsApp Mobile Number (മൊബൈൽ നമ്പർ) *</label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">YouTube Channel / Instagram Page Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Kerala Moto Vlogs / MotoTraveller"
                      value={channelName}
                      onChange={e => setChannelName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Payment Receiving Method: UPI or Bank Account */}
                  <div className="bg-slate-900/90 border border-slate-700/80 p-3.5 rounded-2xl space-y-3">
                    <label className="block font-bold text-slate-200">
                      Commission Payout Method (കമ്മീഷൻ സ്വീകരിക്കേണ്ട രീതി) *
                    </label>

                    {/* Radio Switcher: UPI vs Bank Account */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentType('upi')}
                        className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
                          paymentType === 'upi'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        <span>📱</span> UPI ID
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentType('bank')}
                        className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
                          paymentType === 'bank'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        <span>🏦</span> Bank Account
                      </button>
                    </div>

                    {paymentType === 'upi' ? (
                      <div className="pt-1">
                        <label className="block font-bold text-slate-300 mb-1">
                          UPI ID for Payouts (UPI ഐഡി) *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. vincentlibin487-5@okicici / 9876543210@paytm"
                          required={paymentType === 'upi'}
                          value={upiId}
                          onChange={e => setUpiId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2.5 pt-1">
                        <div>
                          <label className="block font-bold text-slate-300 mb-1">Account Holder Name *</label>
                          <input
                            type="text"
                            placeholder="Name as per bank passbook"
                            required={paymentType === 'bank'}
                            value={accountHolderName}
                            onChange={e => setAccountHolderName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold text-slate-300 mb-1">Bank Name</label>
                            <input
                              type="text"
                              placeholder="e.g. SBI, Federal, HDFC"
                              value={bankName}
                              onChange={e => setBankName(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-300 mb-1">IFSC Code *</label>
                            <input
                              type="text"
                              placeholder="e.g. SBIN0001234"
                              required={paymentType === 'bank'}
                              value={ifscCode}
                              onChange={e => setIfscCode(e.target.value.toUpperCase())}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block font-bold text-slate-300 mb-1">Bank Account Number *</label>
                          <input
                            type="text"
                            placeholder="Enter bank account number"
                            required={paymentType === 'bank'}
                            value={accountNumber}
                            onChange={e => setAccountNumber(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Auto-generated Referral Code Notice */}
                  <div className="bg-gradient-to-r from-blue-950/60 to-purple-950/60 border border-blue-800/60 p-3.5 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-blue-300 font-extrabold uppercase tracking-wider">
                        Auto-Generated Unique Referral Code
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        {name.trim() ? (
                          <>
                            Generated from name:{' '}
                            <span className="font-mono font-black text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              {name.trim().charAt(0).toUpperCase()}01{name.trim().charAt(name.trim().length - 1).toUpperCase()}
                            </span>
                          </>
                        ) : (
                          'Your unique code (e.g. L01N) will be automatically created!'
                        )}
                      </p>
                    </div>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                      ⚡ Auto Code
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Set Password (പാസ്‌വേഡ്) *</label>
                    <input
                      type="password"
                      placeholder="Enter a secret password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {isLogin && (
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Registered Mobile Number or Referral Code *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your 10-digit mobile or referral code"
                    required
                    value={loginPhone}
                    onChange={e => setLoginPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Enter the mobile number you used while creating promoter account.</p>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 font-bold text-center text-xs">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 active:scale-98 text-white font-black py-3.5 rounded-xl shadow-lg shadow-blue-500/20 text-xs transition"
              >
                {isLogin ? 'Sign In to Promoter Dashboard' : 'Create Promoter Account & Get Link (തുടങ്ങാം)'}
              </button>
            </form>
          </div>
        ) : (
          /* Active Promoter Dashboard */
          <div className="space-y-5">
            {/* Promoter Profile Card */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/80 p-5 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest bg-blue-950/70 border border-blue-800 px-2 py-0.5 rounded-full inline-block mb-1.5">
                    Official Amal Coolguard Promoter
                  </span>
                  <h2 className="text-xl font-black text-white">{promoter.name}</h2>
                  <p className="text-xs text-slate-400">{promoter.channelName || 'Affiliate Partner'} • 📱 {promoter.phone}</p>
                  {promoter.paymentType === 'bank' ? (
                    <div className="text-xs text-emerald-400 font-semibold mt-1">
                      <span>🏦 Bank: {promoter.bankName || 'A/C'} • {promoter.accountNumber} • IFSC: {promoter.ifscCode}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-400 font-semibold mt-1">📱 UPI: {promoter.upiId || 'N/A'}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase">Commission Rate</span>
                  <span className="text-lg font-black text-amber-400">₹{commissionRate}</span>
                  <span className="text-[10px] text-slate-400 block">per vest sold</span>
                </div>
              </div>
            </div>

            {/* Shareable Link Box */}
            <div className="bg-blue-950/40 border border-blue-800/60 p-5 rounded-3xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔗</span> Your Dedicated Referral Link
                </span>
                <span className="text-xs font-mono font-black text-amber-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                  CODE: {promoter.id}
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl flex items-center justify-between gap-2 overflow-hidden">
                <span className="text-xs text-amber-400 font-mono truncate font-bold">
                  {window.location.origin}/?promoter={promoter.id}
                </span>
                <button
                  type="button"
                  onClick={() => copyReferralLink('promoter')}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-xl shadow shrink-0 transition"
                >
                  {copiedLink ? '✓ Copied!' : 'Copy Link'}
                </button>
              </div>

              <p className="text-[11px] text-slate-400">
                Share this link in your YouTube video descriptions, Instagram bio, or WhatsApp groups. When buyers click your link and open the storefront to order a coat, your promoter code ({promoter.id}) is automatically recorded with their delivery address!
              </p>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={shareOnWhatsApp}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-2.5 px-3 rounded-xl shadow flex items-center justify-center gap-1.5 transition"
                >
                  <span>💬</span> Share Link on WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => copyReferralLink('promoter')}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs py-2.5 px-3 rounded-xl border border-slate-700 shadow flex items-center justify-center gap-1.5 transition"
                >
                  <span>📋</span> Copy Full Link
                </button>
              </div>
            </div>

            {/* Commission Analytics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-slate-400">Total Referred Orders</p>
                <p className="text-2xl font-black text-white mt-1">{referredOrders.length}</p>
                <span className="text-[10px] text-slate-500">All customer clicks</span>
              </div>

              <div className="bg-slate-800/80 border border-amber-800/60 bg-amber-950/20 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-amber-300">Pending Verification</p>
                <p className="text-2xl font-black text-amber-400 mt-1">{pendingSales}</p>
                <span className="text-[10px] text-amber-400/70">₹{pendingCommission} pending</span>
              </div>

              <div className="bg-slate-800/80 border border-emerald-800/60 bg-emerald-950/20 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-emerald-300">Confirmed Sales</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{confirmedSales}</p>
                <span className="text-[10px] text-emerald-400/70">Approved by Admin</span>
              </div>

              <div className="bg-slate-800/80 border border-indigo-800/60 bg-indigo-950/20 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-indigo-300">Total Earned</p>
                <p className="text-2xl font-black text-indigo-400 mt-1">₹{totalEarnedCommission}</p>
                <span className="text-[10px] text-indigo-400/70">Payout via UPI</span>
              </div>
            </div>

            {/* Referred Orders Breakdown */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-3xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                <div>
                  <h3 className="font-black text-sm text-white">Referred Orders & Sales History</h3>
                  <p className="text-[11px] text-slate-400">Real-time status of orders placed via your code ({promoter.id})</p>
                </div>
                <button
                  type="button"
                  onClick={() => loadPromoterOrders(promoter.id)}
                  className="text-xs font-bold text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>🔄</span> Refresh
                </button>
              </div>

              {loadingStats ? (
                <div className="p-8 text-center text-xs text-slate-400">Updating orders...</div>
              ) : referredOrders.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-slate-700 rounded-2xl space-y-2">
                  <span className="text-3xl block">📦</span>
                  <p className="font-bold text-slate-300">No orders placed via your link yet</p>
                  <p className="text-slate-500">
                    Share your referral link on YouTube or WhatsApp to start earning ₹{commissionRate} on each order!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referredOrders.map((ord, idx) => {
                    const isConfirmed = ord.status === 'confirmed';
                    const isCancelled = ord.status === 'cancelled' || ord.status === 'rejected';

                    return (
                      <div
                        key={ord.orderId || ord.id || idx}
                        className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-black text-white text-xs">{ord.orderId || ord.id}</span>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                              isConfirmed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                              isCancelled ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                              'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {isConfirmed ? '✓ Approved' : isCancelled ? 'Cancelled' : '⏳ Pending'}
                            </span>
                          </div>
                          <p className="text-slate-300 font-bold">{ord.productName || 'Amal Coolguard Vest'}</p>
                          <p className="text-[11px] text-slate-500">
                            Customer: {ord.customerName || 'Customer'} • {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : 'Recent'}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase">Commission</span>
                          <span className={`font-black text-sm ${isConfirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
                            +₹{commissionRate}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {isConfirmed ? 'Credited' : 'Pending Verification'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
