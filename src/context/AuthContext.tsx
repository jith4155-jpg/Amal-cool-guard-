import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  supabase,
  toAppUser,
  mapBookingFromDb,
  mapPromoterFromDb,
  mapPromoterToDb,
  mapPromoterSaleFromDb,
  mapUserProfileFromDb,
  mapUserProfileToDb,
  type AppUser,
} from '../supabase';
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
  signInWithGoogle: (
    redirectPath?: string
  ) => Promise<{ user: AppUser | null; error?: string; isIframeBlocked?: boolean }>;
  getGoogleOAuthUrl: (redirectPath?: string) => Promise<string | null>;
  signInWithEmail: (email: string, password: string) => Promise<{ user: AppUser | null; error?: string }>;
  signUpWithEmail: (
    email: string,
    password: string,
    fullName?: string
  ) => Promise<{
    user: AppUser | null;
    error?: string;
    message?: string;
    needsEmailConfirmation?: boolean;
    alreadyRegistered?: boolean;
  }>;
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
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('uid', appUser.uid)
          .maybeSingle();
        if (!error && data) {
          remoteData = mapUserProfileFromDb(data);
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

      if (!remoteData) {
        try {
          await supabase
            .from('users')
            .upsert(mapUserProfileToDb(mergedProfile), { onConflict: 'uid' });
        } catch (err) {
          console.warn('Could not persist initial user profile to Supabase:', err);
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

      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('user_id', targetUser.uid)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          fetchSucceeded = true;
          data.forEach(row => {
            const mapped = mapBookingFromDb(row);
            const oid = String(mapped.orderId || '');
            const did = String(mapped.id || '');
            if (deletedSet.has(oid) || deletedSet.has(did)) return;
            remoteDocs.push(mapped);
          });
        }
      } catch (err) {
        console.warn('Supabase user bookings query fallback:', err);
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

      // 1. Remote PII-free promoter_sales scoped by promoter_user_id or promoter_email
      try {
        const { data, error } = await supabase
          .from('promoter_sales')
          .select('*')
          .eq('promoter_user_id', targetUser.uid)
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          data.forEach(row => {
            const mapped = mapPromoterSaleFromDb(row);
            const key = String(mapped.orderId || mapped.id);
            if (!deletedOrderIds.has(key) && !deletedOrderIds.has(String(mapped.bookingDocId || ''))) {
              salesMap.set(key, mapped);
            }
          });
        }
      } catch (err) {
        console.warn('Promoter sales UID query fallback:', err);
      }

      if (targetUser.email) {
        try {
          const { data, error } = await supabase
            .from('promoter_sales')
            .select('*')
            .ilike('promoter_email', targetUser.email)
            .order('created_at', { ascending: false });
          if (!error && Array.isArray(data)) {
            data.forEach(row => {
              const mapped = mapPromoterSaleFromDb(row);
              const key = String(mapped.orderId || mapped.id);
              if (!deletedOrderIds.has(key) && !deletedOrderIds.has(String(mapped.bookingDocId || ''))) {
                if (!salesMap.has(key)) salesMap.set(key, mapped);
              }
            });
          }
        } catch {
          // ignore
        }
      }

      // 2. Local orders matching this promoter's code
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

      // 1. Check Supabase promoters owned by this exact UID or Email
      try {
        const { data, error } = await supabase
          .from('promoters')
          .select('*')
          .eq('user_id', targetUser.uid);
        if (!error && Array.isArray(data)) {
          const validRow = data.find(r => !deletedIds.has(r.id));
          if (validRow) {
            found = mapPromoterFromDb(validRow);
          }
        }
      } catch (err) {
        console.warn('Supabase promoter UID query fallback:', err);
      }

      if (!found && targetUser.email) {
        try {
          const { data, error } = await supabase
            .from('promoters')
            .select('*')
            .ilike('email', targetUser.email);
          if (!error && Array.isArray(data)) {
            const validRow = data.find(r => !deletedIds.has(r.id));
            if (validRow) {
              found = mapPromoterFromDb(validRow);
            }
          }
        } catch {
          // ignore
        }
      }

      // 2. Check local promoters dict strictly matching this user's UID or Gmail
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

    const hydrateSession = async (appUser: AppUser | null) => {
      if (!mounted) return;
      setUser(appUser);
      if (appUser) {
        await Promise.all([
          loadOrCreateProfile(appUser),
          loadUserOrders(appUser),
          loadUserPromoter(appUser),
        ]);
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
        try {
          sessionStorage.removeItem('amal_oauth_pending');
        } catch {
          // ignore
        }
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        hydrateSession(toAppUser(data.session?.user));
      })
      .catch(() => {
        if (mounted) setAuthReady(true);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrateSession(toAppUser(session?.user));
    });

    const syncSessionOnReturn = () => {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          hydrateSession(toAppUser(data.session?.user));
        })
        .catch(() => {
          // ignore
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncSessionOnReturn();
      }
    };

    window.addEventListener('focus', syncSessionOnReturn);
    window.addEventListener('storage', syncSessionOnReturn);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener('focus', syncSessionOnReturn);
      window.removeEventListener('storage', syncSessionOnReturn);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadOrCreateProfile, loadUserOrders, loadUserPromoter]);

  // Real-time Supabase listener for user's bookings (Approval, Tracking, ETA, Courier Dispatched / Delivered)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`bookings-user-${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `user_id=eq.${user.uid}`,
        },
        () => {
          loadUserOrders(user);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadUserOrders]);

  // Real-time Supabase listener for Promoter sales & delivery updates
  useEffect(() => {
    if (!user || !myPromoter) return;
    const channel = supabase
      .channel(`promoter-sales-${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'promoter_sales',
          filter: `promoter_user_id=eq.${user.uid}`,
        },
        () => {
          loadPromoterSales(user, myPromoter);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, myPromoter, loadPromoterSales]);

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

  const signInWithGoogle = useCallback(async (redirectPath?: string) => {
    setSigningIn(true);
    try {
      const inIframe = (() => {
        try {
          return window.self !== window.top;
        } catch {
          return true;
        }
      })();

      if (inIframe) {
        setSigningIn(false);
        return {
          user: null,
          isIframeBlocked: true,
          error:
            'Preview വിൻഡോയിൽ Email & Password വഴി ലോഗിൻ ചെയ്യുക, അല്ലെങ്കിൽ പുതിയ ബ്രൗസർ ടാബിൽ തുറന്ന് Google ലോഗിൻ ഉപയോഗിക്കുക.',
        };
      }

      let targetUrl = `${window.location.origin}/`;
      try {
        const currentPath = window.location.pathname;
        if (redirectPath && redirectPath.startsWith('/')) {
          targetUrl = new URL(redirectPath, window.location.origin).toString();
        } else if (
          currentPath.startsWith('/admin') ||
          currentPath.startsWith('/promoter') ||
          currentPath.startsWith('/product/')
        ) {
          targetUrl = window.location.href;
        }
      } catch {
        targetUrl = `${window.location.origin}/`;
      }

      try {
        sessionStorage.setItem('amal_oauth_pending', '1');
      } catch {
        // ignore
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: targetUrl,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
      if (error) {
        try {
          sessionStorage.removeItem('amal_oauth_pending');
        } catch {
          // ignore
        }
        setSigningIn(false);
        return { user: null, error: error.message };
      }
      return { user: null };
    } catch (err: any) {
      setSigningIn(false);
      return {
        user: null,
        error: err?.message || 'Google login failed. Please try again.',
      };
    }
  }, []);

  const getGoogleOAuthUrl = useCallback(async (redirectPath?: string): Promise<string | null> => {
    try {
      let targetUrl = `${window.location.origin}/`;
      try {
        if (redirectPath && redirectPath.startsWith('/')) {
          targetUrl = new URL(redirectPath, window.location.origin).toString();
        }
      } catch {
        targetUrl = `${window.location.origin}/`;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: targetUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
      if (error || !data?.url) return null;
      return data.url;
    } catch {
      return null;
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setSigningIn(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          return { user: null, error: error.message };
        }
        const appUser = toAppUser(data.user);
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
        return { user: null, error: err?.message || 'Sign in failed.' };
      } finally {
        setSigningIn(false);
      }
    },
    [loadOrCreateProfile, loadUserOrders, loadUserPromoter]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, fullName?: string) => {
      setSigningIn(true);
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: (fullName || email.split('@')[0] || 'Customer').trim(),
            },
          },
        });
        if (error) {
          return { user: null, error: error.message };
        }
        if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
          return {
            user: null,
            alreadyRegistered: true,
            error: 'ഈ ഇമെയിൽ ഇതിനകം രജിസ്റ്റർ ചെയ്തതാണ്. താഴെ Sign In വഴി ലോഗിൻ ചെയ്യുക.',
          };
        }
        const appUser = toAppUser(data.user);
        if (data.session && appUser) {
          setUser(appUser);
          await Promise.all([
            loadOrCreateProfile(appUser),
            loadUserOrders(appUser),
            loadUserPromoter(appUser),
          ]);
          return { user: appUser };
        }
        return {
          user: null,
          needsEmailConfirmation: true,
          message:
            'അക്കൗണ്ട് രജിസ്റ്റർ ആയി! നിങ്ങളുടെ Email/Gmail Inbox-ൽ വന്ന കൺഫർമേഷൻ ലിങ്കിൽ ക്ലിക്ക് ചെയ്ത ശേഷം താഴെ Sign In ചെയ്യുക.',
        };
      } catch (err: any) {
        return { user: null, error: err?.message || 'Sign up failed.' };
      } finally {
        setSigningIn(false);
      }
    },
    [loadOrCreateProfile, loadUserOrders, loadUserPromoter]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
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
      const { data: sessData } = await supabase.auth.getUser();
      const current = toAppUser(sessData.user) || user;
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
        await supabase
          .from('users')
          .upsert(mapUserProfileToDb(nextProfile), { onConflict: 'uid' });
      } catch (err) {
        console.warn('Supabase profile save err:', err);
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
      const { data: sessData } = await supabase.auth.getUser();
      const current = toAppUser(sessData.user) || user;
      if (!current || !current.email) return null;

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
            const { data: existingRemote } = await supabase.rpc('resolve_promoter_referral', {
              ref_code: generatedCode,
            });
            if (!Array.isArray(existingRemote) || existingRemote.length === 0) break;
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
        name: input.name.trim(),
        phone: input.phone.trim(),
        channelName: input.channelName?.trim() || 'YouTuber / Influencer',
        paymentType: input.paymentType,
        ...(input.upiId ? { upiId: input.upiId.trim() } : {}),
        ...(input.bankName ? { bankName: input.bankName.trim() } : {}),
        ...(input.accountNumber ? { accountNumber: input.accountNumber.trim() } : {}),
        ...(input.ifscCode ? { ifscCode: input.ifscCode.trim().toUpperCase() } : {}),
        ...(input.accountHolderName ? { accountHolderName: input.accountHolderName.trim() } : {}),
        createdAt: new Date().toISOString(),
        commissionPerSale: 100,
        paidAmount: 0,
      };

      allPromoters[generatedCode] = newPromoter;
      safeSetStorage(STORAGE_KEYS.PROMOTERS_LIST, JSON.stringify(allPromoters));
      setMyPromoter(newPromoter);

      try {
        await supabase.from('promoters').upsert(mapPromoterToDb(newPromoter), { onConflict: 'id' });
      } catch (err) {
        console.warn('Promoter Supabase sync err:', err);
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
      const { data: sessData } = await supabase.auth.getUser();
      const current = toAppUser(sessData.user) || user;
      if (!current || !myPromoter) return null;

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
        accountNumber: input.paymentType === 'bank' ? (input.accountNumber || '').trim().slice(0, 64) : '',
        ifscCode: input.paymentType === 'bank' ? (input.ifscCode || '').trim().toUpperCase().slice(0, 32) : '',
        accountHolderName:
          input.paymentType === 'bank'
            ? (input.accountHolderName?.trim() || input.name.trim()).slice(0, 120)
            : '',
        createdAt: myPromoter.createdAt || new Date().toISOString(),
        commissionPerSale: typeof myPromoter.commissionPerSale === 'number' ? myPromoter.commissionPerSale : 100,
        paidAmount: typeof myPromoter.paidAmount === 'number' ? myPromoter.paidAmount : 0,
      };

      const allPromoters = getPromotersDict();
      allPromoters[myPromoter.id] = updatedPromoter;
      safeSetStorage(STORAGE_KEYS.PROMOTERS_LIST, JSON.stringify(allPromoters));
      setMyPromoter(updatedPromoter);

      try {
        await supabase
          .from('promoters')
          .update({
            name: updatedPromoter.name,
            phone: updatedPromoter.phone,
            channel_name: updatedPromoter.channelName,
            payment_type: updatedPromoter.paymentType,
            upi_id: updatedPromoter.upiId || '',
            bank_name: updatedPromoter.bankName || '',
            account_number: updatedPromoter.accountNumber || '',
            ifsc_code: updatedPromoter.ifscCode || '',
            account_holder_name: updatedPromoter.accountHolderName || '',
          })
          .eq('id', myPromoter.id);
      } catch (err) {
        console.warn('Promoter Supabase update fallback:', err);
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
    setMyOrders(prev => [orderRecord, ...prev.filter(o => (o.orderId || o.id) !== orderRecord.orderId)]);
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

      if (order.orderId) {
        try {
          await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('order_id', String(order.orderId));
        } catch (err) {
          console.warn('Supabase cancel order err:', err);
        }
      }
      if (order.orderId && (order.promoterId || order.referralCode)) {
        try {
          await supabase
            .from('promoter_sales')
            .update({ status: 'cancelled' })
            .eq('order_id', String(order.orderId));
        } catch {
          // ignore
        }
      }
    },
    [myOrders]
  );

  const deleteMyOrder = useCallback(async (order: any) => {
    const targetOrderId = String(order.orderId || order.id || '');
    const docId = order.docId || order.id;

    setMyOrders(prev =>
      prev.filter(
        o => String(o.orderId || '') !== targetOrderId && String(o.id || '') !== String(docId || '')
      )
    );
    deleteOrderLocally(targetOrderId, docId ? String(docId) : undefined);

    if (targetOrderId) {
      try {
        await supabase.from('bookings').delete().eq('order_id', targetOrderId);
      } catch (err) {
        console.warn('Supabase delete order err:', err);
      }
    }
    if (order.orderId && (order.promoterId || order.referralCode)) {
      try {
        await supabase.from('promoter_sales').delete().eq('order_id', String(order.orderId));
      } catch {
        // ignore
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
        myPromoter,
        myPromoterSales,
        loadingPromoter,
        signingIn,
        signInWithGoogle,
        getGoogleOAuthUrl,
        signInWithEmail,
        signUpWithEmail,
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
