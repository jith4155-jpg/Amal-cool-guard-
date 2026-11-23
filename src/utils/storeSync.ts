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
  CATEGORIES: 'amal_custom_categories',
  CATEGORIES_INITIALIZED: 'amal_categories_initialized',
};

export const DEFAULT_CATEGORIES: string[] = [];

export interface StorePaymentSettings {
  enableCOD: boolean;
  enableUPI: boolean;
  enableCard: boolean;
  merchantUpiId: string;
  whatsappNumber?: string;
  storeBaseUrl?: string;
  gstNumber?: string;
  pickupName?: string;
  pickupPhone?: string;
  pickupAddress?: string;
  pickupPincode?: string;
  defaultDeliveryDays?: string;
  blockAccountOrders?: boolean;
  blockAccountWishlist?: boolean;
  blockAccountCoupons?: boolean;
  blockAccountHelp?: boolean;
}

export const DEFAULT_PAYMENT_SETTINGS: StorePaymentSettings = {
  enableCOD: true,
  enableUPI: true,
  enableCard: true,
  merchantUpiId: 'amalcoolguard@upi',
  whatsappNumber: '6238113451',
  storeBaseUrl: 'https://amalcoolguard.in',
  gstNumber: '',
  pickupName: 'Amal Coolguard',
  pickupPhone: '6238113451',
  pickupAddress: '',
  pickupPincode: '',
  defaultDeliveryDays: '3-5 Days',
  blockAccountOrders: false,
  blockAccountWishlist: false,
  blockAccountCoupons: false,
  blockAccountHelp: false,
};

export function calculateProductTotals(input: {
  price?: number;
  discountPrice?: number;
  gstPercent?: number;
  deliveryCharge?: number;
}) {
  const basePrice = Math.max(0, Number(input.discountPrice || input.price || 0));
  const originalBase = Math.max(basePrice, Number(input.price || basePrice));
  const gstPercent = Math.max(0, Number(input.gstPercent || 0));
  const deliveryFee = Math.max(0, Number(input.deliveryCharge || 0));

  const gstAmount = Math.round((basePrice * gstPercent) / 100);
  const originalGstAmount = Math.round((originalBase * gstPercent) / 100);

  const finalTotal = basePrice + gstAmount + deliveryFee;
  const originalTotal = originalBase + originalGstAmount + deliveryFee;

  return {
    basePrice,
    originalBase,
    gstPercent,
    gstAmount,
    deliveryFee,
    finalTotal,
    originalTotal,
  };
}

export const DEFAULT_STORE_BASE_URL = 'https://amalcoolguard.in';

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

export function estimateDataUrlKB(dataUrl: string): number {
  if (!dataUrl.startsWith('data:')) return 0;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64Len = dataUrl.length - commaIdx - 1;
  return Math.max(1, Math.round(((base64Len * 0.75) / 1024) * 10) / 10);
}

/**
 * Automatically resizes and optimizes uploaded product photos into the 10 KB – 50 KB target band
 * (sweet spot ~25–45 KB) for instant storefront loading and fast Firebase Storage/Firestore sync.
 */
