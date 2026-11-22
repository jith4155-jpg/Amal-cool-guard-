import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import {
  getLocalOrders,
  saveAllOrders,
  deleteOrderLocally,
  getDeletedOrderIds,
  safeJsonParse,
  safeSetStorage,
  STORAGE_KEYS,
} from '../utils/storeSync';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  mobile?: string;
  address?: string;
  pincode?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserProfile | null;
  myOrders: any[];
  myOrdersCount: number;
  loadingOrders: boolean;
  signingIn: boolean;
  signInWithGoogle: () => Promise<{ user: User | null; error?: string }>;
  logout: () => Promise<void>;
  updateUserProfile: (patch: Partial<UserProfile>) => Promise<UserProfile | null>;
  refreshMyOrders: () => Promise<any[]>;
  recordLocalOrder: (orderRecord: any) => void;
  cancelMyOrder: (order: any) => Promise<void>;
  deleteMyOrder: (order: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getTimestampMs(createdAt: any): number {
  if (!createdAt) return 0;
  if (typeof createdAt?.seconds === 'number') return createdAt.seconds * 1000;
  const parsed = Date.parse(String(createdAt));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function belongsToUser(order: any, user: User): boolean {
  if (!order || !user) return false;
  if (order.userId && order.userId === user.uid) return true;
  if (
    order.userEmail &&
    user.email &&
    String(order.userEmail).trim().toLowerCase() === String(user.email).trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const syncLocalProfileCache = useCallback((prof: UserProfile) => {
    safeSetStorage(`amal_user_profile_${prof.uid}`, JSON.stringify(prof));
    safeSetStorage(
      STORAGE_KEYS.CUSTOMER_SESSION,
      JSON.stringify({
        uid: prof.uid,
        name: prof.name,
        email: prof.email,
        photoURL: prof.photoURL || '',
        mobile: prof.mobile || '',
        address: prof.address || '',
        pincode: prof.pincode || '',
      })
    );
    if (prof.mobile) {
      const regUsers = safeJsonParse<Record<string, any>>(
        localStorage.getItem(STORAGE_KEYS.REGISTERED_USERS),
        {}
      );
      regUsers[prof.mobile] = {
        uid: prof.uid,
        name: prof.name,
        email: prof.email,
        photoURL: prof.photoURL || '',
        mobile: prof.mobile,
        address: prof.address || '',
        pincode: prof.pincode || '',
        registeredAt: prof.createdAt || new Date().toISOString(),
      };
      safeSetStorage(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(regUsers));
    }
  }, []);

  const loadOrCreateProfile = useCallback(
    async (firebaseUser: User): Promise<UserProfile> => {
      const localKey = `amal_user_profile_${firebaseUser.uid}`;
      const cachedLocal = safeJsonParse<Partial<UserProfile> | null>(
        localStorage.getItem(localKey),
        null
      );

      let remoteData: Partial<UserProfile> | null = null;
      try {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const snap = await Promise.race([
          getDoc(userDocRef),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1800)),
        ]);
        if (snap.exists()) {
          remoteData = snap.data() as Partial<UserProfile>;
        }
      } catch (err) {
        console.warn('Could not fetch remote user profile:', err);
      }

      const nowIso = new Date().toISOString();
      const mergedProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || remoteData?.email || cachedLocal?.email || '',
        name:
          remoteData?.name ||
          cachedLocal?.name ||
          firebaseUser.displayName ||
          (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Customer'),
        photoURL: firebaseUser.photoURL || remoteData?.photoURL || cachedLocal?.photoURL || '',
        mobile: remoteData?.mobile ?? cachedLocal?.mobile ?? '',
        address: remoteData?.address ?? cachedLocal?.address ?? '',
        pincode: remoteData?.pincode ?? cachedLocal?.pincode ?? '',
        createdAt: remoteData?.createdAt || cachedLocal?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      syncLocalProfileCache(mergedProfile);
      setProfile(mergedProfile);

      if (!remoteData) {
        try {
          await setDoc(doc(db, 'users', firebaseUser.uid), mergedProfile, { merge: true });
        } catch (err) {
          console.warn('Could not persist initial user profile to Firestore:', err);
        }
      }

      return mergedProfile;
    },
    [syncLocalProfileCache]
  );

  const loadUserOrders = useCallback(async (targetUser: User | null): Promise<any[]> => {
    if (!targetUser) {
      setMyOrders([]);
      setLoadingOrders(false);
      return [];
    }

    setLoadingOrders(true);
    const deletedSet = new Set(getDeletedOrderIds());
    const combinedMap = new Map<string, any>();

    try {
      const q = query(collection(db, 'bookings'), where('userId', '==', targetUser.uid));
      const snapshot = await Promise.race([
        getDocs(q),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
      ]);

      snapshot.docs.forEach(d => {
        const data = { id: d.id, docId: d.id, ...d.data() } as any;
        const oid = String(data.orderId || '');
        const did = String(data.id || '');
        if (deletedSet.has(oid) || deletedSet.has(did)) return;
        const key = oid || did;
        if (key) combinedMap.set(key, data);
      });
    } catch (err) {
      console.warn('Firestore user bookings query fallback:', err);
    }

    const localOrders = getLocalOrders();
    for (const loc of localOrders) {
      if (!belongsToUser(loc, targetUser)) continue;
      const oid = String(loc.orderId || '');
      const did = String(loc.id || '');
      if (deletedSet.has(oid) || deletedSet.has(did)) continue;
      const key = oid || did;
      if (key && !combinedMap.has(key)) {
        combinedMap.set(key, loc);
      }
    }

    const sorted = Array.from(combinedMap.values()).sort(
      (a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt)
    );

    setMyOrders(sorted);
    setLoadingOrders(false);
    return sorted;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadOrCreateProfile(firebaseUser);
        await loadUserOrders(firebaseUser);
      } else {
        setProfile(null);
        setMyOrders([]);
        localStorage.removeItem(STORAGE_KEYS.CUSTOMER_SESSION);
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, [loadOrCreateProfile, loadUserOrders]);

  useEffect(() => {
    const onStoreSync = () => {
      if (auth.currentUser) {
        loadUserOrders(auth.currentUser);
      }
    };
    window.addEventListener('amal_store_updated', onStoreSync);
    return () => window.removeEventListener('amal_store_updated', onStoreSync);
  }, [loadUserOrders]);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      setUser(cred.user);
      await loadOrCreateProfile(cred.user);
      await loadUserOrders(cred.user);
      return { user: cred.user };
    } catch (err: any) {
      const code = err?.code || '';
      let msg = 'Google login failed. Please try again.';
      if (code === 'auth/popup-closed-by-user') {
        msg = 'ലോഗിൻ വിൻഡോ ക്ലോസ് ചെയ്തു. ദയവായി വീണ്ടും ശ്രമിക്കുക. (Sign-in popup was closed)';
      } else if (code === 'auth/popup-blocked') {
        msg = 'ബ്രൗസർ പോപ്പ്-അപ്പ് ബ്ലോക്ക് ചെയ്തിരിക്കുന്നു. ദയവായി Popup അനുവദിക്കുക. (Popup blocked by browser)';
      } else if (err?.message) {
        msg = err.message;
      }
      return { user: null, error: msg };
    } finally {
      setSigningIn(false);
    }
  }, [loadOrCreateProfile, loadUserOrders]);

  const logout = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem(STORAGE_KEYS.CUSTOMER_SESSION);
    setUser(null);
    setProfile(null);
    setMyOrders([]);
  }, []);

  const updateUserProfile = useCallback(
    async (patch: Partial<UserProfile>): Promise<UserProfile | null> => {
      const current = auth.currentUser;
      if (!current) return null;

      const nextProfile: UserProfile = {
        uid: current.uid,
        email: current.email || profile?.email || '',
        name: (patch.name ?? profile?.name ?? current.displayName ?? 'Customer').trim(),
        photoURL: current.photoURL || profile?.photoURL || '',
        mobile: (patch.mobile ?? profile?.mobile ?? '').trim(),
        address: (patch.address ?? profile?.address ?? '').trim(),
        pincode: (patch.pincode ?? profile?.pincode ?? '').trim(),
        createdAt: profile?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setProfile(nextProfile);
      syncLocalProfileCache(nextProfile);

      try {
        await setDoc(doc(db, 'users', current.uid), nextProfile, { merge: true });
      } catch (err) {
        console.warn('Firestore profile save err:', err);
      }
      return nextProfile;
    },
    [profile, syncLocalProfileCache]
  );

  const refreshMyOrders = useCallback(async () => {
    return loadUserOrders(auth.currentUser);
  }, [loadUserOrders]);

  const recordLocalOrder = useCallback((orderRecord: any) => {
    const existingOrders = getLocalOrders();
    saveAllOrders([orderRecord, ...existingOrders]);
    setMyOrders(prev => [orderRecord, ...prev.filter(o => (o.orderId || o.id) !== orderRecord.orderId)]);
  }, []);

  const cancelMyOrder = useCallback(async (order: any) => {
    const targetOrderId = String(order.orderId || order.id);
    const nextMine = myOrders.map(o =>
      String(o.orderId || o.id) === targetOrderId ? { ...o, status: 'cancelled' } : o
    );
    setMyOrders(nextMine);

    const allLocal = getLocalOrders();
    const updatedLocal = allLocal.map(o =>
      String(o.orderId || o.id) === targetOrderId ? { ...o, status: 'cancelled' } : o
    );
    saveAllOrders(updatedLocal);

    const docId = order.docId || order.id;
    if (docId) {
      try {
        await updateDoc(doc(db, 'bookings', String(docId)), { status: 'cancelled' });
      } catch (err) {
        console.warn('Firestore cancel order err:', err);
      }
    }
  }, [myOrders]);

  const deleteMyOrder = useCallback(async (order: any) => {
    const targetOrderId = String(order.orderId || order.id || '');
    const docId = order.docId || order.id;

    setMyOrders(prev =>
      prev.filter(
        o => String(o.orderId || '') !== targetOrderId && String(o.id || '') !== String(docId || '')
      )
    );
    deleteOrderLocally(targetOrderId, docId ? String(docId) : undefined);

    if (docId) {
      try {
        await deleteDoc(doc(db, 'bookings', String(docId)));
      } catch (err) {
        console.warn('Firestore delete order err:', err);
      }
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        profile,
        myOrders,
        myOrdersCount: myOrders.length,
        loadingOrders,
        signingIn,
        signInWithGoogle,
        logout,
        updateUserProfile,
        refreshMyOrders,
        recordLocalOrder,
        cancelMyOrder,
        deleteMyOrder,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
