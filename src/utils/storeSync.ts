import { MOCK_PRODUCTS, Product } from '../data/mockProducts';

export const STORAGE_KEYS = {
  CATALOG: 'amal_products_catalog',
  CACHED_PRODUCTS: 'amal_cached_products',
  CUSTOM_PRODUCTS: 'amal_custom_products',
  DELETED_PRODUCT_IDS: 'amal_deleted_product_ids',
  CATALOG_DIRTY: 'amal_catalog_dirty',
  ORDERS: 'amal_orders',
  CACHED_ORDERS: 'amal_cached_orders',
  DELETED_ORDER_IDS: 'amal_deleted_order_ids',
  REGISTERED_USERS: 'amal_registered_users',
  DELETED_CUSTOMER_MOBILES: 'amal_deleted_customer_mobiles',
  CUSTOMER_SESSION: 'amal_customer_session',
  PROMOTERS_LIST: 'amal_promoters_list',
  DELETED_PROMOTER_IDS: 'amal_deleted_promoter_ids',
  PROMOTER_SESSION: 'amal_promoter_session',
  PAYMENT_SETTINGS: 'amal_payment_settings',
  WISHLIST: 'amal_wishlist',
  SESSION_REFERRAL: 'amal_session_referral_code',
  LEGACY_REFERRAL: 'amal_active_referral_code',
};

export const DEFAULT_STORE_BASE_URL = 'https://amal-cool-guard.vercel.app';

let hasHandledInitialReferralEntry = false;

export function notifyStoreUpdated() {
  try {
    window.dispatchEvent(new Event('amal_store_updated'));
  } catch {
    // ignore
  }
}

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeSetStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`Storage quota issue for ${key}:`, err);
    return false;
  }
}

/**
 * Compresses an uploaded image File into a compact JPEG Data URL (~40-100KB)
 * so multiple product gallery images & screenshots fit comfortably in localStorage & Firestore (<1MB).
 */
export async function compressImageFile(
  file: File,
  maxDimension = 900,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width || maxDimension;
          let height = img.naturalHeight || img.height || maxDimension;

          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          // White background ensures transparent PNGs convert cleanly to JPEG
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('Invalid or unsupported image file'));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// ---------------- PRODUCT CATALOG SYNC ----------------

export function getDeletedProductIds(): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(STORAGE_KEYS.DELETED_PRODUCT_IDS), []);
}

export function isProductDeleted(productId: string): boolean {
  return getDeletedProductIds().includes(productId);
}

export function getCatalogProducts(): Product[] {
  const deletedSet = new Set(getDeletedProductIds());

  // 1. Authoritative catalog edited/managed by Admin
  const rawCatalog = localStorage.getItem(STORAGE_KEYS.CATALOG);
  if (rawCatalog !== null) {
    const parsed = safeJsonParse<Product[]>(rawCatalog, []);
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p && p.id && !deletedSet.has(p.id));
    }
  }

  // 2. Migrate legacy cached / custom / mock data once
  const cachedRemote = safeJsonParse<Product[]>(localStorage.getItem(STORAGE_KEYS.CACHED_PRODUCTS), []);
  const customLocal = safeJsonParse<Product[]>(localStorage.getItem(STORAGE_KEYS.CUSTOM_PRODUCTS), []);

  const mergedMap = new Map<string, Product>();
  for (const item of [...customLocal, ...cachedRemote, ...MOCK_PRODUCTS]) {
    if (item && item.id && !deletedSet.has(item.id) && !mergedMap.has(item.id)) {
      mergedMap.set(item.id, item);
    }
  }

  const initialList = Array.from(mergedMap.values());
  saveCatalogProducts(initialList, false);
  return initialList;
}

export function saveCatalogProducts(list: Product[], markDirty = true): boolean {
  const deletedSet = new Set(getDeletedProductIds());
  const cleanList = list.filter(p => p && p.id && !deletedSet.has(p.id));
  const serialized = JSON.stringify(cleanList);
  const okCatalog = safeSetStorage(STORAGE_KEYS.CATALOG, serialized);
  safeSetStorage(STORAGE_KEYS.CACHED_PRODUCTS, serialized);
  if (markDirty) {
    safeSetStorage(STORAGE_KEYS.CATALOG_DIRTY, 'true');
  }
  notifyStoreUpdated();
  return okCatalog;
}

