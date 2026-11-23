import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ADMIN_EMAIL = 'libinvincent310@gmail.com';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [gmailStatusMsg, setGmailStatusMsg] = useState('');
  const navigate = useNavigate();
  const { user, signInWithGoogle, signingIn } = useAuth();

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
      setGmailStatusMsg('✓ Admin Google account connected to Firebase for live customer order sync!');
    } else if (res.user) {
      setGmailStatusMsg(
        `Signed in as ${res.user.email}. For Cloud order approvals, please sign in with ${ADMIN_EMAIL}.`
      );
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
              ? `✓ Firebase Cloud Sync Ready (${user?.email})`
              : `⚠️ Connect Admin Google Account (${ADMIN_EMAIL})`}
          </p>
          {!isAdminGmailConnected && (
            <>
              <p className="text-[10px] text-amber-800 leading-relaxed">
                {user?.email
                  ? `Currently signed in as (${user.email}). Connect Admin Google account so order approvals sync live to customers.`
                  : 'Connect Admin Google account so order approvals & tracking IDs update live on customer phones.'}
              </p>
              <button
                type="button"
                onClick={handleConnectAdminGmail}
                disabled={signingIn}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[11px] py-2.5 px-3 rounded-xl shadow-xs transition disabled:opacity-60"
              >
                {signingIn ? 'Connecting...' : '🔐 Connect Admin Google / Gmail'}
              </button>
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
