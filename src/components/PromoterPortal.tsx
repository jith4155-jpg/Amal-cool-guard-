import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getCleanStoreBaseUrl,
  getPromoterShareLink,
} from '../utils/storeSync';
import { ThemeSwitcher } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export default function PromoterPortal() {
  const {
    user,
    authReady,
    profile,
    myPromoter,
    myPromoterSales,
    loadingPromoter,
    signingIn,
    signInWithGoogle,
    logout,
    refreshMyPromoter,
    registerMyPromoter,
  } = useAuth();

  // Registration Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channelName, setChannelName] = useState('');
  const [paymentType, setPaymentType] = useState<'upi' | 'bank'>('upi');
  const [upiId, setUpiId] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Pre-fill Name & Mobile from authenticated user's profile
  useEffect(() => {
    if (user) {
      setName(prev => prev || profile?.name || user.displayName || '');
      setPhone(prev => prev || profile?.mobile || '');
    }
  }, [user, profile]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!user) {
      setErrorMsg('Please sign in with your Gmail account first.');
      return;
    }

    if (!name.trim() || !phone.trim()) {
      setErrorMsg('Please enter your Full Name and WhatsApp Mobile Number.');
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

    setSubmitting(true);
    try {
      await registerMyPromoter({
        name: name.trim(),
        phone: phone.trim(),
        channelName: channelName.trim() || 'YouTuber / Influencer',
        paymentType,
        upiId: paymentType === 'upi' ? upiId.trim() : undefined,
        bankName: paymentType === 'bank' ? bankName.trim() : undefined,
        accountNumber: paymentType === 'bank' ? accountNumber.trim() : undefined,
        ifscCode: paymentType === 'bank' ? ifscCode.trim().toUpperCase() : undefined,
        accountHolderName: paymentType === 'bank' ? accountHolderName.trim() || name.trim() : undefined,
      });
    } catch {
      setErrorMsg('Could not complete registration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const storeBaseUrl = getCleanStoreBaseUrl();
  const fullReferralLink = myPromoter ? getPromoterShareLink(myPromoter.id, storeBaseUrl) : '';
  const whatsappShareUrl = myPromoter
    ? `https://wa.me/?text=${encodeURIComponent(fullReferralLink)}`
    : '#';

  const copyReferralLink = () => {
    if (!myPromoter || !fullReferralLink) return;
    navigator.clipboard.writeText(fullReferralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Commission calculations
  const commissionRate = myPromoter?.commissionPerSale || 100;
  const confirmedSales = myPromoterSales.filter(o => o.status === 'confirmed').length;
  const pendingSales = myPromoterSales.filter(
    o => !o.status || o.status === 'pending' || o.status === 'pending_verification'
  ).length;
  const totalEarnedCommission = confirmedSales * commissionRate;
  const pendingCommission = pendingSales * commissionRate;
  const paidOutCommission = myPromoter?.paidAmount || 0;
  const balancePayable = Math.max(0, totalEarnedCommission - paidOutCommission);

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-24">
      {/* Top Header */}
      <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 px-4 py-3 sticky top-0 z-40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="text-sm font-bold text-slate-400 hover:text-white flex items-center gap-1 shrink-0">
            <span>←</span> Store
          </Link>
          <div className="h-4 w-px bg-slate-700 mx-1 shrink-0"></div>
          <span className="font-black text-sm tracking-tight text-white flex items-center gap-1.5 truncate">
            <span>🤝</span>
            <span className="truncate">Promoter Portal</span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ThemeSwitcher compact />
          {user && (
            <>
              <Link
                to="/account"
                className="text-[11px] font-bold text-blue-300 bg-blue-950/60 border border-blue-800 px-2.5 py-1.5 rounded-xl"
              >
                👤 Profile
              </Link>
              <button
                onClick={() => logout()}
                className="text-[11px] font-extrabold text-red-400 hover:text-red-300 bg-red-950/50 border border-red-800/60 px-2.5 py-1.5 rounded-xl transition"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto p-4 space-y-5">
        {!authReady || (user && loadingPromoter && !myPromoter) ? (
          <div className="bg-slate-800/80 border border-slate-700 p-10 rounded-3xl text-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-slate-300">Checking Gmail promoter status...</p>
          </div>
        ) : !user ? (
          /* Step 1: Must sign in with Gmail before accessing Promoter Sign-Up or Dashboard */
          <div className="bg-slate-800/80 border border-slate-700/80 p-6 md:p-8 rounded-3xl shadow-xl space-y-5 text-center">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-lg shadow-blue-500/30">
              ✉️
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-black text-white">
                Promoter Login & Sign Up (Gmail)
              </h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                നിങ്ങളുടെ സ്വന്തം പ്രൊമോഷൻ ലിങ്ക് എടുക്കാനും, ആ ലിങ്ക് വഴി എത്ര പേർ വാങ്ങി എന്ന് കാണാനും നിങ്ങളുടെ <b>Gmail അക്കൗണ്ട്</b> ഉപയോഗിച്ച് ലോഗിൻ ചെയ്യുക.
              </p>
              <p className="text-[11px] text-slate-400">
                (Sign in with your Gmail to register as a Promoter or open your existing Promoter Dashboard)
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                setErrorMsg('');
                const res = await signInWithGoogle();
                if (res.error) setErrorMsg(res.error);
              }}
              disabled={signingIn}
              className="w-full bg-white hover:bg-slate-100 text-slate-900 font-black py-3.5 px-4 rounded-2xl shadow-lg transition flex items-center justify-center gap-3 text-xs disabled:opacity-60"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
              </svg>
              <span>
                {signingIn
                  ? 'Signing in with Google...'
                  : 'Continue with Google / Gmail (ലോഗിൻ ചെയ്യുക)'}
              </span>
            </button>

            {errorMsg && (
              <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 font-bold text-xs">
                {errorMsg}
              </div>
            )}

            <div className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-3.5 text-left text-[11px] text-slate-300 space-y-1">
              <p className="font-extrabold text-amber-400">✓ Gmail Security Lock</p>
              <p>• ഓരോ പ്രൊമോട്ടർക്കും അവരുടെ Gmail വഴി ലോഗിൻ ചെയ്യുമ്പോൾ മാത്രമേ സ്വന്തം ലിങ്കും വിറ്റ പ്രോഡക്റ്റുകളുടെ എണ്ണവും പ്രൊഫൈലും കാണാൻ കഴിയൂ.</p>
            </div>
          </div>
        ) : !myPromoter ? (
          /* Step 2: Signed in with Gmail, not yet registered as a Promoter -> Show Sign-Up Form */
          <div className="bg-slate-800/80 border border-slate-700/80 p-6 md:p-8 rounded-3xl shadow-xl space-y-5">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-lg shadow-blue-500/30">
                💰
              </div>
              <h1 className="text-xl font-black text-white">
                Promoter Sign Up (പ്രൊമോഷൻ അക്കൗണ്ട് തുടങ്ങാം)
              </h1>
              <p className="text-xs text-slate-300">
                Register with your verified Gmail & Phone Number to get your unique storefront link and earn{' '}
                <strong className="text-amber-400 font-extrabold">₹100 commission</strong> per order!
              </p>
            </div>

            {/* Verified Gmail Banner */}
            <div className="bg-blue-950/60 border border-blue-800/70 p-3 rounded-2xl flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-blue-300 uppercase">Verified Gmail Account</p>
                <p className="text-xs font-extrabold text-white truncate">✉️ {user.email}</p>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-500/30 shrink-0">
                ✓ Linked
              </span>
            </div>

            <form onSubmit={handleRegister} className="space-y-4 text-xs">
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
                      placeholder="e.g. name@okicici / 9876543210@paytm"
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
                    Auto-Generated Unique Promoter ID
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
                      'Your unique ID (e.g. L01N) will be automatically created!'
                    )}
                  </p>
                </div>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                  ⚡ Auto ID
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 font-bold text-center text-xs">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 active:scale-98 text-white font-black py-3.5 rounded-xl shadow-lg shadow-blue-500/20 text-xs transition disabled:opacity-60"
              >
                {submitting
                  ? 'Creating Your Promoter Link...'
                  : 'Create Promoter Account & Get Link (തുടങ്ങാം)'}
              </button>
            </form>
          </div>
        ) : (
          /* Step 3: Logged-in Registered Promoter Dashboard (Exclusive to this Gmail) */
          <div className="space-y-5">
            {/* Promoter Profile Card */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/80 p-5 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest bg-blue-950/70 border border-blue-800 px-2 py-0.5 rounded-full inline-block mb-1.5">
                    Verified Promoter • ✉️ {user.email}
                  </span>
                  <h2 className="text-xl font-black text-white truncate">{myPromoter.name}</h2>
                  <p className="text-xs text-slate-300">
                    {myPromoter.channelName || 'Affiliate Partner'} • 📱 {myPromoter.phone}
                  </p>
                  {myPromoter.paymentType === 'bank' ? (
                    <div className="text-xs text-emerald-400 font-semibold mt-1">
                      <span>🏦 Bank: {myPromoter.bankName || 'A/C'} • {myPromoter.accountNumber} • IFSC: {myPromoter.ifscCode}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-400 font-semibold mt-1">📱 UPI: {myPromoter.upiId || 'N/A'}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-400 block uppercase">Commission Rate</span>
                  <span className="text-lg font-black text-amber-400">₹{commissionRate}</span>
                  <span className="text-[10px] text-slate-400 block">per product sold</span>
                </div>
              </div>
            </div>

            {/* Shareable Link Box */}
            <div className="bg-blue-950/40 border border-blue-800/60 p-5 rounded-3xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔗</span> Your Shareable Store Link
                </span>
                <span className="text-xs font-mono font-black text-amber-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                  ID: {myPromoter.id}
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl flex items-center justify-between gap-2 overflow-hidden">
                <span className="text-xs text-amber-400 font-mono truncate font-bold">
                  {fullReferralLink}
                </span>
                <button
                  type="button"
                  onClick={copyReferralLink}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-xl shadow shrink-0 transition"
                >
                  {copiedLink ? '✓ Copied!' : 'Copy Link'}
                </button>
              </div>

              <p className="text-[11px] text-slate-300">
                ഈ ലിങ്ക് ഷെയർ ചെയ്യുമ്പോൾ വരുന്ന എല്ലാ ഓർഡറുകളും നിങ്ങളുടെ പ്രൊഫൈലിലും ({user.email}) ഇവിടെയും കൃത്യമായി കാണാൻ സാധിക്കും.
              </p>

              <div className="flex gap-2 pt-1">
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-2.5 px-3 rounded-xl shadow flex items-center justify-center gap-1.5 transition"
                >
                  <span>💬</span> Share Link on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={copyReferralLink}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs py-2.5 px-3 rounded-xl border border-slate-700 shadow flex items-center justify-center gap-1.5 transition"
                >
                  <span>📋</span> {copiedLink ? '✓ Copied!' : 'Copy Full Link'}
                </button>
              </div>
            </div>

            {/* Commission Analytics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-slate-300">Total Products Sold</p>
                <p className="text-2xl font-black text-white mt-1">{myPromoterSales.length}</p>
                <span className="text-[10px] text-slate-400">Orders via your link</span>
              </div>

              <div className="bg-slate-800/80 border border-amber-800/60 bg-amber-950/20 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-amber-300">Pending Verification</p>
                <p className="text-2xl font-black text-amber-400 mt-1">{pendingSales}</p>
                <span className="text-[10px] text-amber-300/80">₹{pendingCommission} pending</span>
              </div>

              <div className="bg-slate-800/80 border border-emerald-800/60 bg-emerald-950/20 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-emerald-300">Confirmed Sales</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{confirmedSales}</p>
                <span className="text-[10px] text-emerald-300/80">Approved by Admin</span>
              </div>

              <div className="bg-slate-800/80 border border-indigo-800/60 bg-indigo-950/20 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-indigo-300">Total Earned</p>
                <p className="text-2xl font-black text-indigo-400 mt-1">₹{totalEarnedCommission}</p>
                <span className="text-[10px] text-indigo-300/80">
                  Paid: ₹{paidOutCommission} • Bal: ₹{balancePayable}
                </span>
              </div>
            </div>

            {/* Referred Orders Breakdown */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-3xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                <div>
                  <h3 className="font-black text-sm text-white">Products Sold via Your Link</h3>
                  <p className="text-[11px] text-slate-400">
                    Real-time sales credited to {myPromoter.id} ({user.email})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => refreshMyPromoter()}
                  className="text-xs font-bold text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>🔄</span> Refresh
                </button>
              </div>

              {loadingPromoter ? (
                <div className="p-8 text-center text-xs text-slate-400">Updating sales...</div>
              ) : myPromoterSales.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-slate-700 rounded-2xl space-y-2">
                  <span className="text-3xl block">📦</span>
                  <p className="font-bold text-slate-200">No products bought via your link yet</p>
                  <p className="text-slate-400">
                    Share your referral link on YouTube or WhatsApp to start earning ₹{commissionRate} on each order!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myPromoterSales.map((ord, idx) => {
                    const isConfirmed = ord.status === 'confirmed';
                    const isCancelled = ord.status === 'cancelled' || ord.status === 'rejected';
                    const itemComm = typeof ord.commission === 'number' ? ord.commission : commissionRate;

                    return (
                      <div
                        key={ord.orderId || ord.id || idx}
                        className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-black text-white text-xs">{ord.orderId || ord.id}</span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                                isConfirmed
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : isCancelled
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {isConfirmed ? '✓ Approved' : isCancelled ? 'Cancelled' : '⏳ Pending'}
                            </span>
                          </div>
                          <p className="text-slate-200 font-bold">{ord.productName || 'Amal Coolguard Vest'}</p>
                          <p className="text-[11px] text-slate-400">
                            Order Value: ₹{ord.price || '-'} •{' '}
                            {ord.createdAt?.seconds
                              ? new Date(ord.createdAt.seconds * 1000).toLocaleDateString()
                              : ord.createdAt
                              ? new Date(ord.createdAt).toLocaleDateString()
                              : 'Recent'}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase">Commission</span>
                          <span className={`font-black text-sm ${isConfirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
                            +₹{itemComm}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {isConfirmed ? 'Credited' : isCancelled ? 'Cancelled' : 'Pending Verification'}
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