export function addCatalogProduct(newProd: Product): Product[] {
  // Ensure ID is not marked deleted
  const deleted = getDeletedProductIds().filter(id => id !== newProd.id);
  safeSetStorage(STORAGE_KEYS.DELETED_PRODUCT_IDS, JSON.stringify(deleted));

  const current = getCatalogProducts();
  const next = [newProd, ...current.filter(p => p.id !== newProd.id)];
  saveCatalogProducts(next, true);

  const customLocal = safeJsonParse<Product[]>(localStorage.getItem(STORAGE_KEYS.CUSTOM_PRODUCTS), []);
  safeSetStorage(
    STORAGE_KEYS.CUSTOM_PRODUCTS,
    JSON.stringify([newProd, ...customLocal.filter(p => p.id !== newProd.id)])
  );
  return next;
}

export function updateCatalogProduct(updatedProd: Product): Product[] {
  const current = getCatalogProducts();
  const exists = current.some(p => p.id === updatedProd.id);
  const next = exists
    ? current.map(p => (p.id === updatedProd.id ? updatedProd : p))
    : [updatedProd, ...current];
  saveCatalogProducts(next, true);

  const customLocal = safeJsonParse<Product[]>(localStorage.getItem(STORAGE_KEYS.CUSTOM_PRODUCTS), []);
  const customExists = customLocal.some(p => p.id === updatedProd.id);
  const nextCustom = customExists
    ? customLocal.map(p => (p.id === updatedProd.id ? updatedProd : p))
    : [updatedProd, ...customLocal];
  safeSetStorage(STORAGE_KEYS.CUSTOM_PRODUCTS, JSON.stringify(nextCustom));
  return next;
}

export function deleteCatalogProduct(productId: string): Product[] {
  const deleted = Array.from(new Set([...getDeletedProductIds(), productId]));
  safeSetStorage(STORAGE_KEYS.DELETED_PRODUCT_IDS, JSON.stringify(deleted));

  const current = getCatalogProducts();
  const next = current.filter(p => p.id !== productId);
  saveCatalogProducts(next, true);

  const customLocal = safeJsonParse<Product[]>(localStorage.getItem(STORAGE_KEYS.CUSTOM_PRODUCTS), []);
  safeSetStorage(
    STORAGE_KEYS.CUSTOM_PRODUCTS,
    JSON.stringify(customLocal.filter(p => p.id !== productId))
  );

  // Also clean deleted product from customer wishlist
  const wishlist = safeJsonParse<string[]>(localStorage.getItem(STORAGE_KEYS.WISHLIST), []);
  if (wishlist.includes(productId)) {
    safeSetStorage(STORAGE_KEYS.WISHLIST, JSON.stringify(wishlist.filter(id => id !== productId)));
  }

  return next;
}

export function mergeRemoteCatalogProducts(remoteProducts: Product[]): Product[] {
  const deletedSet = new Set(getDeletedProductIds());
  const localCatalog = getCatalogProducts();
  const isDirty = localStorage.getItem(STORAGE_KEYS.CATALOG_DIRTY) === 'true';

  if (!isDirty) {
    // Remote is fresh & nothing pending locally: filter deleted IDs cleanly
    const filteredRemote = remoteProducts.filter(p => !deletedSet.has(p.id));
    if (filteredRemote.length > 0) {
      saveCatalogProducts(filteredRemote, false);
      return filteredRemote;
    }
    return localCatalog;
  }

  // Admin has local edits/adds that may not have written to Firestore due to auth rules:
  // Keep local items intact and append any unseen non-deleted remote items.
  const localMap = new Map(localCatalog.map(p => [p.id, p]));
  const combined = [...localCatalog];
  for (const r of remoteProducts) {
    if (!deletedSet.has(r.id) && !localMap.has(r.id)) {
      combined.push(r);
    }
  }
  saveCatalogProducts(combined, true);
  return combined;
}

