import { MOCK_PRODUCTS, Product, ProductReview } from '../data/mockProducts';
import {
  type CategoryItem,
  getCategoryAutoImage,
  slugifyCategoryId,
  STARTER_CATEGORIES,
  STARTER_DEMO_PRODUCTS,
} from './categoryArt';

import {
  DEFAULT_LIVE_CONFIG,
  type LiveSaleConfig,
  type LiveSaleItem,
} from './liveTypes';

export * from './liveTypes';
export type { ProductReview };

export const STORAGE_KEYS = {
  CATALOG: 'amal_products_catalog',
  CACHED_PRODUCTS: 'amal_cached_products',
  CUSTOM_PRODUCTS: 'amal_custom_products',
  DELETED_PRODUCT_IDS: 'amal_deleted_product_ids',
  CATALOG_DIRTY: 'amal_catalog_dirty',
  CATALOG_INITIALIZED: 'amal_catalog_initialized',
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
  CATEGORY_ITEMS: 'amal_category_items',
  DELETED_CATEGORY_IDS: 'amal_deleted_category_ids',
  CATEGORIES_INITIALIZED: 'amal_categories_initialized',
  LIVE_CONFIG: 'amal_live_config',
  LIVE_ITEMS: 'amal_live_items',
  DELETED_LIVE_ITEM_IDS: 'amal_deleted_live_item_ids',
  CUSTOMER_REVIEWS: 'amal_customer_reviews',
  DELETED_REVIEW_IDS: 'amal_deleted_review_ids',
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
  enableLocationBar?: boolean;
  enableLoginButton?: boolean;
  enableWhatsAppWidget?: boolean;
  enableHeroBanner?: boolean;
  enableValueDeals?: boolean;
  enableSpotlight?: boolean;
  enableSuggestedGrid?: boolean;
  enablePaymentGateway?: boolean;
  paymentGatewayName?: string;
  paymentGatewayMode?: 'test' | 'live';
  paymentGatewayCode?: string;
  sectionTitleBanner?: string;
  sectionTitleDeals?: string;
  sectionTitleSpotlight?: string;
  sectionTitleGrid?: string;
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
  enableLocationBar: true,
  enableLoginButton: true,
  enableWhatsAppWidget: true,
  enableHeroBanner: true,
  enableValueDeals: true,
  enableSpotlight: true,
  enableSuggestedGrid: true,
  enablePaymentGateway: false,
  paymentGatewayName: 'Razorpay / Custom Gateway',
  paymentGatewayMode: 'test',
  paymentGatewayCode: '',
  sectionTitleBanner: 'Top Promo Showcase',
  sectionTitleDeals: 'Amal Value Deals',
  sectionTitleSpotlight: 'In the Spotlight',
  sectionTitleGrid: 'Suggested For You',
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

function supportsCanvasWebP(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 2;
    testCanvas.height = 2;
    return testCanvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp');
  } catch {
    return false;
  }
}

export function getImageExtensionFromDataUrl(dataUrl: string): 'webp' | 'jpg' {
  return dataUrl.startsWith('data:image/webp') ? 'webp' : 'jpg';
}

/**
 * Compresses any uploaded image (large high-res or small thumbnail) on the client side using Canvas
 * so the resulting JPEG/WebP Data URL is as close to targetKB (~10 KB by default) as possible
 * without failing upload or distorting aspect ratio.
 */
