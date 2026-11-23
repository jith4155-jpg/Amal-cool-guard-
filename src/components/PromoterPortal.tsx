import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_STORE_BASE_URL,
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
    getGoogleOAuthUrl,
    signInWithEmail,
    signUpWithEmail,
    logout,
    refreshMyPromoter,
    registerMyPromoter,
    updateMyPromoter,
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
  const [infoMsg, setInfoMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Email & Password login fallback state (auto-opened inside preview iframes)
  const [showEmailAuth, setShowEmailAuth] = useState(() => {
    try {
      return window.self !== window.top;
    } catch {
      return false;
    }
  });
  const [emailAuthMode, setEmailAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [googleBrowserUrl, setGoogleBrowserUrl] = useState<string | null>(null);

  // Edit Existing Promoter Details state
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editChannelName, setEditChannelName] = useState('');
  const [editPaymentType, setEditPaymentType] = useState<'upi' | 'bank'>('upi');
  const [editUpiId, setEditUpiId] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editAccountNumber, setEditAccountNumber] = useState('');
  const [editIfscCode, setEditIfscCode] = useState('');
  const [editAccountHolderName, setEditAccountHolderName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccessMsg, setEditSuccessMsg] = useState('');

  // Copy states
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Pre-fill Name & Mobile from authenticated user's profile
  useEffect(() => {
    if (user) {
      setName(prev => prev || profile?.name || user.displayName || '');
      setPhone(prev => prev || profile?.mobile || '');
    } else {
      getGoogleOAuthUrl('/promoter').then(url => {
        if (url) setGoogleBrowserUrl(url);
      });
    }
  }, [user, profile, getGoogleOAuthUrl]);

  const openEditDetails = () => {
    if (!myPromoter) return;
    setEditName(myPromoter.name || '');
    setEditPhone(myPromoter.phone || '');
    setEditChannelName(myPromoter.channelName || '');
    setEditPaymentType(myPromoter.paymentType === 'bank' ? 'bank' : 'upi');
    setEditUpiId(myPromoter.upiId || '');
    setEditBankName(myPromoter.bankName || '');
    setEditAccountNumber(myPromoter.accountNumber || '');
    setEditIfscCode(myPromoter.ifscCode || '');
    setEditAccountHolderName(myPromoter.accountHolderName || myPromoter.name || '');
    setEditError('');
    setEditSuccessMsg('');
    setIsEditingDetails(true);
  };

  const handleSaveEditedDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    setEditSuccessMsg('');

    if (!editName.trim() || !editPhone.trim()) {
      setEditError('Please enter your Full Name and Mobile Number.');
      return;
    }

    if (editPaymentType === 'upi' && !editUpiId.trim()) {
      setEditError('Please enter your UPI ID.');
      return;
    }

    if (editPaymentType === 'bank' && (!editAccountNumber.trim() || !editIfscCode.trim())) {
      setEditError('Please enter your Bank Account Number and IFSC Code.');
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await updateMyPromoter({
        name: editName.trim(),
        phone: editPhone.trim(),
        channelName: editChannelName.trim() || 'YouTuber / Influencer',
        paymentType: editPaymentType,
        upiId: editPaymentType === 'upi' ? editUpiId.trim() : '',
        bankName: editPaymentType === 'bank' ? editBankName.trim() : '',
        accountNumber: editPaymentType === 'bank' ? editAccountNumber.trim() : '',
        ifscCode: editPaymentType === 'bank' ? editIfscCode.trim().toUpperCase() : '',
        accountHolderName:
          editPaymentType === 'bank' ? editAccountHolderName.trim() || editName.trim() : '',
      });

      if (updated) {
        setIsEditingDetails(false);
        setEditSuccessMsg('✓ Account & Payout details updated successfully!');
        setTimeout(() => setEditSuccessMsg(''), 3500);
      } else {
        setEditError('Unable to save changes. Please sign in again.');
      }
    } catch {
      setEditError('Could not update details. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

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

  // Strictly enforce official https://amalcoolguard.in domain (never vercel/mersal)
  const fullReferralLink = myPromoter
    ? getPromoterShareLink(myPromoter.id, DEFAULT_STORE_BASE_URL)
    : '';
  const whatsappShareUrl = myPromoter
    ? `https://wa.me/?text=${encodeURIComponent(fullReferralLink)}`
    : '#';

  const copyReferralLink = () => {
    if (!myPromoter || !fullReferralLink) return;
    navigator.clipboard.writeText(fullReferralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyPromoterCode = () => {
    if (!myPromoter?.id) return;
    navigator.clipboard.writeText(myPromoter.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Commission & Delivery calculations
  const commissionRate = myPromoter?.commissionPerSale || 100;
  const confirmedSales = myPromoterSales.filter(o => o.status === 'confirmed').length;
  const pendingSales = myPromoterSales.filter(
    o => !o.status || o.status === 'pending' || o.status === 'pending_verification'
  ).length;
  const dispatchedSalesCount = myPromoterSales.filter(
    o => o.deliveryStatus === 'shipped'
  ).length;
  const deliveredSalesCount = myPromoterSales.filter(
    o => o.deliveryStatus === 'delivered'
  ).length;
  const totalEarnedCommission = confirmedSales * commissionRate;
  const pendingCommission = pendingSales * commissionRate;
  const paidOutCommission = myPromoter?.paidAmount || 0;
  const balancePayable = Math.max(0, totalEarnedCommission - paidOutCommission);

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      {/* Clean Compact Header */}
      <header className="bg-slate-950/90 backdrop-blur border-b border-slate-800 px-3 sm:px-5 h-14 sticky top-0 z-40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/"
            className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1 shrink-0 transition"
          >
            <span>←</span>
            <span>Store</span>
          </Link>
          <span className="font-extrabold text-sm tracking-tight text-white truncate">
            Promoter
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeSwitcher compact />
          {user && (
            <>
              <Link
                to="/account"
                title="My Profile"
                className="h-8 px-2.5 text-[11px] font-bold text-blue-300 bg-blue-950/60 border border-blue-800/80 rounded-lg flex items-center gap-1 hover:bg-blue-900/60 transition whitespace-nowrap"
              >
                <span>👤</span>
                <span>Profile</span>
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                className="h-8 px-2.5 text-[11px] font-extrabold text-red-400 hover:text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg transition whitespace-nowrap"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {!authReady || (user && loadingPromoter && !myPromoter) ? (
          <div className="bg-slate-900 border border-slate-800 p-10 rounded-2xl text-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-slate-300">Checking Gmail promoter status...</p>
          </div>
        ) : !user ? (
          /* Step 1: Must sign in before accessing Promoter Sign-Up or Dashboard */
          (() => {
            const isInIframe = (() => {
              try {
                return window.self !== window.top;
              } catch {
                return true;
              }
            })();

            return (
              <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-2xl shadow-xl space-y-5 text-center">
                <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-lg shadow-blue-500/20">
                  ✉️
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-xl font-black text-white">
                    Promoter Login & Sign Up
                  </h1>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    നിങ്ങളുടെ സ്വന്തം പ്രൊമോഷൻ ലിങ്ക് എടുക്കാനും, ആ ലിങ്ക് വഴി എത്ര പേർ വാങ്ങി എന്ന് കാണാനും നിങ്ങളുടെ അക്കൗണ്ട് ഉപയോഗിച്ച് ലോഗിൻ ചെയ്യുക.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {isInIframe
                      ? 'Sign in or create an account with your own Email & Password below.'
                      : 'Sign in with your Gmail or Email to open your Promoter Dashboard.'}
                  </p>
                </div>

                {isInIframe ? (
                  googleBrowserUrl ? (
                    <a
                      href={googleBrowserUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        setErrorMsg('');
                        setInfoMsg(
                          'ഫോണിന്റെ ബ്രൗസറിൽ Google അക്കൗണ്ട് തിരഞ്ഞെടുത്ത് ലോഗിൻ ചെയ്ത ശേഷം തിരികെ വരൂ.'
                        );
                      }}
                      className="w-full bg-white hover:bg-slate-100 text-slate-900 font-black py-3.5 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-3 text-xs"
                    >
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                        <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
                      </svg>
                      <span>Continue with Google / Gmail (Browser) ↗</span>
                    </a>
                  ) : null
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        setErrorMsg('');
                        setInfoMsg('');
                        const res = await signInWithGoogle();
                        if (res.isIframeBlocked) {
                          setShowEmailAuth(true);
                        }
                        if (res.error) setErrorMsg(res.error);
                      }}
                      disabled={signingIn}
                      className="w-full bg-white hover:bg-slate-100 text-slate-900 font-black py-3.5 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-3 text-xs disabled:opacity-60"
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

                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setInfoMsg('');
                        setShowEmailAuth(prev => !prev);
                      }}
                      className="w-full py-2 text-[11px] font-bold text-blue-300 hover:text-blue-200 underline underline-offset-4 transition"
                    >
                      {showEmailAuth
                        ? 'Hide Email & Password Login'
                        : 'Or Sign In / Create Account with Email & Password'}
                    </button>
                  </>
                )}

                {(isInIframe || showEmailAuth) && (
                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      setErrorMsg('');
                      setInfoMsg('');
                      const cleanEmail = authEmail.trim();
                      if (!cleanEmail || !authPassword) {
                        setErrorMsg('ദയവായി Email-ഉം Password-ഉം നൽകുക.');
                        return;
                      }
                      if (emailAuthMode === 'signup') {
                        const res = await signUpWithEmail(cleanEmail, authPassword, authName.trim());
                        if (res.user) {
                          setInfoMsg('✓ അക്കൗണ്ട് ലോഗിൻ ആയി!');
                        } else if (res.needsEmailConfirmation && res.message) {
                          setEmailAuthMode('signin');
                          setInfoMsg(res.message);
                        } else if (res.alreadyRegistered && res.error) {
                          setEmailAuthMode('signin');
                          setErrorMsg(res.error);
                        } else if (res.error) {
                          setErrorMsg(res.error);
                        }
                      } else {
                        const res = await signInWithEmail(cleanEmail, authPassword);
                        if (res.error) setErrorMsg(res.error);
                      }
                    }}
                    className="text-left space-y-3 bg-slate-950/70 border border-slate-800 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-800">
                      <span className="text-xs font-extrabold text-white">
                        {emailAuthMode === 'signin'
                          ? 'Email Sign In (ലോഗിൻ)'
                          : 'Create Promoter Account'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg('');
                          setInfoMsg('');
                          setEmailAuthMode(m => (m === 'signin' ? 'signup' : 'signin'));
                        }}
                        className="text-[11px] font-bold text-amber-400 hover:text-amber-300"
                      >
                        {emailAuthMode === 'signin' ? 'New user? Sign Up' : 'Have account? Sign In'}
                      </button>
                    </div>

                    {emailAuthMode === 'signup' && (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">
                          Full Name (പേര്)
                        </label>
                        <input
                          type="text"
                          value={authName}
                          onChange={e => setAuthName(e.target.value)}
                          placeholder="Your full name"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={e => setAuthEmail(e.target.value)}
                        placeholder="name@gmail.com"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Password *
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={authPassword}
                        onChange={e => setAuthPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={signingIn}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-lg text-xs transition disabled:opacity-60"
                    >
                      {signingIn
                        ? 'Please wait...'
                        : emailAuthMode === 'signin'
                        ? 'Sign In with Email'
                        : 'Create Account & Continue'}
                    </button>
                  </form>
                )}

                {infoMsg && (
                  <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 font-bold text-xs">
                    {infoMsg}
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 font-bold text-xs">
                    {errorMsg}
                  </div>
                )}
              </div>
            );
          })()
        ) : !myPromoter ? (
          /* Step 2: Signed in with Gmail, not yet registered as a Promoter -> Show Sign-Up Form */
          <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-2xl shadow-xl space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-lg shadow-blue-500/20">
                💰
              </div>
              <h1 className="text-xl font-black text-white">
                Promoter Sign Up (പ്രൊമോഷൻ അക്കൗണ്ട് തുടങ്ങാം)
              </h1>
              <p className="text-xs text-slate-300">
                Register with your verified Gmail & Phone Number to get your unique{' '}
                <span className="font-mono text-amber-400">amalcoolguard.in</span> link and earn{' '}
                <strong className="text-amber-400 font-extrabold">₹100 commission</strong> per order.
              </p>
            </div>

            {/* Verified Gmail Banner */}
            <div className="bg-blue-950/50 border border-blue-800/70 p-3 rounded-xl flex items-center justify-between gap-2">
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">YouTube Channel / Instagram Page Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kerala Moto Vlogs / MotoTraveller"
                  value={channelName}
                  onChange={e => setChannelName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Payment Receiving Method: UPI or Bank Account */}
              <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl space-y-3">
                <label className="block font-bold text-slate-200">
                  Commission Payout Method (കമ്മീഷൻ സ്വീകരിക്കേണ്ട രീതി) *
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentType('upi')}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition ${
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
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition ${
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
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-generated Referral Code Notice */}
              <div className="bg-blue-950/40 border border-blue-800/60 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-blue-300 font-extrabold uppercase tracking-wider">
                    Auto-Generated Promoter Code
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {name.trim() ? (
                      <>
                        Preview ID:{' '}
                        <span className="font-mono font-black text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {name.trim().charAt(0).toUpperCase()}01{name.trim().charAt(name.trim().length - 1).toUpperCase()}
                        </span>
                      </>
                    ) : (
                      'Your unique ID (e.g. L01N) will be automatically created!'
                    )}
                  </p>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
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
          /* Step 3: Logged-in Registered Promoter Dashboard (Professional Layout) */
          <div className="space-y-4">
            {editSuccessMsg && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-700/70 rounded-xl text-emerald-300 text-xs font-bold text-center">
                {editSuccessMsg}
              </div>
            )}

            {/* Promoter Profile & Payout Card */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider bg-blue-950/80 border border-blue-800/70 px-2 py-0.5 rounded-md">
                      Verified • {user.email}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-white truncate">{myPromoter.name}</h2>
                  <p className="text-xs text-slate-400">
                    {myPromoter.channelName || 'Affiliate Partner'} · 📱 {myPromoter.phone}
                  </p>
                </div>

                <div className="text-right shrink-0 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl">
                  <span className="text-[9.5px] text-slate-400 block uppercase font-bold tracking-wider">Commission</span>
                  <span className="text-lg font-black text-amber-400 tabular-nums">₹{commissionRate}</span>
                  <span className="text-[9.5px] text-slate-400 block">per sale</span>
                </div>
              </div>

              {/* Current Payout Summary + Edit Details Trigger */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0 text-xs">
                  {myPromoter.paymentType === 'bank' ? (
                    <div className="space-y-0.5">
                      <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <span>🏦</span>
                        <span>Bank Payout: {myPromoter.bankName || 'Bank Account'}</span>
                      </p>
                      <p className="text-[11px] text-slate-300 font-mono truncate">
                        A/C: {myPromoter.accountNumber || '-'} · IFSC: {myPromoter.ifscCode || '-'}
                      </p>
                      {myPromoter.accountHolderName && (
                        <p className="text-[11px] text-slate-400 truncate">
                          Holder: {myPromoter.accountHolderName}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="font-bold text-emerald-400 font-mono truncate">
                      📱 UPI Payout: {myPromoter.upiId || 'Not set'}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => (isEditingDetails ? setIsEditingDetails(false) : openEditDetails())}
                  className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-[11px] transition shrink-0 self-start sm:self-center"
                >
                  {isEditingDetails ? '✕ Close Editor' : '✏️ Edit Name / Bank / IFSC'}
                </button>
              </div>

              {/* Inline Edit Promoter Details Form (Name, Phone, Bank Account, IFSC, UPI) */}
              {isEditingDetails && (
                <form
                  onSubmit={handleSaveEditedDetails}
                  className="bg-slate-950 border border-blue-800/60 p-4 rounded-xl space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="font-extrabold text-blue-300">
                      Edit Promoter & Bank Payout Details
                    </h3>
                    <span className="text-[10px] font-mono text-amber-400 font-bold">
                      ID: {myPromoter.id}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Full Name (പേര്) *</label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-300 mb-1">WhatsApp Mobile *</label>
                      <input
                        type="tel"
                        required
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Channel / Page Name</label>
                    <input
                      type="text"
                      value={editChannelName}
                      onChange={e => setEditChannelName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <label className="block font-bold text-slate-300">Payout Method</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditPaymentType('upi')}
                        className={`py-2 px-3 rounded-lg font-bold transition ${
                          editPaymentType === 'upi'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900 text-slate-400 border border-slate-700'
                        }`}
                      >
                        📱 UPI ID
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditPaymentType('bank')}
                        className={`py-2 px-3 rounded-lg font-bold transition ${
                          editPaymentType === 'bank'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900 text-slate-400 border border-slate-700'
                        }`}
                      >
                        🏦 Bank Account
                      </button>
                    </div>

                    {editPaymentType === 'upi' ? (
                      <div>
                        <label className="block font-bold text-slate-300 mb-1">UPI ID *</label>
                        <input
                          type="text"
                          required={editPaymentType === 'upi'}
                          placeholder="e.g. name@okaxis"
                          value={editUpiId}
                          onChange={e => setEditUpiId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div>
                          <label className="block font-bold text-slate-300 mb-1">Account Holder Name *</label>
                          <input
                            type="text"
                            required={editPaymentType === 'bank'}
                            placeholder="Name as per bank passbook"
                            value={editAccountHolderName}
                            onChange={e => setEditAccountHolderName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold text-slate-300 mb-1">Bank Name</label>
                            <input
                              type="text"
                              placeholder="e.g. SBI, Federal"
                              value={editBankName}
                              onChange={e => setEditBankName(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-300 mb-1">IFSC Code *</label>
                            <input
                              type="text"
                              required={editPaymentType === 'bank'}
                              placeholder="e.g. SBIN0001234"
                              value={editIfscCode}
                              onChange={e => setEditIfscCode(e.target.value.toUpperCase())}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block font-bold text-slate-300 mb-1">Bank Account Number *</label>
                          <input
                            type="text"
                            required={editPaymentType === 'bank'}
                            placeholder="Enter bank account number"
                            value={editAccountNumber}
                            onChange={e => setEditAccountNumber(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {editError && (
                    <p className="text-red-400 font-bold text-[11px]">{editError}</p>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="flex-1 h-9 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-lg transition disabled:opacity-50"
                    >
                      {savingEdit ? 'Saving...' : '✓ Save Details'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingDetails(false)}
                      className="h-9 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Clean Shareable Store Link Card (Strictly https://amalcoolguard.in/?<ID>) */}
            <div className="bg-slate-900 border border-blue-800/60 p-5 rounded-2xl shadow-lg space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔗</span>
                  <span>Your Shareable Store Link</span>
                </span>
                <button
                  type="button"
                  onClick={copyPromoterCode}
                  title="Tap to copy promoter code"
                  className="text-xs font-mono font-black text-amber-400 bg-slate-950 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 transition shrink-0"
                >
                  {copiedId ? `✓ ${myPromoter.id}` : `ID: ${myPromoter.id}`}
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-2.5 pl-3 rounded-xl flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm text-amber-400 font-mono font-bold break-all">
                  {fullReferralLink}
                </span>
                <button
                  type="button"
                  onClick={copyReferralLink}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-3.5 h-8 rounded-lg shadow shrink-0 transition whitespace-nowrap"
                >
                  {copiedLink ? '✓ Copied' : 'Copy Link'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3 rounded-xl shadow flex items-center justify-center gap-1.5 transition"
                >
                  <span>💬</span>
                  <span>Share on WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={copyReferralLink}
                  className="h-10 bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs px-3 rounded-xl border border-slate-700 shadow flex items-center justify-center gap-1.5 transition"
                >
                  <span>📋</span>
                  <span>{copiedLink ? '✓ Copied!' : 'Copy Full Link'}</span>
                </button>
              </div>
            </div>

            {/* Commission Analytics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 tabular-nums">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-slate-400">Total Products Sold</p>
                <p className="text-2xl font-black text-white mt-1">{myPromoterSales.length}</p>
                <span className="text-[10px] text-slate-500">Orders via your link</span>
              </div>

              <div className="bg-slate-900 border border-amber-800/50 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-amber-300">Pending Verification</p>
                <p className="text-2xl font-black text-amber-400 mt-1">{pendingSales}</p>
                <span className="text-[10px] text-amber-300/70">₹{pendingCommission} pending</span>
              </div>

              <div className="bg-slate-900 border border-emerald-800/50 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-emerald-300">Confirmed Sales</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{confirmedSales}</p>
                <span className="text-[10px] text-emerald-300/70">Approved by Admin</span>
              </div>

              <div className="bg-slate-900 border border-indigo-800/50 p-4 rounded-2xl">
                <p className="text-[11px] font-bold text-indigo-300">Total Earned</p>
                <p className="text-2xl font-black text-indigo-400 mt-1">₹{totalEarnedCommission}</p>
                <span className="text-[10px] text-indigo-300/70">
                  Paid: ₹{paidOutCommission} · Bal: ₹{balancePayable}
                </span>
              </div>
            </div>

            {/* Referred Orders Breakdown */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-black text-sm text-white">Products Sold via Your Link</h3>
                  <p className="text-[11px] text-slate-400">
                    Code: {myPromoter.id} · {user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => refreshMyPromoter()}
                  className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-blue-300 flex items-center gap-1 transition"
                >
                  <span>🔄</span>
                  <span>Refresh</span>
                </button>
              </div>

              {/* Live Delivery Overview Bar */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-sky-950/50 border border-sky-800/60 px-3.5 py-2.5 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-sky-300 uppercase">Courier Dispatched</p>
                    <p className="text-[10px] text-sky-400/80">കൊറിയർ അയച്ചവ</p>
                  </div>
                  <span className="text-lg font-black text-sky-300 tabular-nums">{dispatchedSalesCount}</span>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-800/60 px-3.5 py-2.5 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-300 uppercase">Delivered</p>
                    <p className="text-[10px] text-emerald-400/80">ഡെലിവറി ചെയ്തവ</p>
                  </div>
                  <span className="text-lg font-black text-emerald-300 tabular-nums">{deliveredSalesCount}</span>
                </div>
              </div>

              {loadingPromoter ? (
                <div className="p-8 text-center text-xs text-slate-400">Updating sales...</div>
              ) : myPromoterSales.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl space-y-2">
                  <span className="text-3xl block">📦</span>
                  <p className="font-bold text-slate-200">No products bought via your link yet</p>
                  <p className="text-slate-400">
                    Share {fullReferralLink} to earn ₹{commissionRate} on each verified order.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myPromoterSales.map((ord, idx) => {
                    const isConfirmed = ord.status === 'confirmed';
                    const isCancelled = ord.status === 'cancelled' || ord.status === 'rejected';
                    const itemComm = typeof ord.commission === 'number' ? ord.commission : commissionRate;
                    const isShipped = ord.deliveryStatus === 'shipped';
                    const isDelivered = ord.deliveryStatus === 'delivered';
                    const isDispatchedOrDelivered = isShipped || isDelivered;

                    return (
                      <div
                        key={ord.orderId || ord.id || idx}
                        className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
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
                              {!isCancelled && (
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                                    isDelivered
                                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                      : isShipped
                                      ? 'bg-sky-600/30 text-sky-300 border border-sky-500/40'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {isDelivered
                                    ? '📦 Delivered'
                                    : isShipped
                                    ? '🚚 Courier Sent'
                                    : '⏳ Packed / Pickup'}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-200 font-bold truncate">{ord.productName || 'Amal Coolguard Product'}</p>
                            <p className="text-[11px] text-slate-400">
                              Order Value: ₹{ord.price || '-'} ·{' '}
                              {ord.createdAt?.seconds
                                ? new Date(ord.createdAt.seconds * 1000).toLocaleDateString()
                                : ord.createdAt
                                ? new Date(ord.createdAt).toLocaleDateString()
                                : 'Recent'}
                            </p>
                          </div>

                          <div className="text-right tabular-nums shrink-0">
                            <span className="text-[10px] text-slate-400 block uppercase">Commission</span>
                            <span className={`font-black text-sm ${isConfirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
                              +₹{itemComm}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              {isConfirmed ? 'Credited' : isCancelled ? 'Cancelled' : 'Pending Verification'}
                            </span>
                          </div>
                        </div>

                        {/* Automatic Live Delivery & Courier Stepper for Promoter */}
                        {!isCancelled && (
                          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg space-y-1.5">
                            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                              <div
                                className={`py-1.5 px-1 rounded-md border ${
                                  isConfirmed || isDispatchedOrDelivered
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                    : 'bg-slate-950 border-slate-800 text-slate-400'
                                }`}
                              >
                                {isConfirmed || isDispatchedOrDelivered ? '✓ Confirmed' : '1. Ordered'}
                              </div>
                              <div
                                className={`py-1.5 px-1 rounded-md border ${
                                  isDispatchedOrDelivered
                                    ? 'bg-sky-600/30 border-sky-500/50 text-sky-200'
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                                }`}
                              >
                                🚚 Courier Sent
                              </div>
                              <div
                                className={`py-1.5 px-1 rounded-md border ${
                                  isDelivered
                                    ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200'
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                                }`}
                              >
                                📦 Delivered
                              </div>
                            </div>
                            {(ord.courierName || ord.trackingId || ord.dispatchedAt || ord.deliveredAt) && (
                              <p className="text-[10px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                                {ord.courierName && <span>Courier: {ord.courierName}</span>}
                                {ord.trackingId && <span className="font-mono text-sky-300">ID: {ord.trackingId}</span>}
                                {ord.dispatchedAt && (
                                  <span>Dispatched: {new Date(ord.dispatchedAt).toLocaleDateString()}</span>
                                )}
                                {ord.deliveredAt && (
                                  <span>Delivered: {new Date(ord.deliveredAt).toLocaleDateString()}</span>
                                )}
                              </p>
                            )}
                          </div>
                        )}
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
