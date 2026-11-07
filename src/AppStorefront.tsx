import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function AppStorefront() {
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => {
    const fetchProducts = async () => {
      const querySnapshot = await getDocs(collection(db, 'products'));
      setProducts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchProducts();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white p-4 flex justify-between items-center shadow sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-blue-700">Amal Coolguard</h1>
        <div className="flex gap-4">
          <input type="text" placeholder="Search products..." className="p-2 border rounded" />
          <button className="bg-blue-600 text-white px-4 py-2 rounded">Login</button>
          <button className="text-lg">Cart ({cart.length})</button>
        </div>
      </nav>

      <main className="p-6">
        <h2 className="text-2xl font-bold mb-6">Featured Products</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {products.map(product => (
            <div key={product.id} className="bg-white p-4 rounded shadow hover:shadow-lg transition">
              <img src={product.imageUrl} alt={product.name} className="w-full h-48 object-cover rounded mb-4" />
              <h3 className="font-semibold text-lg">{product.name}</h3>
              <p className="text-gray-500">{product.category}</p>
              <div className="flex items-baseline gap-2 mt-2">
                <p className="text-xl font-bold">₹{product.discountPrice || product.price}</p>
                {product.discountPrice && <p className="text-sm text-gray-400 line-through">₹{product.price}</p>}
              </div>
              <button 
                onClick={() => setCart([...cart, product])}
                className="w-full bg-orange-500 text-white p-2 mt-4 rounded font-semibold"
              >
                Add to Cart
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
