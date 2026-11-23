import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'vengakkal') {
      localStorage.setItem('amal_admin_auth', 'true');
      navigate('/admin/dashboard');
    } else {
      setError(true);
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
          <p className="text-xs text-gray-500 mt-1">
            പാസ്‌വേഡ് നൽകി അഡ്മിൻ പാനലിലേക്ക് പ്രവേശിക്കുക (Enter password).
          </p>
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
              className="w-full p-3 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold bg-gray-50 text-gray-900"
              required
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 font-bold text-center bg-red-50 p-2.5 rounded-lg border border-red-200">
              ❌ തെറ്റായ പാസ്‌വേഡ്! ദയവായി &apos;vengakkal&apos; നൽകുക.
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-lg transition active:scale-98"
          >
            🔒 Login to Admin Dashboard
          </button>
        </form>

        <div className="pt-2 border-t border-gray-200">
          <Link to="/" className="text-xs font-bold text-blue-600 hover:underline">
            ← Back to Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}