export async function compressImageToTargetKB(
  file: File,
  targetKB = 10
): Promise<{ dataUrl: string; sizeKB: number; mimeType: 'image/webp' | 'image/jpeg' }> {
  const safeTarget = Math.max(4, targetKB);
  const toleranceLow = Math.max(4, safeTarget * 0.8);
  const toleranceHigh = safeTarget + 1.5;

  return new Promise((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      // Fallback if URL.createObjectURL is unavailable in rare environment
    }

    const img = new Image();
    const cleanup = () => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    };

    const processLoadedImage = (sourceUrl: string) => {
      try {
        const naturalW = img.naturalWidth || img.width || 480;
        const naturalH = img.naturalHeight || img.height || 480;
        const webpOk = supportsCanvasWebP();

        const renderCandidate = (
          targetDim: number,
          quality: number,
          mime: 'image/webp' | 'image/jpeg',
          allowUpscale = false
        ) => {
          let w = naturalW;
          let h = naturalH;
          const maxSide = Math.max(w, h);
          if (maxSide > targetDim || (allowUpscale && maxSide < targetDim)) {
            const scale = targetDim / maxSide;
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return {
              url: sourceUrl,
              kb: estimateDataUrlKB(sourceUrl),
              mime,
              dim: maxSide,
            };
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          // Only fill white background for JPEG where alpha is unsupported. Keep WebP transparent!
          if (mime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL(mime, quality);
          return {
            url,
            kb: estimateDataUrlKB(url),
            mime: (url.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg') as
              | 'image/webp'
              | 'image/jpeg',
            dim: Math.max(w, h),
          };
        };

        const searchMimeForTarget = (
          dim: number,
          mime: 'image/webp' | 'image/jpeg',
          allowUpscale: boolean
        ) => {
          let lo = 0.12;
          let hi = 0.94;
          let bestUnder = renderCandidate(dim, lo, mime, allowUpscale);
          let bestOverall = bestUnder;

          for (let iter = 0; iter < 7; iter++) {
            const mid = (lo + hi) / 2;
            const cand = renderCandidate(dim, mid, mime, allowUpscale);
            if (Math.abs(cand.kb - safeTarget) < Math.abs(bestOverall.kb - safeTarget)) {
              bestOverall = cand;
            }
            if (cand.kb <= toleranceHigh) {
              if (cand.kb >= bestUnder.kb || bestUnder.kb > toleranceHigh) {
                bestUnder = cand;
              }
              lo = mid;
            } else {
              hi = mid;
            }
          }

          // Pick closest candidate near targetKB, preferring <= toleranceHigh
          return bestUnder.kb <= toleranceHigh &&
            Math.abs(bestUnder.kb - safeTarget) <= Math.abs(bestOverall.kb - safeTarget) + 0.8
            ? bestUnder
            : bestOverall;
        };

        // Small source image handling: normalize cleanly so tiny photos stay crisp near ~10 KB
        const initialCandidate = renderCandidate(
          360,
          0.88,
          webpOk ? 'image/webp' : 'image/jpeg',
          false
        );
        if (initialCandidate.kb <= toleranceHigh) {
          const smallDims = [360, 440, 520, 280];
          let bestSmall = initialCandidate;
          for (const dim of smallDims) {
            const cand = searchMimeForTarget(dim, webpOk ? 'image/webp' : 'image/jpeg', true);
            if (
              cand.kb <= toleranceHigh + 1 &&
              Math.abs(cand.kb - safeTarget) < Math.abs(bestSmall.kb - safeTarget)
            ) {
              bestSmall = cand;
            }
            if (bestSmall.kb >= toleranceLow && bestSmall.kb <= toleranceHigh) break;
          }
          cleanup();
          resolve({ dataUrl: bestSmall.url, sizeKB: bestSmall.kb, mimeType: bestSmall.mime });
          return;
        }

        // Large / normal high-resolution image handling: evaluate WebP & JPEG across balanced sizes
        const dimLadder = [520, 440, 360, 300, 240, 180, 140];
        const codecs: ('image/webp' | 'image/jpeg')[] = webpOk
          ? ['image/webp', 'image/jpeg']
          : ['image/jpeg'];

        let chosen = renderCandidate(280, 0.5, codecs[0], false);

        for (const dim of dimLadder) {
          for (const codec of codecs) {
            const cand = searchMimeForTarget(dim, codec, false);
            const candDist = Math.abs(cand.kb - safeTarget);
            const chosenDist = Math.abs(chosen.kb - safeTarget);

            // Prefer crisp resolution inside [toleranceLow, toleranceHigh]
            const candInBand = cand.kb >= toleranceLow && cand.kb <= toleranceHigh;
            const chosenInBand = chosen.kb >= toleranceLow && chosen.kb <= toleranceHigh;

            if (candInBand && !chosenInBand) {
              chosen = cand;
            } else if (candInBand && chosenInBand) {
              if (cand.dim > chosen.dim || (cand.dim === chosen.dim && candDist < chosenDist)) {
                chosen = cand;
              }
            } else if (!chosenInBand && candDist < chosenDist) {
              chosen = cand;
            }
          }
          if (chosen.kb >= toleranceLow && chosen.kb <= toleranceHigh) {
            break;
          }
        }

        // Absolute fallback: ensure we never exceed reasonable size if image is extremely noisy
        if (chosen.kb > Math.max(18, safeTarget * 1.8)) {
          const ultraCompact = renderCandidate(140, 0.2, webpOk ? 'image/webp' : 'image/jpeg', false);
          if (ultraCompact.kb < chosen.kb) {
            chosen = ultraCompact;
          }
        }

        cleanup();
        resolve({ dataUrl: chosen.url, sizeKB: chosen.kb, mimeType: chosen.mime });
      } catch {
        cleanup();
        resolve({
          dataUrl: sourceUrl,
          sizeKB: estimateDataUrlKB(sourceUrl),
          mimeType: 'image/jpeg',
        });
      }
    };

    img.onload = () => processLoadedImage(objectUrl);
    img.onerror = () => {
      // Fallback to FileReader if ObjectURL failed
      cleanup();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Invalid or unsupported image file'));
      reader.onload = () => {
        const fallbackUrl = reader.result as string;
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          processLoadedImage(fallbackUrl);
        };
        fallbackImg.onerror = () => reject(new Error('Invalid or unsupported image file'));
        fallbackImg.src = fallbackUrl;
      };
      reader.readAsDataURL(file);
    };

    if (objectUrl) {
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.onload = () => {
        const dataUrl = reader.result as string;
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  });
}

/**
 * Resizes and compresses an uploaded image into a requested KB band.
 * For product/category uploads targeting ~10 KB (maxKB <= 15), delegates directly to compressImageToTargetKB.
 */
export async function compressProductImageToRange(
  file: File,
  minKB = 8,
  maxKB = 12
): Promise<{ dataUrl: string; sizeKB: number }> {
  if (maxKB <= 15) {
    const target = Math.round(((minKB + maxKB) / 2) * 10) / 10;
    const res = await compressImageToTargetKB(file, target || 10);
    return { dataUrl: res.dataUrl, sizeKB: res.sizeKB };
  }

  return new Promise((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      // ignore
    }

    const img = new Image();
    const cleanup = () => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    };

    const processLoadedImage = () => {
      try {
        const naturalW = img.naturalWidth || img.width || 720;
        const naturalH = img.naturalHeight || img.height || 720;
        const webpOk = supportsCanvasWebP();
        const isPngOrWebp = file.type === 'image/png' || file.type === 'image/webp' || file.name.toLowerCase().endsWith('.png');
        const outputMime: 'image/webp' | 'image/jpeg' = webpOk ? 'image/webp' : 'image/jpeg';

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
          if (!ctx) return { url: '', kb: 0 };

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          if (outputMime === 'image/jpeg' && !isPngOrWebp) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL(outputMime, quality);
          return { url, kb: estimateDataUrlKB(url) };
        };

        const dimSteps = [720, 600, 500, 420, 340, 260];
        const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.42, 0.32];

        let best = renderCandidate(720, 0.82);
        if (best.kb < minKB) {
          const hi = renderCandidate(900, 0.92);
          if (hi.kb <= maxKB) best = hi;
          cleanup();
          resolve({ dataUrl: best.url, sizeKB: best.kb });
          return;
        }

        outer: for (const dim of dimSteps) {
          for (const q of qualitySteps) {
            const cand = renderCandidate(dim, q);
            best = cand;
            if (cand.kb <= maxKB) {
              break outer;
            }
          }
        }

        cleanup();
        resolve({ dataUrl: best.url, sizeKB: best.kb });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    img.onload = () => processLoadedImage();
    img.onerror = () => {
      cleanup();
      // Fallback with FileReader if ObjectURL failed
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Invalid or unsupported image file'));
      reader.onload = () => {
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          img.src = reader.result as string;
          processLoadedImage();
        };
        fallbackImg.onerror = () => reject(new Error('Invalid image data'));
        fallbackImg.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    };

    if (objectUrl) {
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  });
}

/**
 * Compresses an uploaded image File into a compact WebP/JPEG Data URL (~40-80KB)
 * so multiple product gallery images & screenshots fit comfortably in localStorage & Firestore (<1MB).
 */
export async function compressImageFile(
  file: File,
  maxDimension = 900,
  quality = 0.76
): Promise<string> {
  return new Promise((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      // ignore
    }

    const cleanup = () => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    };

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
          cleanup();
          resolve(objectUrl);
          return;
        }

        const webpOk = supportsCanvasWebP();
        const isPngOrWebp = file.type === 'image/png' || file.type === 'image/webp' || file.name.toLowerCase().endsWith('.png');
        const outputMime: 'image/webp' | 'image/jpeg' = webpOk ? 'image/webp' : 'image/jpeg';

        if (outputMime === 'image/jpeg' && !isPngOrWebp) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const compressed = canvas.toDataURL(outputMime, quality);
        cleanup();
        resolve(compressed);
      } catch {
        cleanup();
        resolve('');
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('Invalid or unsupported image file'));
    };

    if (objectUrl) {
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
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

  // Respect explicit empty catalog once initialized
  if (localStorage.getItem(STORAGE_KEYS.CATALOG_INITIALIZED) === 'true') {
    return [];
  }

  // 2. First-time clean starter showcase catalog (all marked isDemo so Admin can hide or delete anytime)
  const starter = (STARTER_DEMO_PRODUCTS.length > 0 ? STARTER_DEMO_PRODUCTS : MOCK_PRODUCTS).filter(
    p => !deletedSet.has(p.id)
  );
  safeSetStorage(STORAGE_KEYS.CATALOG_INITIALIZED, 'true');
  saveCatalogProducts(starter, false);
  return starter;
}

