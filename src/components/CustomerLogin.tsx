import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThemeSwitcher } from '../context/ThemeContext';
import { LanguageSelector } from '../context/LanguageContext';

export default function CustomerLogin() {
  const { user, authReady, profile, myOrdersCount, signingIn, signInWithGoogle, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const navigate = useNavigate();

  const redirectParam = searchParams.get('redirect') || '';
  const safeRedirect = redirectParam.startsWith('/') ? redirectParam : '/account';
  const isOrderRedirect = redirectParam.includes('/product/') || redirectParam.includes('openOrder=1');

  useEffect(() => {
    if (authReady && user && successMsg) {
      const timer = setTimeout(() => {
        navigate(safeRedirect, { replace: true });
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [authReady, user, successMsg, navigate, safeRedirect]);

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    const result = await signInWithGoogle();
    if (result.user) {
      setSuccessMsg(
        isOrderRedirect
          ? `Welcome ${result.user.displayName || result.user.email}! Opening booking form...`
          : `Signed in as ${result.user.email}! Redirecting...`
      );
      setTimeout(() => {
        navigate(safeRedirect, { replace: true });
      }, 400);
    } else if (result.error) {
      setErrorMsg(result.error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 pb-24">
      <div className="w-full max-w-sm flex items-center justify-end gap-2 mb-3">
        <ThemeSwitcher compact />
        <LanguageSelector />
      </div>

      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg w-full max-w-sm space-y-5 border border-gray-200">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-100 text-blue-600 text-2xl rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
            🔐
          </div>
          <h2 className="text-xl font-extrabold text-gray-900">
            {user ? 'Signed In' : 'Sign In with Gmail'}
          </h2>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            {isOrderRedirect
              ? 'Please sign in with your Gmail account to place an order.'
              : 'Sign in with Gmail to view your profile, saved address, and orders.'}
          </p>
        </div>

        {isOrderRedirect && !user && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center text-[11px] font-bold text-amber-900">
            Gmail sign-in is required to complete your booking.
          </div>
        )}

        {user ? (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center gap-3">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={profile?.name || user.displayName || 'User'}
                  className="w-12 h-12 rounded-full border-2 border-white shadow object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-lg shrink-0">
                  {(user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-sm text-gray-900 truncate">
                  {profile?.name || user.displayName || 'Customer'}
                </p>
                <p className="text-[11px] font-bold text-blue-700 truncate">{user.email}</p>
                <span className="inline-block mt-1 text-[10px] font-bold bg-white text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">
                  {myOrdersCount} {myOrdersCount === 1 ? 'Order' : 'Orders'} Placed
                </span>
              </div>
            </div>

            {successMsg && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-[11px] text-green-700 font-bold text-center">
                {successMsg}
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate(safeRedirect, { replace: true })}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition text-xs sm:text-sm"
            >
              {isOrderRedirect ? 'Continue to Booking Form →' : 'Open My Profile →'}
            </button>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full h-10 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition"
            >
              Switch Gmail Account
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className="w-full h-10 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded-xl text-xs transition"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full h-12 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 font-bold px-4 rounded-xl shadow-sm hover:shadow transition active:scale-[0.99] flex items-center justify-center gap-3 text-xs sm:text-sm disabled:opacity-60"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>
                {signingIn ? 'Signing in with Google...' : 'Continue with Google / Gmail'}
              </span>
            </button>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-700 font-bold text-center">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-[11px] text-green-700 font-bold text-center">
                {successMsg}
              </div>
            )}

            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-[11px] text-gray-600 space-y-1">
              <p className="font-bold text-gray-800">Secure Account Access</p>
              <p>Your profile, saved delivery address, and order history stay strictly private to your Gmail account.</p>
            </div>
          </div>
        )}

        <div className="pt-2 border-t flex items-center justify-between text-xs">
          <button onClick={() => navigate('/')} className="font-bold text-gray-600 hover:underline">
            ← Storefront
          </button>
          <button onClick={() => navigate('/account')} className="font-bold text-blue-600 hover:underline">
            My Account →
          </button>
        </div>
      </div>
    </div>
  );
}
