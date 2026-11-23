import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  toAppUser,
  mapBookingFromDb,
  mapPromoterFromDb,
  mapPromoterToDb,
  mapPromoterSaleFromDb,
  mapUserProfileFromDb,
  mapUserProfileToDb,
  OperationType,
  handleFirestoreError,
  type AppUser,
} from '../firebase';
import {
  getLocalOrders,
  saveAllOrders,
  mergeRemoteUserOrdersIntoLocal,
  deleteOrderLocally,
  getDeletedOrderIds,
  getPromotersDict,
  getDeletedPromoterIds,
  safeJsonParse,
  safeSetStorage,
  notifyStoreUpdated,
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

export interface PromoterRecord {
  id: string;
  userId?: string;
  email?: string;
  name: string;
  phone: string;
  channelName?: string;
  paymentType: 'upi' | 'bank';
  upiId?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  createdAt: string;
  commissionPerSale: number;
  paidAmount?: number;
}

interface AuthContextValue {
  user: AppUser | null;
  authReady: boolean;
  profile: UserProfile | null;
  myOrders: any[];
  myOrdersCount: number;
  loadingOrders: boolean;
  myPromoter: PromoterRecord | null;
  myPromoterSales: any[];
  loadingPromoter: boolean;
  signingIn: boolean;
  signInWithGoogle: () => Promise<{ user: AppUser | null; error?: string }>;
  logout: () => Promise<void>;
  updateUserProfile: (patch: Partial<UserProfile>) => Promise<UserProfile | null>;
  refreshMyOrders: () => Promise<any[]>;
  refreshMyPromoter: () => Promise<PromoterRecord | null>;
  registerMyPromoter: (
    data: Omit<PromoterRecord, 'id' | 'userId' | 'email' | 'createdAt' | 'commissionPerSale' | 'paidAmount'>
  ) => Promise<PromoterRecord | null>;
  updateMyPromoter: (
    data: Omit<PromoterRecord, 'id' | 'userId' | 'email' | 'createdAt' | 'commissionPerSale' | 'paidAmount'>
  ) => Promise<PromoterRecord | null>;
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

function belongsToUser(order: any, user: AppUser): boolean {
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

function promoterBelongsToUser(prom: any, user: AppUser): boolean {
  if (!prom || !user) return false;
  if (prom.userId && prom.userId === user.uid) return true;
  if (
    prom.email &&
    user.email &&
    String(prom.email).trim().toLowerCase() === String(user.email).trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [myPromoter, setMyPromoter] = useState<PromoterRecord | null>(null);
  const [myPromoterSales, setMyPromoterSales] = useState<any[]>([]);
  const [loadingPromoter, setLoadingPromoter] = useState(false);
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
    async (appUser: AppUser): Promise<UserProfile> => {
      const localKey = `amal_user_profile_${appUser.uid}`;
      const cachedLocal = safeJsonParse<Partial<UserProfile> | null>(
        localStorage.getItem(localKey),
        null
      );

      let remoteData: Partial<UserProfile> | null = null;
      const userPath = `users/${appUser.uid}`;
      try {
        const snap = await getDoc(doc(db, 'users', appUser.uid));
        if (snap.exists()) {
          remoteData = mapUserProfileFromDb(snap.data(), snap.id);
        }
      } catch (err) {
        console.warn('Could not fetch remote user profile:', err);
      }

      const nowIso = new Date().toISOString();
      const mergedProfile: UserProfile = {
        uid: appUser.uid,
        email: appUser.email || remoteData?.email || cachedLocal?.email || '',
        name:
          remoteData?.name ||
          cachedLocal?.name ||
          appUser.displayName ||
          (appUser.email ? appUser.email.split('@')[0] : 'Customer'),
        photoURL: appUser.photoURL || remoteData?.photoURL || cachedLocal?.photoURL || '',
        mobile: remoteData?.mobile ?? cachedLocal?.mobile ?? '',
        address: remoteData?.address ?? cachedLocal?.address ?? '',
        pincode: remoteData?.pincode ?? cachedLocal?.pincode ?? '',
        createdAt: remoteData?.createdAt || cachedLocal?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      syncLocalProfileCache(mergedProfile);
      setProfile(mergedProfile);

      if (!remoteData && appUser.emailVerified) {
        try {
          await setDoc(doc(db, 'users', appUser.uid), mapUserProfileToDb(mergedProfile));
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, userPath);
        }
      }

      return mergedProfile;
    },
    [syncLocalProfileCache]
  );

  const applyRemoteUserOrders = useCallback(
    (targetUser: AppUser, remoteDocs: any[]): any[] => {
      const deletedSet = new Set(getDeletedOrderIds());
      const combinedMap = new Map<string, any>();

      const cleanRemote: any[] = [];
      for (const d of remoteDocs) {
        const oid = String(d.orderId || '');
        const did = String(d.docId || d.id || '');
        if (deletedSet.has(oid) || deletedSet.has(did)) continue;
        cleanRemote.push(d);
        const key = oid || did;
        if (key) combinedMap.set(key, d);
      }

      mergeRemoteUserOrdersIntoLocal(targetUser.uid, targetUser.email || '', cleanRemote);

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
    },
    []
  );

  const loadUserOrders = useCallback(
    async (targetUser: AppUser | null): Promise<any[]> => {
      if (!targetUser) {
        setMyOrders([]);
        setLoadingOrders(false);
        return [];
      }

      setLoadingOrders(true);
      const deletedSet = new Set(getDeletedOrderIds());
      const remoteDocs: any[] = [];
      let fetchSucceeded = false;

      if (targetUser.emailVerified) {
        try {
          const q = query(collection(db, 'bookings'), where('userId', '==', targetUser.uid));
          const snap = await getDocs(q);
          fetchSucceeded = true;
          snap.forEach(docSnap => {
            const mapped = mapBookingFromDb(docSnap.data(), docSnap.id);
            const oid = String(mapped.orderId || '');
            const did = String(mapped.id || '');
            if (deletedSet.has(oid) || deletedSet.has(did)) return;
            remoteDocs.push(mapped);
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'bookings');
        }
      }

      if (fetchSucceeded) {
        return applyRemoteUserOrders(targetUser, remoteDocs);
      }

      const combinedMap = new Map<string, any>();
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
    },
    [applyRemoteUserOrders]
  );

  const loadPromoterSales = useCallback(
    async (targetUser: AppUser, prom: PromoterRecord | null) => {
      if (!prom) {
        setMyPromoterSales([]);
        return [];
      }

      const deletedOrderIds = new Set(getDeletedOrderIds());
      const salesMap = new Map<string, any>();

      if (targetUser.emailVerified) {
        try {
          const qUid = query(
            collection(db, 'promoter_sales'),
            where('promoterUserId', '==', targetUser.uid)
          );
          const snapUid = await getDocs(qUid);
          snapUid.forEach(docSnap => {
            const mapped = mapPromoterSaleFromDb(docSnap.data(), docSnap.id);
            const key = String(mapped.orderId || mapped.id);
            if (!deletedOrderIds.has(key) && !deletedOrderIds.has(String(mapped.bookingDocId || ''))) {
              salesMap.set(key, mapped);
            }
          });
        } catch (err) {
          console.warn('Promoter sales UID query fallback:', err);
        }

        if (targetUser.email) {
          try {
            const qEmail = query(
              collection(db, 'promoter_sales'),
              where('promoterEmail', '==', targetUser.email)
            );
            const snapEmail = await getDocs(qEmail);
            snapEmail.forEach(docSnap => {
              const mapped = mapPromoterSaleFromDb(docSnap.data(), docSnap.id);
              const key = String(mapped.orderId || mapped.id);
              if (!deletedOrderIds.has(key) && !deletedOrderIds.has(String(mapped.bookingDocId || ''))) {
                if (!salesMap.has(key)) salesMap.set(key, mapped);
              }
            });
          } catch {
            // ignore email secondary lookup
          }
        }
      }

      const localOrders = getLocalOrders();
      for (const ord of localOrders) {
        const refMatch =
          ord.referralCode?.toUpperCase() === prom.id.toUpperCase() ||
          ord.promoterId?.toUpperCase() === prom.id.toUpperCase();
        if (!refMatch) continue;
        const key = String(ord.orderId || ord.id);
        if (deletedOrderIds.has(key) || deletedOrderIds.has(String(ord.id || ''))) continue;
        const existingRemote = salesMap.get(key);
        if (!existingRemote) {
          salesMap.set(key, {
            orderId: key,
            promoterId: prom.id,
            productId: ord.productId,
            productName: ord.productName || 'Amal Coolguard Vest',
            price: ord.price,
            commission: ord.promoterCommission ?? prom.commissionPerSale ?? 100,
            deliveryStatus: ord.deliveryStatus || 'pending',
            courierName: ord.courierName || '',
            trackingId: ord.trackingId || '',
            dispatchedAt: ord.dispatchedAt || '',
            deliveredAt: ord.deliveredAt || '',
            status: ord.status || 'pending_verification',
            createdAt: ord.createdAt,
          });
        } else {
          salesMap.set(key, {
            ...existingRemote,
            deliveryStatus:
              existingRemote.deliveryStatus && existingRemote.deliveryStatus !== 'pending'
                ? existingRemote.deliveryStatus
                : ord.deliveryStatus || existingRemote.deliveryStatus || 'pending',
            courierName: existingRemote.courierName || ord.courierName || '',
            trackingId: existingRemote.trackingId || ord.trackingId || '',
            dispatchedAt: existingRemote.dispatchedAt || ord.dispatchedAt || '',
            deliveredAt: existingRemote.deliveredAt || ord.deliveredAt || '',
          });
        }
      }

      const sorted = Array.from(salesMap.values()).sort(
        (a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt)
      );
      setMyPromoterSales(sorted);
      return sorted;
    },
    []
  );

  const loadUserPromoter = useCallback(
    async (targetUser: AppUser | null): Promise<PromoterRecord | null> => {
      if (!targetUser) {
        setMyPromoter(null);
        setMyPromoterSales([]);
        setLoadingPromoter(false);
        return null;
      }

      setLoadingPromoter(true);
      const deletedIds = new Set(getDeletedPromoterIds());
      let found: PromoterRecord | null = null;

      if (targetUser.emailVerified) {
        try {
          const qUid = query(collection(db, 'promoters'), where('userId', '==', targetUser.uid));
          const snapUid = await getDocs(qUid);
          const validDoc = snapUid.docs.find(d => !deletedIds.has(d.id));
          if (validDoc) {
            found = mapPromoterFromDb(validDoc.data(), validDoc.id);
          }
        } catch (err) {
          console.warn('Firestore promoter UID query fallback:', err);
        }

        if (!found && targetUser.email) {
          try {
            const qEmail = query(collection(db, 'promoters'), where('email', '==', targetUser.email));
            const snapEmail = await getDocs(qEmail);
            const validDoc = snapEmail.docs.find(d => !deletedIds.has(d.id));
            if (validDoc) {
              found = mapPromoterFromDb(validDoc.data(), validDoc.id);
            }
          } catch {
            // ignore secondary email lookup
          }
        }
      }

      const localDict = getPromotersDict();
      if (!found) {
        const localMatch = Object.values(localDict).find(
          (p: any) => !deletedIds.has(p.id) && promoterBelongsToUser(p, targetUser)
        );
        if (localMatch) {
          found = localMatch as PromoterRecord;
        }
      }

      if (found) {
        localDict[found.id] = found;
        safeSetStorage(STORAGE_KEYS.PROMOTERS_LIST, JSON.stringify(localDict));
      }

      setMyPromoter(found);
      await loadPromoterSales(targetUser, found);
      setLoadingPromoter(false);
      return found;
    },
    [loadPromoterSales]
  );

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, async fbUser => {
      if (!mounted) return;
      const appUser = toAppUser(fbUser);
      setUser(appUser);

      if (appUser) {
        try {
          await Promise.all([
            loadOrCreateProfile(appUser),
            loadUserOrders(appUser),
            loadUserPromoter(appUser),
          ]);
        } catch (err) {
          console.warn('Auth session hydration warning:', err);
        }
      } else {
        setProfile(null);
        setMyOrders([]);
        setMyPromoter(null);
        setMyPromoterSales([]);
        localStorage.removeItem(STORAGE_KEYS.CUSTOMER_SESSION);
        localStorage.removeItem(STORAGE_KEYS.PROMOTER_SESSION);
      }

      if (mounted) {
        setAuthReady(true);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [loadOrCreateProfile, loadUserOrders, loadUserPromoter]);

  // Real-time Firestore listener for user's bookings (Approval, Tracking, ETA, Delivery status)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const deletedSet = new Set(getDeletedOrderIds());
    const q = query(collection(db, 'bookings'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const remoteDocs: any[] = [];
        snapshot.forEach(docSnap => {
          const mapped = mapBookingFromDb(docSnap.data(), docSnap.id);
          const oid = String(mapped.orderId || '');
          const did = String(mapped.id || '');
          if (deletedSet.has(oid) || deletedSet.has(did)) return;
          remoteDocs.push(mapped);
        });
        applyRemoteUserOrders(user, remoteDocs);
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, applyRemoteUserOrders]);

  // Real-time Firestore listener for Promoter sales & delivery updates
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !myPromoter) return;
    const q = query(
      collection(db, 'promoter_sales'),
      where('promoterUserId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(
      q,
      () => {
        loadPromoterSales(user, myPromoter);
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'promoter_sales');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, myPromoter, loadPromoterSales]);

  useEffect(() => {
    const onStoreSync = () => {
      if (user) {
        loadUserOrders(user);
        loadUserPromoter(user);
      }
    };
    window.addEventListener('amal_store_updated', onStoreSync);
    return () => window.removeEventListener('amal_store_updated', onStoreSync);
  }, [user, loadUserOrders, loadUserPromoter]);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const appUser = toAppUser(cred.user);
      if (appUser) {
        setUser(appUser);
        await Promise.all([
          loadOrCreateProfile(appUser),
          loadUserOrders(appUser),
          loadUserPromoter(appUser),
        ]);
      }
      return { user: appUser };
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return {
          user: null,
          error: 'Google Sign-In was cancelled before selecting an account. Please tap Continue with Google again.',
        };
      }
      if (code === 'auth/popup-blocked') {
        return {
          user: null,
          error: 'Popup was blocked by your browser. Please allow popups for this site and tap Sign In again.',
        };
      }
      return {
        user: null,
        error: err?.message || 'Google Sign-In failed. Please try again.',
      };
    } finally {
      setSigningIn(false);
    }
  }, [loadOrCreateProfile, loadUserOrders, loadUserPromoter]);

  const logout = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem(STORAGE_KEYS.CUSTOMER_SESSION);
    localStorage.removeItem(STORAGE_KEYS.PROMOTER_SESSION);
    setUser(null);
    setProfile(null);
    setMyOrders([]);
    setMyPromoter(null);
    setMyPromoterSales([]);
  }, []);

  const updateUserProfile = useCallback(
    async (patch: Partial<UserProfile>): Promise<UserProfile | null> => {
      const current = toAppUser(auth.currentUser) || user;
      if (!current) return null;

      const nextProfile: UserProfile = {
        uid: current.uid,
        email: current.email || profile?.email || '',
        name: (patch.name ?? profile?.name ?? current.displayName ?? 'Customer').trim() || 'Customer',
        photoURL: current.photoURL || profile?.photoURL || '',
        mobile: (patch.mobile ?? profile?.mobile ?? '').trim(),
        address: (patch.address ?? profile?.address ?? '').trim(),
        pincode: (patch.pincode ?? profile?.pincode ?? '').trim(),
        createdAt: profile?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setProfile(nextProfile);
      syncLocalProfileCache(nextProfile);

      if (current.emailVerified) {
        const path = `users/${current.uid}`;
        try {
          await setDoc(doc(db, 'users', current.uid), mapUserProfileToDb(nextProfile), {
            merge: true,
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
      return nextProfile;
    },
    [user, profile, syncLocalProfileCache]
  );

  const registerMyPromoter = useCallback(
    async (
      input: Omit<
        PromoterRecord,
        'id' | 'userId' | 'email' | 'createdAt' | 'commissionPerSale' | 'paidAmount'
      >
    ): Promise<PromoterRecord | null> => {
      const current = toAppUser(auth.currentUser) || user;
      if (!current || !current.email || !current.emailVerified) return null;

      const existing = await loadUserPromoter(current);
      if (existing) return existing;

      const trimmedName = input.name.trim().toUpperCase().replace(/[^A-Z]/g, '');
      const firstLetter = trimmedName.charAt(0) || 'P';
      const lastLetter = trimmedName.length > 1 ? trimmedName.charAt(trimmedName.length - 1) : 'M';

      const allPromoters = getPromotersDict();
      let counterVal = Number(localStorage.getItem('amal_promoter_counter') || '1');
      let generatedCode = '';

      while (true) {
        const paddedNum = String(counterVal).padStart(2, '0');
        generatedCode = `${firstLetter}${paddedNum}${lastLetter}`;
        if (!allPromoters[generatedCode]) {
          try {
            const refSnap = await getDoc(doc(db, 'promoter_refs', generatedCode));
            if (!refSnap.exists()) break;
          } catch {
            break;
          }
        }
        counterVal++;
      }

      safeSetStorage('amal_promoter_counter', String(counterVal + 1));

      const newPromoter: PromoterRecord = {
        id: generatedCode,
        userId: current.uid,
        email: current.email,
        name: input.name.trim().slice(0, 120),
        phone: input.phone.trim().slice(0, 30),
        channelName: (input.channelName?.trim() || 'YouTuber / Influencer').slice(0, 120),
        paymentType: input.paymentType,
        ...(input.upiId ? { upiId: input.upiId.trim().slice(0, 120) } : {}),
        ...(input.bankName ? { bankName: input.bankName.trim().slice(0, 120) } : {}),
        ...(input.accountNumber ? { accountNumber: input.accountNumber.trim().slice(0, 64) } : {}),
        ...(input.ifscCode ? { ifscCode: input.ifscCode.trim().toUpperCase().slice(0, 32) } : {}),
        ...(input.accountHolderName
          ? { accountHolderName: input.accountHolderName.trim().slice(0, 120) }
          : {}),
        createdAt: new Date().toISOString(),
        commissionPerSale: 100,
        paidAmount: 0,
      };

      allPromoters[generatedCode] = newPromoter;
      safeSetStorage(STORAGE_KEYS.PROMOTERS_LIST, JSON.stringify(allPromoters));
      setMyPromoter(newPromoter);

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'promoters', generatedCode), mapPromoterToDb(newPromoter));
        batch.set(doc(db, 'promoter_refs', generatedCode), {
          id: generatedCode,
          promoterUserId: current.uid,
          commissionPerSale: 100,
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `promoters/${generatedCode}`);
      }

      await updateUserProfile({
        name: input.name.trim(),
        mobile: input.phone.trim(),
      });
      await loadPromoterSales(current, newPromoter);
      notifyStoreUpdated();

      return newPromoter;
    },
    [user, loadPromoterSales, loadUserPromoter, updateUserProfile]
  );

  const updateMyPromoter = useCallback(
    async (
      input: Omit<
        PromoterRecord,
        'id' | 'userId' | 'email' | 'createdAt' | 'commissionPerSale' | 'paidAmount'
      >
    ): Promise<PromoterRecord | null> => {
      const current = toAppUser(auth.currentUser) || user;
      if (!current || !current.emailVerified || !myPromoter) return null;

      const updatedPromoter: PromoterRecord = {
        id: myPromoter.id,
        userId: current.uid,
        email: current.email || myPromoter.email || '',
        name: input.name.trim().slice(0, 120),
        phone: input.phone.trim().slice(0, 30),
        channelName: (input.channelName?.trim() || 'YouTuber / Influencer').slice(0, 120),
        paymentType: input.paymentType,
        upiId: input.paymentType === 'upi' ? (input.upiId || '').trim().slice(0, 120) : '',
        bankName: input.paymentType === 'bank' ? (input.bankName || '').trim().slice(0, 120) : '',
        accountNumber:
          input.paymentType === 'bank' ? (input.accountNumber || '').trim().slice(0, 64) : '',
        ifscCode:
          input.paymentType === 'bank'
            ? (input.ifscCode || '').trim().toUpperCase().slice(0, 32)
            : '',
        accountHolderName:
          input.paymentType === 'bank'
            ? (input.accountHolderName?.trim() || input.name.trim()).slice(0, 120)
            : '',
        createdAt: myPromoter.createdAt || new Date().toISOString(),
        commissionPerSale:
          typeof myPromoter.commissionPerSale === 'number' ? myPromoter.commissionPerSale : 100,
        paidAmount: typeof myPromoter.paidAmount === 'number' ? myPromoter.paidAmount : 0,
      };

      const allPromoters = getPromotersDict();
      allPromoters[myPromoter.id] = updatedPromoter;
      safeSetStorage(STORAGE_KEYS.PROMOTERS_LIST, JSON.stringify(allPromoters));
      setMyPromoter(updatedPromoter);

      try {
        await updateDoc(doc(db, 'promoters', myPromoter.id), {
          userId: current.uid,
          name: updatedPromoter.name,
          phone: updatedPromoter.phone,
          channelName: updatedPromoter.channelName || 'YouTuber / Influencer',
          paymentType: updatedPromoter.paymentType,
          upiId: updatedPromoter.upiId || '',
          bankName: updatedPromoter.bankName || '',
          accountNumber: updatedPromoter.accountNumber || '',
          ifscCode: updatedPromoter.ifscCode || '',
          accountHolderName: updatedPromoter.accountHolderName || '',
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `promoters/${myPromoter.id}`);
      }

      await updateUserProfile({
        name: updatedPromoter.name,
        mobile: updatedPromoter.phone,
      });
      notifyStoreUpdated();

      return updatedPromoter;
    },
    [user, myPromoter, updateUserProfile]
  );

  const refreshMyOrders = useCallback(async () => {
    return loadUserOrders(user);
  }, [user, loadUserOrders]);

  const refreshMyPromoter = useCallback(async () => {
    return loadUserPromoter(user);
  }, [user, loadUserPromoter]);

  const recordLocalOrder = useCallback((orderRecord: any) => {
    const existingOrders = getLocalOrders();
    saveAllOrders([orderRecord, ...existingOrders]);
    setMyOrders(prev => [
      orderRecord,
      ...prev.filter(o => (o.orderId || o.id) !== orderRecord.orderId),
    ]);
  }, []);

  const resolveBookingDocIds = useCallback(async (order: any, uid: string): Promise<string[]> => {
    const ids = new Set<string>();
    if (order?.docId && !String(order.docId).startsWith('A')) {
      ids.add(String(order.docId));
    } else if (order?.docId) {
      ids.add(String(order.docId));
    }
    if (order?.id && order.id !== order.orderId) {
      ids.add(String(order.id));
    }

    if (ids.size === 0 && order?.orderId) {
      try {
        const q = query(collection(db, 'bookings'), where('userId', '==', uid));
        const snap = await getDocs(q);
        snap.forEach(d => {
          if (String(d.data().orderId || '') === String(order.orderId)) {
            ids.add(d.id);
          }
        });
      } catch {
        // ignore lookup fallback
      }
    }
    return Array.from(ids);
  }, []);

  const cancelMyOrder = useCallback(
    async (order: any) => {
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

      const currentUid = auth.currentUser?.uid || user?.uid;
      if (!currentUid) return;

      const docIds = await resolveBookingDocIds(order, currentUid);
      for (const bid of docIds) {
        try {
          await updateDoc(doc(db, 'bookings', bid), { status: 'cancelled' });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `bookings/${bid}`);
        }
      }

      if (order.orderId && (order.promoterId || order.referralCode)) {
        try {
          const saleRef = doc(db, 'promoter_sales', String(order.orderId));
          const saleSnap = await getDoc(saleRef);
          if (saleSnap.exists()) {
            await updateDoc(saleRef, { status: 'cancelled' });
          }
        } catch {
          // ignore if promoter_sales doc absent
        }
      }
    },
    [myOrders, user, resolveBookingDocIds]
  );

  const deleteMyOrder = useCallback(
    async (order: any) => {
      const targetOrderId = String(order.orderId || order.id || '');
      const docId = order.docId || order.id;

      setMyOrders(prev =>
        prev.filter(
          o => String(o.orderId || '') !== targetOrderId && String(o.id || '') !== String(docId || '')
        )
      );
      deleteOrderLocally(targetOrderId, docId ? String(docId) : undefined);

      const currentUid = auth.currentUser?.uid || user?.uid;
      if (!currentUid) return;

      const docIds = await resolveBookingDocIds(order, currentUid);
      for (const bid of docIds) {
        try {
          await deleteDoc(doc(db, 'bookings', bid));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `bookings/${bid}`);
        }
      }

      if (order.orderId && (order.promoterId || order.referralCode)) {
        try {
          const saleRef = doc(db, 'promoter_sales', String(order.orderId));
          const saleSnap = await getDoc(saleRef);
          if (saleSnap.exists()) {
            await deleteDoc(saleRef);
          }
        } catch {
          // ignore if promoter_sales doc absent
        }
      }
    },
    [user, resolveBookingDocIds]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        profile,
        myOrders,
        myOrdersCount: myOrders.length,
        loadingOrders,
        myPromoter,
        myPromoterSales,
        loadingPromoter,
        signingIn,
        signInWithGoogle,
        logout,
        updateUserProfile,
        refreshMyOrders,
        refreshMyPromoter,
        registerMyPromoter,
        updateMyPromoter,
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
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