export function clearAllCatalogProducts(): Product[] {
  const current = getCatalogProducts();
  const allIds = current.map(p => p.id);
  const starterIds = STARTER_DEMO_PRODUCTS.map(p => p.id);
  const nextDeleted = Array.from(
    new Set([...getDeletedProductIds(), ...allIds, ...starterIds, '1', '2', '3', '4'])
  );
  safeSetStorage(STORAGE_KEYS.DELETED_PRODUCT_IDS, JSON.stringify(nextDeleted));
  safeSetStorage(STORAGE_KEYS.CATALOG_INITIALIZED, 'true');
  safeSetStorage(STORAGE_KEYS.CATALOG, JSON.stringify([]));
  safeSetStorage(STORAGE_KEYS.CACHED_PRODUCTS, JSON.stringify([]));
  safeSetStorage(STORAGE_KEYS.CUSTOM_PRODUCTS, JSON.stringify([]));
  safeSetStorage(STORAGE_KEYS.CATALOG_DIRTY, 'true');
  notifyStoreUpdated();
  return [];
}

export function clearDemoProducts(): Product[] {
  const current = getCatalogProducts();
  const demoIds = current.filter(p => p.isDemo || String(p.id).startsWith('demo_')).map(p => p.id);
  const nextDeleted = Array.from(
    new Set([...getDeletedProductIds(), ...demoIds, ...STARTER_DEMO_PRODUCTS.map(p => p.id)])
  );
  safeSetStorage(STORAGE_KEYS.DELETED_PRODUCT_IDS, JSON.stringify(nextDeleted));
  const next = current.filter(p => !p.isDemo && !String(p.id).startsWith('demo_'));
  saveCatalogProducts(next, true);
  return next;
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
  const starterIds = new Set(STARTER_DEMO_PRODUCTS.map(p => p.id));
  const remainingDeleted = getDeletedProductIds().filter(id => !starterIds.has(id));
  safeSetStorage(STORAGE_KEYS.DELETED_PRODUCT_IDS, JSON.stringify(remainingDeleted));
  const current = getCatalogProducts();
  const existingIds = new Set(current.map(p => p.id));
  const missingDefaults = STARTER_DEMO_PRODUCTS.filter(m => !existingIds.has(m.id));
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

// ---------------- DYNAMIC CATEGORIES MANAGEMENT (RICH ITEMS + VISIBILITY + AUTO-IMAGES) ----------------

export function getDeletedCategoryIds(): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(STORAGE_KEYS.DELETED_CATEGORY_IDS), []);
}