export async function compressProductImageToRange(
  file: File,
  minKB = 10,
  maxKB = 50
): Promise<{ dataUrl: string; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const originalDataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const naturalW = img.naturalWidth || img.width || 720;
          const naturalH = img.naturalHeight || img.height || 720;

          const renderCandidate = (maxDim: number, quality: number) => {
            let w = naturalW;
            let h = naturalH;
            if (w > maxDim || h > maxDim) {
              if (w >= h) {
                h = Math.max(1, Math.round((h * maxDim) / w));
                w = maxDim;
              } else {
                w = Math.max(1, Math.round((w * maxDim) / h));
                h = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const ctx = canvas.getContext('2d');
            if (!ctx) return { url: originalDataUrl, kb: estimateDataUrlKB(originalDataUrl) };

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const url = canvas.toDataURL('image/jpeg', quality);
            return { url, kb: estimateDataUrlKB(url) };
          };

          // Try balanced resolution & quality steps to land squarely in 10 KB – 50 KB
          const dimSteps = [720, 600, 500, 420, 340, 260];
          const qualitySteps = [0.76, 0.64, 0.54, 0.44, 0.36, 0.28];

          let best = renderCandidate(720, 0.76);

          // If smaller than minKB at initial pass, bump quality to maximize crispness up to maxKB
          if (best.kb < minKB) {
            const hi = renderCandidate(900, 0.92);
            if (hi.kb <= maxKB) best = hi;
            resolve({ dataUrl: best.url, sizeKB: best.kb });
            return;
          }

          // Search for highest-quality candidate that stays <= maxKB (ideally 25–46 KB)
          outer: for (const dim of dimSteps) {
            for (const q of qualitySteps) {
              const cand = renderCandidate(dim, q);
              best = cand;
              if (cand.kb <= maxKB) {
                // If it dipped too close to minKB on a harsh drop, step quality up once to look sharper
                if (cand.kb < 24 && q < 0.85) {
                  const sharper = renderCandidate(dim, Math.min(0.88, q + 0.14));
                  if (sharper.kb <= maxKB && sharper.kb >= cand.kb) {
                    best = sharper;
                  }
                }
                break outer;
              }
            }
          }

          resolve({ dataUrl: best.url, sizeKB: best.kb });
        } catch {
          resolve({ dataUrl: originalDataUrl, sizeKB: estimateDataUrlKB(originalDataUrl) });
        }
      };
      img.onerror = () => reject(new Error('Invalid or unsupported image file'));
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an uploaded image File into a compact JPEG Data URL (~40-80KB)
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

export const DEFAULT_DELETED_PRODUCT_IDS = ['1', '2', '3', '4'];

export function getDeletedProductIds(): string[] {
  const local = safeJsonParse<string[] | null>(localStorage.getItem(STORAGE_KEYS.DELETED_PRODUCT_IDS), null);
  if (local !== null && Array.isArray(local)) {
    return Array.from(new Set([...DEFAULT_DELETED_PRODUCT_IDS, ...local.map(String)]));
  }
  return [...DEFAULT_DELETED_PRODUCT_IDS];
}

export function syncDeletedProductIds(ids: string[]): string[] {
  if (!Array.isArray(ids)) return getDeletedProductIds();
  const current = getDeletedProductIds();
  const next = Array.from(new Set([...current, ...ids.map(String)]));
  safeSetStorage(STORAGE_KEYS.DELETED_PRODUCT_IDS, JSON.stringify(next));

  // Purge deleted items from local cache
  const rawCatalog = localStorage.getItem(STORAGE_KEYS.CATALOG);
  if (rawCatalog !== null) {
    const parsed = safeJsonParse<Product[]>(rawCatalog, []);
    if (Array.isArray(parsed)) {
      const deletedSet = new Set(next);
      const cleaned = parsed.filter(p => p && p.id && !deletedSet.has(p.id));
      safeSetStorage(STORAGE_KEYS.CATALOG, JSON.stringify(cleaned));
      safeSetStorage(STORAGE_KEYS.CACHED_PRODUCTS, JSON.stringify(cleaned));
    }
  }
  notifyStoreUpdated();
  return next;
}

export function isProductDeleted(productId: string): boolean {
  return getDeletedProductIds().includes(String(productId));
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

  // 2. Default clean starter list (empty - no demo products)
  const initialList = MOCK_PRODUCTS.filter(p => !deletedSet.has(p.id));
  saveCatalogProducts(initialList, false);
  return initialList;
}

export function clearAllCatalogProducts(): Product[] {
  const current = getCatalogProducts();
  const allIds = current.map(p => p.id);
  const nextDeleted = Array.from(new Set([...getDeletedProductIds(), ...allIds, '1', '2', '3', '4']));
  safeSetStorage(STORAGE_KEYS.DELETED_PRODUCT_IDS, JSON.stringify(nextDeleted));
  safeSetStorage(STORAGE_KEYS.CATALOG, JSON.stringify([]));
  safeSetStorage(STORAGE_KEYS.CACHED_PRODUCTS, JSON.stringify([]));
  safeSetStorage(STORAGE_KEYS.CUSTOM_PRODUCTS, JSON.stringify([]));
  safeSetStorage(STORAGE_KEYS.CATALOG_DIRTY, 'true');
  notifyStoreUpdated();
  return [];
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

export function clearCatalogDirty() {
  try {
    localStorage.removeItem(STORAGE_KEYS.CATALOG_DIRTY);
  } catch {
    // ignore
  }
}

export function mergeRemoteCatalogProducts(remoteProducts: Product[]): Product[] {
  const deletedSet = new Set(getDeletedProductIds());
  const filteredRemote = remoteProducts.filter(p => p && p.id && !deletedSet.has(p.id));

  // Authoritative remote Firestore catalog always takes precedence across all devices/browsers
  if (filteredRemote.length > 0) {
    saveCatalogProducts(filteredRemote, false);
    return filteredRemote;
  }

  return getCatalogProducts();
}

export function resolveOrderProductImage(order: any, catalog?: Product[]): string {
  if (!order) return '';
  const direct = String(order.productImage || order.imageUrl || '').trim();
  if (direct) return direct;

  const list = catalog && catalog.length > 0 ? catalog : getCatalogProducts();
  const pid = String(order.productId || '').trim();
  if (pid) {
    const byId = list.find(p => p.id === pid);
    if (byId?.imageUrl) return byId.imageUrl;
    if (byId?.galleryImages?.[0]) return byId.galleryImages[0];
  }

  const pname = String(order.productName || '').trim().toLowerCase();
  if (pname) {
    const byName = list.find(p => p.name?.trim().toLowerCase() === pname);
    if (byName?.imageUrl) return byName.imageUrl;
    if (byName?.galleryImages?.[0]) return byName.galleryImages[0];
  }

  return '';
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

export function mergeRemoteUserOrdersIntoLocal(
  userId: string,
  userEmail: string,
  remoteOrders: any[]
) {
  const deletedSet = new Set(getDeletedOrderIds());
  const remoteByKey = new Map<string, any>();
  for (const r of remoteOrders) {
    const oid = String(r.orderId || '');
    const did = String(r.docId || r.id || '');
    if (deletedSet.has(oid) || deletedSet.has(did)) continue;
    if (oid) remoteByKey.set(oid, r);
    if (did) remoteByKey.set(did, r);
  }

  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  const matchesTargetUser = (o: any) => {
    if (!o) return false;
    if (o.userId && o.userId === userId) return true;
    if (o.userEmail && normalizedEmail && String(o.userEmail).trim().toLowerCase() === normalizedEmail) {
      return true;
    }
    return false;
  };

  const existingLocal = getLocalOrders();
  const nextOrders: any[] = [];
  const seenKeys = new Set<string>();

  for (const r of remoteOrders) {
    const oid = String(r.orderId || '');
    const did = String(r.docId || r.id || '');
    if (deletedSet.has(oid) || deletedSet.has(did)) continue;
    nextOrders.push(r);
    if (oid) seenKeys.add(oid);
    if (did) seenKeys.add(did);
  }

  for (const loc of existingLocal) {
    const oid = String(loc.orderId || '');
    const did = String(loc.docId || loc.id || '');
    if (seenKeys.has(oid) || seenKeys.has(did)) continue;

    // If a synced order (has docId) belongs to this user and is no longer returned by Firestore query,
    // it was deleted remotely by Admin/User — do not keep a ghost copy.
    if (matchesTargetUser(loc) && loc.docId) {
      continue;
    }
    nextOrders.push(loc);
  }

  const serialized = JSON.stringify(nextOrders);
  safeSetStorage(STORAGE_KEYS.ORDERS, serialized);
  safeSetStorage(STORAGE_KEYS.CACHED_ORDERS, serialized);
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
 * Ensures shareable storefront URLs NEVER expose vercel.app, mersal, or preview hosts.
 */
export function sanitizeStoreBaseUrl(raw?: string): string {
  const val = (raw || '').trim().replace(/\/+$/, '');
  const lower = val.toLowerCase();
  if (
    !val ||
    !val.startsWith('http') ||
    lower.includes('vercel.app') ||
    lower.includes('mersal') ||
    lower.includes('ais-') ||
    lower.includes('aistudio') ||
    lower.includes('.run.app') ||
    lower.includes('webcontainer') ||
    lower.includes('localhost') ||
    lower.includes('127.0.0.1')
  ) {
    return DEFAULT_STORE_BASE_URL;
  }
  return val;
}

/**
 * Returns the clean storefront URL for Promoter referral sharing.
 * Never leaks vercel.app, mersal, or AI Studio dev/preview hosts.
 */
export function getCleanStoreBaseUrl(): string {
  const settings = safeJsonParse<Record<string, any>>(localStorage.getItem(STORAGE_KEYS.PAYMENT_SETTINGS), {});
  const configured = typeof settings.storeBaseUrl === 'string' ? settings.storeBaseUrl.trim() : '';
  const sanitizedConfigured = sanitizeStoreBaseUrl(configured);
  if (configured && sanitizedConfigured !== DEFAULT_STORE_BASE_URL) {
    return sanitizedConfigured;
  }

  try {
    const origin = window.location.origin.replace(/\/+$/, '');
    return sanitizeStoreBaseUrl(origin);
  } catch {
    // ignore
  }

  return DEFAULT_STORE_BASE_URL;
}

export function getPromoterShareLink(promoterId: string, baseUrl?: string): string {
  const cleanBase = sanitizeStoreBaseUrl(baseUrl || getCleanStoreBaseUrl());
  return `${cleanBase}/?${encodeURIComponent(promoterId)}`;
}

const IGNORED_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'q',
  's',
  'search',
  'category',
  'lang',
  'mode',
  'v',
  'code',
  'state',
  'error',
  'error_code',
  'error_description',
  'type',
  'token_hash',
  'openorder',
  'redirect',
]);

function isOAuthCallbackUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash || '';
    if (
      params.has('state') ||
      params.has('error') ||
      params.has('error_code') ||
      hash.includes('access_token=') ||
      hash.includes('refresh_token=')
    ) {
      return true;
    }
    const rawCode = (params.get('code') || '').trim();
    if (rawCode && (rawCode.length > 20 || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawCode))) {
      return true;
    }
    return sessionStorage.getItem('amal_oauth_pending') === '1';
  } catch {
    return false;
  }
}

