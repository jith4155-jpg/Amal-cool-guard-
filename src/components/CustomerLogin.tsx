import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CustomerLogin() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">{isLogin ? 'Login to Amal Coolguard' : 'Create Account'}</h2>
        {!isLogin && <input placeholder="Full Name" className="w-full p-3 mb-4 border rounded-full" />}
        <input type="tel" placeholder="Mobile Number" className="w-full p-3 mb-4 border rounded-full" />
        <button className="w-full bg-blue-600 text-white p-3 rounded-full font-bold hover:bg-blue-700 transition">
          {isLogin ? 'Send OTP' : 'Register'}
        </button>
        <p className="mt-4 text-center text-sm text-gray-600">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setIsLogin(!isLogin)} className="text-blue-600 font-semibold underline">
            {isLogin ? 'Register' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}