export function syncDeletedCategoryIds(ids: string[]): string[] {
  if (!Array.isArray(ids)) return getDeletedCategoryIds();
  const next = Array.from(new Set([...getDeletedCategoryIds(), ...ids.map(String)]));
  safeSetStorage(STORAGE_KEYS.DELETED_CATEGORY_IDS, JSON.stringify(next));

  const rawItems = localStorage.getItem(STORAGE_KEYS.CATEGORY_ITEMS);
  if (rawItems !== null) {
    const parsed = safeJsonParse<CategoryItem[]>(rawItems, []);
    if (Array.isArray(parsed)) {
      const deletedSet = new Set(next);
      const cleaned = parsed.filter(c => c && !deletedSet.has(c.id));
      safeSetStorage(STORAGE_KEYS.CATEGORY_ITEMS, JSON.stringify(cleaned));
      safeSetStorage(
        STORAGE_KEYS.CATEGORIES,
        JSON.stringify(cleaned.filter(c => c.visible !== false).map(c => c.name))
      );
    }
  }
  notifyStoreUpdated();
  return next;
}

export function getCategoryItems(): CategoryItem[] {
  const deletedSet = new Set(getDeletedCategoryIds());
  const rawItems = localStorage.getItem(STORAGE_KEYS.CATEGORY_ITEMS);
  const initialized = localStorage.getItem(STORAGE_KEYS.CATEGORIES_INITIALIZED) === 'true';

  if (rawItems !== null) {
    const parsed = safeJsonParse<CategoryItem[]>(rawItems, []);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          c =>
            c &&
            c.name &&
            !deletedSet.has(c.id) &&
            c.name.trim().toLowerCase() !== 'rainwear' &&
            c.name.trim().toLowerCase() !== 'jackets'
        )
        .map((c, idx) => ({
          ...c,
          id: c.id || slugifyCategoryId(c.name),
          name: String(c.name).trim(),
          imageUrl: String(c.imageUrl || '').trim() || getCategoryAutoImage(c.name),
          visible: c.visible !== false,
          sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : idx + 1,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }

  // Migrate legacy string-only categories if present
  const rawLegacy = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
  if (rawLegacy !== null) {
    const legacyNames = safeJsonParse<string[]>(rawLegacy, []);
    if (Array.isArray(legacyNames) && legacyNames.length > 0) {
      const migrated: CategoryItem[] = legacyNames
        .map(c => String(c).trim())
        .filter(c => Boolean(c) && c.toLowerCase() !== 'rainwear' && c.toLowerCase() !== 'jackets')
        .map((name, idx) => ({
          id: slugifyCategoryId(name),
          name,
          imageUrl: getCategoryAutoImage(name),
          visible: true,
          sortOrder: idx + 1,
        }))
        .filter(c => !deletedSet.has(c.id));
      saveCategoryItems(migrated, false);
      return migrated;
    }
  }

  if (initialized) {
    return [];
  }

  // First-time clean rich starter categories (distinct SVG art, toggleable & deletable)
  const starter = STARTER_CATEGORIES.filter(c => !deletedSet.has(c.id));
  saveCategoryItems(starter, false);
  return starter;
}

export function saveCategoryItems(items: CategoryItem[], notify = true): CategoryItem[] {
  const deletedSet = new Set(getDeletedCategoryIds());
  const seenLower = new Set<string>();
  const clean: CategoryItem[] = [];

  items.forEach((item, idx) => {
    const trimmed = String(item?.name || '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (key === 'rainwear' || key === 'jackets') return;
    const id = String(item.id || slugifyCategoryId(trimmed));
    if (deletedSet.has(id) || seenLower.has(key)) return;
    seenLower.add(key);
    clean.push({
      ...item,
      id,
      name: trimmed,
      imageUrl: String(item.imageUrl || '').trim() || getCategoryAutoImage(trimmed),
      visible: item.visible !== false,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx + 1,
    });
  });

  clean.sort((a, b) => a.sortOrder - b.sortOrder);
  safeSetStorage(STORAGE_KEYS.CATEGORY_ITEMS, JSON.stringify(clean));
  safeSetStorage(
    STORAGE_KEYS.CATEGORIES,
    JSON.stringify(clean.filter(c => c.visible !== false).map(c => c.name))
  );
  safeSetStorage(STORAGE_KEYS.CATEGORIES_INITIALIZED, 'true');
  if (notify) {
    notifyStoreUpdated();
  }
  return clean;
}

export function mergeRemoteCategoryItems(remoteItems: CategoryItem[]): CategoryItem[] {
  const deletedSet = new Set(getDeletedCategoryIds());
  const cleanRemote = remoteItems.filter(c => c && c.name && !deletedSet.has(c.id));
  if (cleanRemote.length > 0) {
    return saveCategoryItems(cleanRemote, false);
  }
  return getCategoryItems();
}

export function addOrUpdateCategoryItem(
  input: Partial<CategoryItem> & { name: string }
): { items: CategoryItem[]; saved: CategoryItem } {
  const trimmedName = input.name.trim().slice(0, 100);
  const current = getCategoryItems();
  const existing = current.find(
    c => (input.id && c.id === input.id) || c.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );

  const id = existing?.id || input.id || slugifyCategoryId(trimmedName);
  // Ensure ID is removed from deleted list if re-added
  const nextDeleted = getDeletedCategoryIds().filter(did => did !== id);
  safeSetStorage(STORAGE_KEYS.DELETED_CATEGORY_IDS, JSON.stringify(nextDeleted));

  const saved: CategoryItem = {
    id,
    name: trimmedName,
    imageUrl: String(input.imageUrl || existing?.imageUrl || '').trim() || getCategoryAutoImage(trimmedName),
    visible: input.visible !== undefined ? input.visible : existing?.visible ?? true,
    sortOrder:
      typeof input.sortOrder === 'number'
        ? input.sortOrder
        : existing?.sortOrder ?? current.length + 1,
    isDemo: input.isDemo !== undefined ? input.isDemo : existing?.isDemo ?? false,
    subTags: input.subTags !== undefined ? input.subTags : existing?.subTags,
  };

  const nextList = existing
    ? current.map(c => (c.id === existing.id ? saved : c))
    : [...current, saved];

  return { items: saveCategoryItems(nextList), saved };
}

export function toggleCategoryVisibility(idOrName: string): {
  items: CategoryItem[];
  toggled: CategoryItem | null;
} {
  const target = idOrName.trim().toLowerCase();
  const current = getCategoryItems();
  let toggled: CategoryItem | null = null;
  const next = current.map(c => {
    if (c.id.toLowerCase() === target || c.name.trim().toLowerCase() === target) {
      toggled = { ...c, visible: c.visible === false };
      return toggled;
    }
    return c;
  });
  return { items: saveCategoryItems(next), toggled };
}

export function deleteCategoryItem(idOrName: string): {
  items: CategoryItem[];
  deletedId: string | null;
} {
  const target = idOrName.trim().toLowerCase();
  const current = getCategoryItems();
  const found = current.find(
    c => c.id.toLowerCase() === target || c.name.trim().toLowerCase() === target
  );
  const deletedId = found?.id || null;
  if (deletedId) {
    const nextDeleted = Array.from(new Set([...getDeletedCategoryIds(), deletedId]));
    safeSetStorage(STORAGE_KEYS.DELETED_CATEGORY_IDS, JSON.stringify(nextDeleted));
  }
  const next = current.filter(
    c => c.id.toLowerCase() !== target && c.name.trim().toLowerCase() !== target
  );
  return { items: saveCategoryItems(next), deletedId };
}

export function clearDemoCategories(): CategoryItem[] {
  const current = getCategoryItems();
  const demoIds = current.filter(c => c.isDemo).map(c => c.id);
  const starterIds = STARTER_CATEGORIES.map(c => c.id);
  const nextDeleted = Array.from(new Set([...getDeletedCategoryIds(), ...demoIds, ...starterIds]));
  safeSetStorage(STORAGE_KEYS.DELETED_CATEGORY_IDS, JSON.stringify(nextDeleted));
  return saveCategoryItems(current.filter(c => !c.isDemo));
}

export function restoreStarterCategories(): CategoryItem[] {
  const starterIds = new Set(STARTER_CATEGORIES.map(c => c.id));
  const remainingDeleted = getDeletedCategoryIds().filter(id => !starterIds.has(id));
  safeSetStorage(STORAGE_KEYS.DELETED_CATEGORY_IDS, JSON.stringify(remainingDeleted));
  const current = getCategoryItems();
  const existingNames = new Set(current.map(c => c.name.toLowerCase()));
  const missing = STARTER_CATEGORIES.filter(s => !existingNames.has(s.name.toLowerCase()));
  return saveCategoryItems([...current, ...missing]);
}

export function getCategories(): string[] {
  return getCategoryItems()
    .filter(c => c.visible !== false)
    .map(c => c.name);
}

export function saveCategories(categories: string[]): string[] {
  const current = getCategoryItems();
  const currentByName = new Map(current.map(c => [c.name.trim().toLowerCase(), c]));
  const nextItems: CategoryItem[] = [];
  const seenLower = new Set<string>();

  categories.forEach((rawName, idx) => {
    const trimmed = String(rawName).trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (key === 'rainwear' || key === 'jackets' || seenLower.has(key)) return;
    seenLower.add(key);
    const existing = currentByName.get(key);
    nextItems.push(
      existing || {
        id: slugifyCategoryId(trimmed),
        name: trimmed,
        imageUrl: getCategoryAutoImage(trimmed),
        visible: true,
        sortOrder: idx + 1,
      }
    );
  });

  // Preserve hidden categories so saving visible names doesn't erase hidden entries
  current.forEach(c => {
    const key = c.name.trim().toLowerCase();
    if (c.visible === false && !seenLower.has(key)) {
      seenLower.add(key);
      nextItems.push(c);
    }
  });

  saveCategoryItems(nextItems);
  return nextItems.filter(c => c.visible !== false).map(c => c.name);
}

export function addCategory(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return getCategories();
  const { items } = addOrUpdateCategoryItem({ name: trimmed, visible: true });
  return items.filter(c => c.visible !== false).map(c => c.name);
}

export function deleteCategory(name: string): string[] {
  const { items } = deleteCategoryItem(name);
  return items.filter(c => c.visible !== false).map(c => c.name);
}

export function clearAllCategories(): string[] {
  const currentIds = getCategoryItems().map(c => c.id);
  const starterIds = STARTER_CATEGORIES.map(c => c.id);
  const nextDeleted = Array.from(new Set([...getDeletedCategoryIds(), ...currentIds, ...starterIds]));
  safeSetStorage(STORAGE_KEYS.DELETED_CATEGORY_IDS, JSON.stringify(nextDeleted));
  safeSetStorage(STORAGE_KEYS.CATEGORY_ITEMS, JSON.stringify([]));
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

// ---------------- LIVE SALE & OFFERS SYNC ----------------

export function getLiveConfig(): LiveSaleConfig {
  const saved = safeJsonParse<Partial<LiveSaleConfig> | null>(
    localStorage.getItem(STORAGE_KEYS.LIVE_CONFIG),
    null
  );
  if (!saved) return { ...DEFAULT_LIVE_CONFIG };
  return {
    ...DEFAULT_LIVE_CONFIG,
    ...saved,
    headerLabel: (String(saved.headerLabel || DEFAULT_LIVE_CONFIG.headerLabel).trim() || 'LIVE'),
    liveBoxes: Array.isArray(saved.liveBoxes) ? saved.liveBoxes : DEFAULT_LIVE_CONFIG.liveBoxes,
  };
}

export function saveLiveConfig(next: LiveSaleConfig, notify = true): LiveSaleConfig {
  const clean: LiveSaleConfig = {
    ...DEFAULT_LIVE_CONFIG,
    ...next,
    headerLabel: (String(next.headerLabel || 'LIVE').trim() || 'LIVE').slice(0, 80),
    liveBoxes: Array.isArray(next.liveBoxes) ? next.liveBoxes.slice(0, 20) : [],
    updatedAt: new Date().toISOString(),
  };
  safeSetStorage(STORAGE_KEYS.LIVE_CONFIG, JSON.stringify(clean));
  if (notify) {
    notifyStoreUpdated();
  }
  return clean;
}

export function getDeletedLiveItemIds(): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(STORAGE_KEYS.DELETED_LIVE_ITEM_IDS), []);
}

export function syncDeletedLiveItemIds(ids: string[]): string[] {
  if (!Array.isArray(ids)) return getDeletedLiveItemIds();
  const next = Array.from(new Set([...getDeletedLiveItemIds(), ...ids.map(String)]));
  safeSetStorage(STORAGE_KEYS.DELETED_LIVE_ITEM_IDS, JSON.stringify(next));

  const raw = localStorage.getItem(STORAGE_KEYS.LIVE_ITEMS);
  if (raw !== null) {
    const parsed = safeJsonParse<LiveSaleItem[]>(raw, []);
    if (Array.isArray(parsed)) {
      const deletedSet = new Set(next);
      const cleaned = parsed.filter(item => item && !deletedSet.has(item.id));
      safeSetStorage(STORAGE_KEYS.LIVE_ITEMS, JSON.stringify(cleaned));
    }
  }
  notifyStoreUpdated();
  return next;
}

export function getLiveItems(): LiveSaleItem[] {
  const deletedSet = new Set(getDeletedLiveItemIds());
  const raw = safeJsonParse<LiveSaleItem[]>(localStorage.getItem(STORAGE_KEYS.LIVE_ITEMS), []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(item => item && item.id && !deletedSet.has(item.id))
    .map((item, idx) => ({
      ...item,
      images: Array.isArray(item.images) && item.images.length > 0
        ? item.images.filter(Boolean)
        : [getCategoryAutoImage(item.category || 'Coats')],
      videos: Array.isArray(item.videos) ? item.videos.filter(Boolean) : [],
      visible: item.visible !== false,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx + 1,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function saveLiveItems(items: LiveSaleItem[], notify = true): LiveSaleItem[] {
  const deletedSet = new Set(getDeletedLiveItemIds());
  const clean = items
    .filter(item => item && item.id && !deletedSet.has(item.id))
    .map((item, idx) => ({
      ...item,
      images: Array.isArray(item.images) && item.images.length > 0
        ? item.images.filter(Boolean).slice(0, 15)
        : [getCategoryAutoImage(item.category || 'Coats')],
      videos: Array.isArray(item.videos) ? item.videos.filter(Boolean).slice(0, 10) : [],
      visible: item.visible !== false,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx + 1,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  safeSetStorage(STORAGE_KEYS.LIVE_ITEMS, JSON.stringify(clean));
  if (notify) {
    notifyStoreUpdated();
  }
  return clean;
}

export function addOrUpdateLiveItem(item: LiveSaleItem): LiveSaleItem[] {
  const nextDeleted = getDeletedLiveItemIds().filter(id => id !== item.id);
  safeSetStorage(STORAGE_KEYS.DELETED_LIVE_ITEM_IDS, JSON.stringify(nextDeleted));

  const current = getLiveItems();
  const exists = current.some(i => i.id === item.id);
  const next = exists
    ? current.map(i => (i.id === item.id ? item : i))
    : [item, ...current];
  return saveLiveItems(next);
}

export function deleteLiveItemLocally(itemId: string): LiveSaleItem[] {
  const nextDeleted = Array.from(new Set([...getDeletedLiveItemIds(), itemId]));
  safeSetStorage(STORAGE_KEYS.DELETED_LIVE_ITEM_IDS, JSON.stringify(nextDeleted));
  const next = getLiveItems().filter(i => i.id !== itemId);
  return saveLiveItems(next);
}

export function mergeRemoteLiveItems(remoteItems: LiveSaleItem[]): LiveSaleItem[] {
  const deletedSet = new Set(getDeletedLiveItemIds());
  const cleanRemote = remoteItems.filter(i => i && i.id && !deletedSet.has(i.id));
  return saveLiveItems(cleanRemote, false);
}

export function liveItemToProduct(item: LiveSaleItem): Product & { liveVideos?: string[]; isLiveDeal?: boolean } {
  const mainImg = item.images?.[0] || getCategoryAutoImage(item.category || 'Coats');
  const gallery = item.images && item.images.length > 0 ? item.images : [mainImg];
  return {
    id: `live_${item.id}`,
    name: item.modelName ? `${item.title} (${item.modelName})` : item.title,
    price: item.originalPrice || item.offerPrice,
    discountPrice: item.offerPrice || item.originalPrice,
    description:
      item.description ||
      `Live Sale Special Offer on ${item.title}${item.discountPercent > 0 ? ` — Save ${item.discountPercent}%!` : ''}`,
    imageUrl: mainImg,
    galleryImages: gallery,
    category: item.category || 'Live Deals',
    tag:
      item.tag ||
      (item.discountPercent > 0
        ? `LIVE ${item.discountPercent}% OFF`
        : item.offerAmount > 0
        ? `Save ₹${item.offerAmount}`
        : 'LIVE OFFER'),
    visible: item.visible !== false,
    rating: 4.9,
    reviewsCount: 28,
    stock: 25,
    features: [
      'Live Offer Exclusive Pricing',
      'Heat & UV Reflective Protection',
      'Fast Dispatch from Kerala',
      'Quality Checked by Amal Coolguard',
    ],
    liveVideos: item.videos || [],
    isLiveDeal: true,
  };
}

export const DEFAULT_STARTER_REVIEWS: ProductReview[] = [
  {
    id: 'starter_rev_1',
    productId: 'demo_1',
    productName: 'Amal Coolguard Vest',
    userName: 'Rahul K.',
    location: 'Wayanad',
    rating: 5,
    comment: 'Very good for summer bike riding in Wayanad sun! Keeps heat away nicely.',
    status: 'approved',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'starter_rev_2',
    productId: 'demo_1',
    productName: 'Amal Coolguard Vest',
    userName: 'Anil Kumar',
    location: 'Kozhikode',
    rating: 5,
    comment: 'Super quality coat. Delivery was quick and payment on delivery worked smooth.',
    status: 'approved',
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: 'starter_rev_3',
    productId: 'demo_2',
    productName: 'Heat-Deflecting Solar Ride Coat',
    userName: 'Faisal M.',
    location: 'Ernakulam',
    rating: 5,
    comment: 'Lightweight and keeps you cool during traffic hours. Excellent stitching quality.',
    status: 'approved',
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
];

export function getDeletedReviewIds(): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(STORAGE_KEYS.DELETED_REVIEW_IDS), []);
}

export function getAllCustomerReviews(): ProductReview[] {
  const deletedSet = new Set(getDeletedReviewIds());
  const stored = safeJsonParse<ProductReview[]>(localStorage.getItem(STORAGE_KEYS.CUSTOMER_REVIEWS), []);
  const all = [...stored];
  for (const starter of DEFAULT_STARTER_REVIEWS) {
    if (!all.some(r => r.id === starter.id)) {
      all.push(starter);
    }
  }
  return all
    .filter(r => !deletedSet.has(r.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getProductReviews(productId?: string): ProductReview[] {
  const all = getAllCustomerReviews();
  if (!productId) return all;
  return all.filter(r => r.productId === productId);
}

export function saveProductReview(review: ProductReview): ProductReview[] {
  const deleted = getDeletedReviewIds().filter(id => id !== review.id);
  safeSetStorage(STORAGE_KEYS.DELETED_REVIEW_IDS, JSON.stringify(deleted));
  const current = getAllCustomerReviews();
  const next = [review, ...current.filter(r => r.id !== review.id)];
  safeSetStorage(STORAGE_KEYS.CUSTOMER_REVIEWS, JSON.stringify(next));
  notifyStoreUpdated();
  return next;
}

export function deleteProductReview(reviewId: string): ProductReview[] {
  const deleted = Array.from(new Set([...getDeletedReviewIds(), reviewId]));
  safeSetStorage(STORAGE_KEYS.DELETED_REVIEW_IDS, JSON.stringify(deleted));
  const current = getAllCustomerReviews();
  const next = current.filter(r => r.id !== reviewId);
  safeSetStorage(STORAGE_KEYS.CUSTOMER_REVIEWS, JSON.stringify(next));
  notifyStoreUpdated();
  return next;
}

export function syncRemoteReviews(remoteList: ProductReview[]): ProductReview[] {
  const deletedSet = new Set(getDeletedReviewIds());
  const validRemote = remoteList.filter(r => r && r.id && !deletedSet.has(r.id));
  if (validRemote.length === 0) return getAllCustomerReviews();
  const current = getAllCustomerReviews();
  const map = new Map<string, ProductReview>();
  for (const r of current) map.set(r.id, r);
  for (const r of validRemote) map.set(r.id, r);
  const next = Array.from(map.values())
    .filter(r => !deletedSet.has(r.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  safeSetStorage(STORAGE_KEYS.CUSTOMER_REVIEWS, JSON.stringify(next));
  return next;
}

export function saveQuickProductRating(
  productId: string,
  rating: number
): { products: Product[]; updated: Product | null } {
  const current = getCatalogProducts();
  let updatedProd: Product | null = null;
  const safeRating = Math.max(1, Math.min(5, Math.round(rating * 10) / 10));
  const next = current.map(p => {
    if (p.id === productId) {
      updatedProd = { ...p, rating: safeRating };
      return updatedProd;
    }
    return p;
  });
  if (updatedProd) {
    updateCatalogProduct(updatedProd);
  }
  return { products: next, updated: updatedProd };
}