function extractReferralCodeFromSearch(search: string): string | null {
  try {
    const urlParams = new URLSearchParams(search);
    const rawCodeParam = (urlParams.get('code') || '').trim();
    const isShortPromoterCodeParam =
      Boolean(rawCodeParam) &&
      rawCodeParam.length <= 20 &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawCodeParam) &&
      !urlParams.has('state') &&
      !urlParams.has('error');

    const explicit = (
      urlParams.get('id') ||
      (isShortPromoterCodeParam ? rawCodeParam : '') ||
      urlParams.get('promoter') ||
      urlParams.get('ref') ||
      ''
    )
      .trim()
      .toUpperCase();
    if (explicit && /^[A-Z0-9_-]{2,20}$/i.test(explicit)) return explicit;

    // Support clean links like https://amalcoolguard.in/?A04H or ?L01N
    for (const [key, value] of urlParams.entries()) {
      const cleanKey = key.trim();
      if (
        !value &&
        cleanKey &&
        !IGNORED_QUERY_KEYS.has(cleanKey.toLowerCase()) &&
        /^[A-Z0-9_-]{2,20}$/i.test(cleanKey)
      ) {
        return cleanKey.toUpperCase();
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Handles ?<ID> (e.g. ?A04H) / ?id=... / ?promoter=... / ?ref=... silently in the background.
 * Preserves referral codes across OAuth sign-in redirects; normal fresh visits clear old codes.
 */
export function syncReferralFromUrl(isStoreHomeEntry = true): string | null {
  try {
    const paramCode = extractReferralCodeFromSearch(window.location.search);

    if (paramCode) {
      sessionStorage.setItem(STORAGE_KEYS.SESSION_REFERRAL, paramCode);
      localStorage.setItem(
        STORAGE_KEYS.LEGACY_REFERRAL,
        JSON.stringify({ code: paramCode, savedAt: Date.now() })
      );
      hasHandledInitialReferralEntry = true;
      return paramCode;
    }

    if (isOAuthCallbackUrl()) {
      const existing = getActiveReferralCode();
      hasHandledInitialReferralEntry = true;
      return existing;
    }

    // If the user opened the homepage on a fresh entry (e.g. direct URL or Google Search) without any ID param
    if (isStoreHomeEntry && !hasHandledInitialReferralEntry) {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_REFERRAL);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_REFERRAL);
      hasHandledInitialReferralEntry = true;
      return null;
    }

    hasHandledInitialReferralEntry = true;
    return getActiveReferralCode();
  } catch {
    return null;
  }
}

export function getActiveReferralCode(): string | null {
  try {
    const paramCode = extractReferralCodeFromSearch(window.location.search);
    if (paramCode) return paramCode;

    const sessionCode = (sessionStorage.getItem(STORAGE_KEYS.SESSION_REFERRAL) || '').trim().toUpperCase();
    if (sessionCode) return sessionCode;

    const rawBackup = localStorage.getItem(STORAGE_KEYS.LEGACY_REFERRAL);
    if (rawBackup) {
      try {
        const parsed = JSON.parse(rawBackup) as { code?: string; savedAt?: number };
        const ageMs = Date.now() - Number(parsed?.savedAt || 0);
        if (parsed?.code && ageMs >= 0 && ageMs < 48 * 60 * 60 * 1000) {
          const clean = String(parsed.code).trim().toUpperCase();
          sessionStorage.setItem(STORAGE_KEYS.SESSION_REFERRAL, clean);
          return clean;
        }
      } catch {
        // Legacy plain string format fallback
        const clean = rawBackup.trim().toUpperCase();
        if (/^[A-Z0-9_-]{2,20}$/.test(clean)) return clean;
      }
    }
    return null;
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

// ---------------- DYNAMIC CATEGORIES MANAGEMENT ----------------

export function getCategories(): string[] {
  const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
  const initialized = localStorage.getItem(STORAGE_KEYS.CATEGORIES_INITIALIZED) === 'true';

  if (raw !== null) {
    const parsed = safeJsonParse<string[]>(raw, []);
    if (Array.isArray(parsed)) {
      // Purge phantom legacy categories like 'Rainwear' or 'Jackets'
      const filtered = parsed
        .map(c => String(c).trim())
        .filter(c => Boolean(c) && c.toLowerCase() !== 'rainwear' && c.toLowerCase() !== 'jackets');
      return filtered;
    }
  }

  if (initialized) {
    return [];
  }

  // First-time clean starter list
  const list = [...DEFAULT_CATEGORIES];
  safeSetStorage(STORAGE_KEYS.CATEGORIES, JSON.stringify(list));
  safeSetStorage(STORAGE_KEYS.CATEGORIES_INITIALIZED, 'true');
  return list;
}

export function saveCategories(categories: string[]): string[] {
  const seenLower = new Set<string>();
  const clean: string[] = [];
  for (const cat of categories) {
    const trimmed = String(cat).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (key === 'rainwear' || key === 'jackets') continue; // Always purge deleted ghost categories
    if (!seenLower.has(key)) {
      seenLower.add(key);
      clean.push(trimmed);
    }
  }
  safeSetStorage(STORAGE_KEYS.CATEGORIES, JSON.stringify(clean));
  safeSetStorage(STORAGE_KEYS.CATEGORIES_INITIALIZED, 'true');
  notifyStoreUpdated();
  return clean;
}

export function addCategory(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return getCategories();
  const current = getCategories();
  return saveCategories([...current, trimmed]);
}

export function deleteCategory(name: string): string[] {
  const target = name.trim().toLowerCase();
  const current = getCategories();
  return saveCategories(current.filter(c => c.trim().toLowerCase() !== target));
}

export function clearAllCategories(): string[] {
  safeSetStorage(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
  safeSetStorage(STORAGE_KEYS.CATEGORIES_INITIALIZED, 'true');
  notifyStoreUpdated();
  return [];
}

// ---------------- LIVE PAYMENT & STORE SETTINGS ----------------

export function getPaymentSettings(): StorePaymentSettings {
  const saved = safeJsonParse<Partial<StorePaymentSettings> | null>(
    localStorage.getItem(STORAGE_KEYS.PAYMENT_SETTINGS),
    null
  );
  return {
    ...DEFAULT_PAYMENT_SETTINGS,
    ...(saved || {}),
    storeBaseUrl: sanitizeStoreBaseUrl(saved?.storeBaseUrl),
  };
}

export function savePaymentSettingsSync(next: StorePaymentSettings): StorePaymentSettings {
  const clean: StorePaymentSettings = {
    ...DEFAULT_PAYMENT_SETTINGS,
    ...next,
    storeBaseUrl: sanitizeStoreBaseUrl(next.storeBaseUrl),
  };
  safeSetStorage(STORAGE_KEYS.PAYMENT_SETTINGS, JSON.stringify(clean));
  notifyStoreUpdated();
  return clean;
}

