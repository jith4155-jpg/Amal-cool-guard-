import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CustomerLogin() {
  const [isRegister, setIsRegister] = useState(false);
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobile.trim()) return;

    const cleanMobile = mobile.trim();
    const registeredUsers = JSON.parse(localStorage.getItem('amal_registered_users') || '{}');

    if (isRegister) {
      // Sign Up: Must provide name and mobile
      if (!name.trim()) {
        setErrorMsg('Please enter your full name for registration.');
        return;
      }

      const newUser = {
        name: name.trim(),
        mobile: cleanMobile,
        registeredAt: new Date().toISOString()
      };

      registeredUsers[cleanMobile] = newUser;
      localStorage.setItem('amal_registered_users', JSON.stringify(registeredUsers));
      localStorage.setItem('amal_customer_session', JSON.stringify(newUser));

      alert('✓ Account created successfully and logged in!');
      navigate('/account');
    } else {
      // Sign In: Check if mobile exists in registered users
      const existingUser = registeredUsers[cleanMobile];
      if (!existingUser) {
        setErrorMsg('Mobile number not found! Please click "Sign Up" to register your name and mobile number first.');
        return;
      }

      localStorage.setItem('amal_customer_session', JSON.stringify(existingUser));
      alert(`✓ Welcome back, ${existingUser.name}!`);
      navigate('/account');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 text-3xl rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner">
            👤
          </div>
          <h2 className="text-xl font-black text-gray-900">
            {isRegister ? 'Sign Up (പുതിയ അക്കൗണ്ട്)' : 'Sign In (ലോഗിൻ)'}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {isRegister ? 'Enter your Name and Mobile Number to register' : 'Enter your registered Mobile Number'}
          </p>
        </div>

        {/* Tab Toggle: Sign In vs Sign Up */}
        <div className="grid grid-cols-2 bg-gray-100 p-1 rounded-2xl text-xs font-bold">
          <button 
            type="button"
            onClick={() => { setIsRegister(false); setErrorMsg(''); }}
            className={`py-2.5 rounded-xl transition ${!isRegister ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
          >
            Sign In (ലോഗിൻ)
          </button>
          <button 
            type="button"
            onClick={() => { setIsRegister(true); setErrorMsg(''); }}
            className={`py-2.5 rounded-xl transition ${isRegister ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
          >
            Sign Up (സൈൻ അപ്പ്)
          </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4 text-xs">
          {isRegister && (
            <div>
              <label className="block font-bold text-gray-700 mb-1">Full Name (പേര്) *</label>
              <input 
                type="text" 
                placeholder="Enter your full name" 
                required={isRegister}
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-bold" 
              />
            </div>
          )}

          <div>
            <label className="block font-bold text-gray-700 mb-1">Mobile Number (മൊബൈൽ നമ്പർ) *</label>
            <input 
              type="tel" 
              placeholder="10-digit mobile number" 
              required
              value={mobile}
              onChange={e => { setMobile(e.target.value); setErrorMsg(''); }}
              className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-bold" 
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-700 font-bold text-center">
              {errorMsg}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 rounded-xl shadow-lg transition active:scale-98 text-xs"
          >
            {isRegister ? 'Register & Save Profile (സൈൻ അപ്പ് ചെയ്യുക)' : 'Login with Mobile (ലോഗിൻ ചെയ്യുക)'}
          </button>
        </form>

        <div className="pt-2 border-t text-center">
          <button 
            onClick={() => navigate('/account')} 
            className="text-xs font-bold text-gray-600 hover:underline"
          >
            ← Back to Account Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
