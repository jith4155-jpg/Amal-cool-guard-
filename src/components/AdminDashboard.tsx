import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

export default function AdminDashboard() {
  const [products, setProducts] = useState<any[]>([]);
  const [newProduct, setNewProduct] = useState({ name: '', price: 0, description: '', imageUrl: '', discountPrice: 0, stock: 0, category: '' });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    const snapshot = await getDocs(collection(db, 'products'));
    setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const addProduct = async () => {
    await addDoc(collection(db, 'products'), newProduct);
    fetchProducts();
    setNewProduct({ name: '', price: 0, description: '', imageUrl: '', discountPrice: 0, stock: 0, category: '' });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <div className="bg-gray-100 p-4 rounded mb-6 grid grid-cols-2 gap-4">
        <h2 className="col-span-2 text-lg font-semibold mb-2">Add Product</h2>
        <input placeholder="Name" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="p-2 border rounded" />
        <input type="number" placeholder="Price" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})} className="p-2 border rounded" />
        <input type="number" placeholder="Discount Price" value={newProduct.discountPrice} onChange={e => setNewProduct({...newProduct, discountPrice: Number(e.target.value)})} className="p-2 border rounded" />
        <input type="number" placeholder="Stock" value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: Number(e.target.value)})} className="p-2 border rounded" />
        <input placeholder="Category" value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="p-2 border rounded" />
        <input placeholder="Image URL" value={newProduct.imageUrl} onChange={e => setNewProduct({...newProduct, imageUrl: e.target.value})} className="col-span-2 p-2 border rounded" />
        <input placeholder="Description" value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} className="col-span-2 p-2 border rounded" />
        <button onClick={addProduct} className="col-span-2 bg-blue-600 text-white p-2 rounded">Add Product</button>
      </div>
      {/* List products for deletion/edit */}
    </div>
  );
}