export function restoreDefaultCatalogProducts(): Product[] {
  safeSetStorage(STORAGE_KEYS.DELETED_PRODUCT_IDS, JSON.stringify([]));
  const current = getCatalogProducts();
  const existingIds = new Set(current.map(p => p.id));
  const missingDefaults = MOCK_PRODUCTS.filter(m => !existingIds.has(m.id));
  const next = [...current, ...missingDefaults];
  saveCatalogProducts(next, true);
  return next;
}

// ---------------- ORDERS SYNC ----------------

export function getDeletedOrderIds(): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(STORAGE_KEYS.DELETED_ORDER_IDS), []);
}

export function getLocalOrders(): any[] {
  const deletedSet = new Set(getDeletedOrderIds());
  const primary = safeJsonParse<any[]>(localStorage.getItem(STORAGE_KEYS.ORDERS), []);
  const cached = safeJsonParse<any[]>(localStorage.getItem(STORAGE_KEYS.CACHED_ORDERS), []);

  const map = new Map<string, any>();
  for (const o of [...primary, ...cached]) {
    const key = String(o.orderId || o.id || '');
    if (!key || deletedSet.has(key) || (o.id && deletedSet.has(String(o.id)))) continue;
    if (!map.has(key)) map.set(key, o);
  }
  return Array.from(map.values());
}

export function saveAllOrders(orders: any[]) {
  const deletedSet = new Set(getDeletedOrderIds());
  const clean = orders.filter(o => {
    const oid = String(o.orderId || '');
    const did = String(o.id || '');
    return !deletedSet.has(oid) && !deletedSet.has(did);
  });
  const serialized = JSON.stringify(clean);
  safeSetStorage(STORAGE_KEYS.ORDERS, serialized);
  safeSetStorage(STORAGE_KEYS.CACHED_ORDERS, serialized);
  notifyStoreUpdated();
  return clean;
}

export function deleteOrderLocally(orderId: string, docId?: string): any[] {
  const idsToDelete = [orderId, docId].filter(Boolean).map(String);
  const deleted = Array.from(new Set([...getDeletedOrderIds(), ...idsToDelete]));
  safeSetStorage(STORAGE_KEYS.DELETED_ORDER_IDS, JSON.stringify(deleted));

  const current = getLocalOrders();
  const next = current.filter(
    o => !idsToDelete.includes(String(o.orderId || '')) && !idsToDelete.includes(String(o.id || ''))
  );
  saveAllOrders(next);
  return next;
}

// ---------------- CUSTOMERS SYNC ----------------

export function getDeletedCustomerMobiles(): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(STORAGE_KEYS.DELETED_CUSTOMER_MOBILES), []);
}

export function deleteCustomerLocally(mobile: string) {
  const cleanMobile = mobile.trim();
  const deleted = Array.from(new Set([...getDeletedCustomerMobiles(), cleanMobile]));
  safeSetStorage(STORAGE_KEYS.DELETED_CUSTOMER_MOBILES, JSON.stringify(deleted));

  const regUsers = safeJsonParse<Record<string, any>>(localStorage.getItem(STORAGE_KEYS.REGISTERED_USERS), {});
  if (regUsers[cleanMobile]) {
    delete regUsers[cleanMobile];
    safeSetStorage(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(regUsers));
  }

  const session = safeJsonParse<any>(localStorage.getItem(STORAGE_KEYS.CUSTOMER_SESSION), null);
  if (session && session.mobile === cleanMobile) {
    localStorage.removeItem(STORAGE_KEYS.CUSTOMER_SESSION);
  }
  notifyStoreUpdated();
}

export function restoreDeletedCustomerMobile(mobile: string) {
  const cleanMobile = mobile.trim();
  const next = getDeletedCustomerMobiles().filter(m => m !== cleanMobile);
  safeSetStorage(STORAGE_KEYS.DELETED_CUSTOMER_MOBILES, JSON.stringify(next));
}

// ---------------- PROMOTERS & REFERRAL SYNC ----------------

