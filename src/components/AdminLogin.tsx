import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ADMIN_EMAIL = 'libinvincent310@gmail.com';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [gmailStatusMsg, setGmailStatusMsg] = useState('');
  const [showAdminEmailAuth, setShowAdminEmailAuth] = useState(false);
  const [adminAuthEmail, setAdminAuthEmail] = useState(ADMIN_EMAIL);
  const [adminAuthPass, setAdminAuthPass] = useState('');
  const navigate = useNavigate();
  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail, signingIn } = useAuth();

  const isAdminGmailConnected = user?.email?.toLowerCase() === ADMIN_EMAIL;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'vengakkal') {
      localStorage.setItem('amal_admin_auth', 'true');
      navigate('/admin/dashboard');
    } else {
      setError(true);
    }
  };

  const handleConnectAdminGmail = async () => {
    setGmailStatusMsg('');
    const res = await signInWithGoogle();
    if (res.user?.email?.toLowerCase() === ADMIN_EMAIL) {
      setGmailStatusMsg('✓ Admin account connected for live customer order sync!');
    } else if (res.user) {
      setGmailStatusMsg(
        `Signed in as ${res.user.email}. For Cloud order approvals, please sign in with ${ADMIN_EMAIL}.`
      );
    } else if (res.error) {
      setGmailStatusMsg(res.error);
    }
  };

  const handleAdminEmailConnect = async (mode: 'signin' | 'signup') => {
    setGmailStatusMsg('');
    const cleanEmail = adminAuthEmail.trim();
    if (!cleanEmail || !adminAuthPass) {
      setGmailStatusMsg('Please enter Admin Email and Supabase Password.');
      return;
    }
    const res =
      mode === 'signup'
        ? await signUpWithEmail(cleanEmail, adminAuthPass, 'Amal Coolguard Admin')
        : await signInWithEmail(cleanEmail, adminAuthPass);
    if (res.user?.email?.toLowerCase() === ADMIN_EMAIL) {
      setGmailStatusMsg('✓ Admin account connected to Supabase Cloud!');
    } else if ('message' in res && typeof res.message === 'string' && res.message) {
      setGmailStatusMsg(res.message);
    } else if (res.error) {
      setGmailStatusMsg(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 shadow-xl max-w-sm w-full text-center space-y-6">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 text-3xl rounded-full flex items-center justify-center mx-auto shadow-inner">
          🛡️
        </div>

        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Admin Portal</h2>
          <p className="text-xs text-gray-500 mt-1">Enter password to access Amal Coolguard control panel.</p>
        </div>

        {/* Cloud Sync / Admin Connection Box */}
        <div
          className={`p-3.5 rounded-2xl border text-left space-y-2 ${
            isAdminGmailConnected
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <p
            className={`text-[11px] font-extrabold ${
              isAdminGmailConnected ? 'text-emerald-800' : 'text-amber-900'
            }`}
          >
            {isAdminGmailConnected
              ? `✓ Cloud Sync Ready (${user?.email})`
              : `⚠️ Connect Admin Account (${ADMIN_EMAIL})`}
          </p>
          {!isAdminGmailConnected && (
            <>
              <p className="text-[10px] text-amber-800 leading-relaxed">
                {user?.email
                  ? `Currently signed in as customer (${user.email}). Connect Admin account so order approvals sync live to customers.`
                  : 'Connect Admin account so order approvals & tracking IDs update live on customer phones.'}
              </p>
              <button
                type="button"
                onClick={handleConnectAdminGmail}
                disabled={signingIn}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[11px] py-2 px-3 rounded-xl shadow-xs transition disabled:opacity-60"
              >
                {signingIn ? 'Connecting...' : '🔐 Connect Admin Google / Gmail'}
              </button>
              <button
                type="button"
                onClick={() => setShowAdminEmailAuth(v => !v)}
                className="w-full text-[10px] font-bold text-amber-900 hover:underline text-center pt-0.5"
              >
                {showAdminEmailAuth ? 'Hide Email Password Login' : 'Or sign in with Email & Password'}
              </button>
              {showAdminEmailAuth && (
                <div className="space-y-1.5 pt-1">
                  <input
                    type="email"
                    value={adminAuthEmail}
                    onChange={e => setAdminAuthEmail(e.target.value)}
                    placeholder={ADMIN_EMAIL}
                    className="w-full p-2 text-[11px] border border-amber-300 rounded-lg bg-white outline-none"
                  />
                  <input
                    type="password"
                    value={adminAuthPass}
                    onChange={e => setAdminAuthPass(e.target.value)}
                    placeholder="Account Password (min 6 chars)"
                    className="w-full p-2 text-[11px] border border-amber-300 rounded-lg bg-white outline-none"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={signingIn}
                      onClick={() => handleAdminEmailConnect('signin')}
                      className="flex-1 bg-slate-900 text-white text-[10px] font-bold py-1.5 rounded-lg"
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      disabled={signingIn}
                      onClick={() => handleAdminEmailConnect('signup')}
                      className="flex-1 bg-white border border-amber-400 text-amber-900 text-[10px] font-bold py-1.5 rounded-lg"
                    >
                      Register
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {gmailStatusMsg && (
            <p className="text-[10px] font-bold text-gray-800 bg-white/80 p-2 rounded-lg border border-gray-200">
              {gmailStatusMsg}
            </p>
          )}
        </div>

        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Admin Password (പാസ്‌വേഡ്):</label>
            <input
              type="password"
              placeholder="Enter password (vengakkal)"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setError(false);
              }}
              className="w-full p-3 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold bg-gray-50"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 font-bold text-center bg-red-50 p-2 rounded-lg">
              ❌ Incorrect Password! Please enter &apos;vengakkal&apos;.
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-lg transition active:scale-98"
          >
            🔒 Login to Admin Dashboard
          </button>
        </form>

        <div className="pt-2 border-t">
          <Link to="/" className="text-xs font-bold text-blue-600 hover:underline">
            ← Back to Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}