export function getDeletedPromoterIds(): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(STORAGE_KEYS.DELETED_PROMOTER_IDS), []);
}

export function getPromotersDict(): Record<string, any> {
  const deletedSet = new Set(getDeletedPromoterIds());
  const dict = safeJsonParse<Record<string, any>>(localStorage.getItem(STORAGE_KEYS.PROMOTERS_LIST), {});
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(dict)) {
    if (!deletedSet.has(k) && v && !deletedSet.has(String(v.id || k))) {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

export function deletePromoterLocally(promoterId: string) {
  const deleted = Array.from(new Set([...getDeletedPromoterIds(), promoterId]));
  safeSetStorage(STORAGE_KEYS.DELETED_PROMOTER_IDS, JSON.stringify(deleted));

  const dict = safeJsonParse<Record<string, any>>(localStorage.getItem(STORAGE_KEYS.PROMOTERS_LIST), {});
  delete dict[promoterId];
  safeSetStorage(STORAGE_KEYS.PROMOTERS_LIST, JSON.stringify(dict));

  const activeSession = safeJsonParse<any>(localStorage.getItem(STORAGE_KEYS.PROMOTER_SESSION), null);
  if (activeSession && activeSession.id === promoterId) {
    localStorage.removeItem(STORAGE_KEYS.PROMOTER_SESSION);
  }
  notifyStoreUpdated();
}

/**
 * Returns the clean storefront URL for Promoter referral sharing.
 * Never leaks AI Studio dev/preview hosts (ais-*, *.run.app, localhost).
 */
export function getCleanStoreBaseUrl(): string {
  const settings = safeJsonParse<Record<string, any>>(localStorage.getItem(STORAGE_KEYS.PAYMENT_SETTINGS), {});
  const configured = typeof settings.storeBaseUrl === 'string' ? settings.storeBaseUrl.trim() : '';
  if (configured && configured.startsWith('http')) {
    return configured.replace(/\/+$/, '');
  }

  try {
    const host = window.location.hostname.toLowerCase();
    const isPreviewOrLocal =
      !host ||
      host.includes('ais-') ||
      host.includes('aistudio') ||
      host.endsWith('.run.app') ||
      host.includes('webcontainer') ||
      host === 'localhost' ||
      host === '127.0.0.1';

    if (!isPreviewOrLocal) {
      return window.location.origin.replace(/\/+$/, '');
    }
  } catch {
    // ignore
  }

  return DEFAULT_STORE_BASE_URL;
}

/**
 * Handles ?promoter=... / ?ref=... tracking strictly for promoter link visits.
 * Normal website visits & Google Search visits (without ?promoter= / ?ref=)
 * clear any lingering referral code so the "Referred by Creator" banner NEVER shows uninvited.
 */
export function syncReferralFromUrl(isStoreHomeEntry = true): string | null {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramCode = (urlParams.get('promoter') || urlParams.get('ref') || '').trim().toUpperCase();

    if (paramCode) {
      sessionStorage.setItem(STORAGE_KEYS.SESSION_REFERRAL, paramCode);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_REFERRAL);
      hasHandledInitialReferralEntry = true;
      return paramCode;
    }

    // If the user opened the homepage on a fresh entry (e.g. direct URL or Google Search) without ?promoter=
    if (isStoreHomeEntry && !hasHandledInitialReferralEntry) {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_REFERRAL);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_REFERRAL);
      hasHandledInitialReferralEntry = true;
      return null;
    }

    hasHandledInitialReferralEntry = true;
    return sessionStorage.getItem(STORAGE_KEYS.SESSION_REFERRAL);
  } catch {
    return null;
  }
}

export function getActiveReferralCode(): string | null {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramCode = (urlParams.get('promoter') || urlParams.get('ref') || '').trim().toUpperCase();
    if (paramCode) return paramCode;
    return sessionStorage.getItem(STORAGE_KEYS.SESSION_REFERRAL);
  } catch {
    return null;
  }
}

export function clearActiveReferralCode() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_REFERRAL);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_REFERRAL);
  } catch {
    // ignore
  }
}
