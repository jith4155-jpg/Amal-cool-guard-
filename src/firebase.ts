import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type User as FirebaseAuthUser } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadString,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { Product } from './data/mockProducts';
import { type CategoryItem, getCategoryAutoImage, slugifyCategoryId } from './utils/categoryArt';
import {
  DEFAULT_LIVE_CONFIG,
  type LiveBoxTheme,
  type LiveSaleBox,
  type LiveSaleConfig,
  type LiveSaleItem,
} from './utils/liveTypes';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export function toAppUser(fbUser: FirebaseAuthUser | null | undefined): AppUser | null {
  if (!fbUser) return null;
  return {
    uid: fbUser.uid,
    email: fbUser.email || null,
    displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : null),
    photoURL: fbUser.photoURL || null,
    emailVerified: Boolean(fbUser.emailVerified),
  };
}

export async function uploadDataUrlToStorage(
  dataUrl: string,
  objectPath: string
): Promise<string | null> {
  try {
    if (!dataUrl.startsWith('data:')) {
      return dataUrl;
    }
    const cleanPath = objectPath.replace(/^\/+/, '');
    const fileRef = storageRef(storage, cleanPath);
    await uploadString(fileRef, dataUrl, 'data_url');
    return await getDownloadURL(fileRef);
  } catch (err) {
    console.warn('Firebase Storage upload skipped (using compressed fallback):', err);
    return null;
  }
}

export async function uploadMediaFileToStorage(
  file: File,
  objectPath: string
): Promise<string | null> {
  try {
    const cleanPath = objectPath.replace(/^\/+/, '');
    const fileRef = storageRef(storage, cleanPath);
    await uploadBytes(fileRef, file, {
      contentType: file.type || 'video/mp4',
    });
    return await getDownloadURL(fileRef);
  } catch (err) {
    console.warn('Firebase Storage media upload skipped:', err);
    return null;
  }
}

function normalizeTimestampValue(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
  return undefined;
}

export function mapProductFromDb(row: Record<string, any>, docId?: string): Product {
  const validPlacement =
    row.placement === 'banner' || row.placement === 'deals' || row.placement === 'spotlight'
      ? row.placement
      : 'grid';
  return {
    id: String(docId || row.id || ''),
    name: String(row.name || 'Amal Coolguard Vest'),
    price: Number(row.price) || 2499,
    discountPrice: Number(row.discountPrice ?? row.price) || 1999,
    description: String(row.description || 'Cooling coat for heat protection.'),
    imageUrl: String(row.imageUrl || ''),
    galleryImages: Array.isArray(row.galleryImages) ? row.galleryImages : undefined,
    category: String(row.category || 'Coats'),
    tag: row.tag ? String(row.tag) : undefined,
    placement: validPlacement,
    sectionLabel: row.sectionLabel ? String(row.sectionLabel).trim() : '',
    visible: row.visible !== false,
    isDemo: Boolean(row.isDemo),
    rating: Number(row.rating) || 4.8,
    reviewsCount: Number(row.reviewsCount) || 1,
    features: Array.isArray(row.features) ? row.features : undefined,
    stock: typeof row.stock === 'number' ? row.stock : undefined,
    gstPercent: Number(row.gstPercent ?? 0),
    deliveryCharge: Number(row.deliveryCharge ?? 0),
    estimatedDeliveryDays: String(row.estimatedDeliveryDays ?? ''),
  };
}

export function mapProductToDb(prod: Product) {
  const validPlacement =
    prod.placement === 'banner' || prod.placement === 'deals' || prod.placement === 'spotlight'
      ? prod.placement
      : 'grid';
  return {
    name: String(prod.name || '').slice(0, 200),
    price: Math.max(0, Number(prod.price || 0)),
    discountPrice: Math.max(0, Number(prod.discountPrice || prod.price || 0)),
    description: String(prod.description || '').slice(0, 2000),
    imageUrl: String(prod.imageUrl || '').slice(0, 950000),
    galleryImages: (prod.galleryImages || (prod.imageUrl ? [prod.imageUrl] : []))
      .map(s => String(s || '').slice(0, 950000))
      .filter(Boolean)
      .slice(0, 15),
    category: String(prod.category || 'Coats').slice(0, 100),
    tag: String(prod.tag || '').trim().slice(0, 60),
    placement: validPlacement,
    sectionLabel: String(prod.sectionLabel || '').trim().slice(0, 80),
    visible: prod.visible !== false,
    isDemo: Boolean(prod.isDemo),
    rating: Number(prod.rating || 4.8),
    reviewsCount: Number(prod.reviewsCount || 1),
    features: (prod.features || []).map(f => String(f || '').slice(0, 200)).slice(0, 20),
    stock: Number(prod.stock ?? 25),
    gstPercent: Math.max(0, Number(prod.gstPercent || 0)),
    deliveryCharge: Math.max(0, Number(prod.deliveryCharge || 0)),
    estimatedDeliveryDays: String(prod.estimatedDeliveryDays || '').trim().slice(0, 100),
    updatedAt: new Date().toISOString(),
  };
}

export function mapCategoryFromDb(row: Record<string, any>, docId?: string): CategoryItem {
  const name = String(row.name || 'Category').trim();
  return {
    id: String(docId || row.id || slugifyCategoryId(name)),
    name,
    imageUrl: String(row.imageUrl || '').trim() || getCategoryAutoImage(name),
    visible: row.visible !== false,
    sortOrder: Number(row.sortOrder ?? 99),
    isDemo: Boolean(row.isDemo),
    subTags: Array.isArray(row.subTags)
      ? row.subTags.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 15)
      : undefined,
    updatedAt: normalizeTimestampValue(row.updatedAt),
  };
}

export function mapCategoryToDb(cat: CategoryItem) {
  const cleanName = String(cat.name || 'Category').trim().slice(0, 100);
  const cleanId = String(cat.id || slugifyCategoryId(cleanName)).slice(0, 128);
  return {
    id: cleanId,
    name: cleanName,
    imageUrl: String(cat.imageUrl || getCategoryAutoImage(cleanName)).slice(0, 950000),
    visible: cat.visible !== false,
    sortOrder: Number(cat.sortOrder ?? 99),
    isDemo: Boolean(cat.isDemo),
    subTags: (cat.subTags || []).map(s => String(s || '').trim().slice(0, 60)).filter(Boolean).slice(0, 15),
    updatedAt: new Date().toISOString(),
  };
}

export function mapUserProfileFromDb(row: Record<string, any>, docId?: string) {
  return {
    uid: String(row.uid || docId || ''),
    email: String(row.email || ''),
    name: String(row.name || 'Customer'),
    photoURL: String(row.photoURL || ''),
    mobile: String(row.mobile || ''),
    address: String(row.address || ''),
    pincode: String(row.pincode || ''),
    createdAt: normalizeTimestampValue(row.createdAt),
    updatedAt: normalizeTimestampValue(row.updatedAt),
  };
}

export function mapUserProfileToDb(profile: {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  mobile?: string;
  address?: string;
  pincode?: string;
  createdAt?: string;
  updatedAt?: string;
}) {
  return {
    uid: String(profile.uid).slice(0, 128),
    email: String(profile.email || '').slice(0, 200),
    name: (String(profile.name || 'Customer').trim() || 'Customer').slice(0, 120),
    photoURL: String(profile.photoURL || '').slice(0, 1000),
    mobile: String(profile.mobile || '').slice(0, 30),
    address: String(profile.address || '').slice(0, 500),
    pincode: String(profile.pincode || '').slice(0, 20),
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: profile.updatedAt || new Date().toISOString(),
  };
}

export function mapBookingFromDb(row: Record<string, any>, docId?: string) {
  const resolvedDocId = String(docId || row.docId || row.id || row.orderId || '');
  return {
    id: resolvedDocId,
    docId: resolvedDocId,
    orderId: String(row.orderId ?? resolvedDocId),
    userId: String(row.userId ?? ''),
    userEmail: String(row.userEmail ?? ''),
    userName: String(row.userName ?? ''),
    userPhoto: String(row.userPhoto ?? ''),
    customerName: String(row.customerName ?? 'Customer'),
    phoneNumber: String(row.phoneNumber ?? ''),
    address: String(row.address ?? ''),
    pincode: String(row.pincode ?? ''),
    productId: String(row.productId ?? ''),
    productName: String(row.productName ?? 'Amal Coolguard Vest'),
    productImage: String(row.productImage ?? ''),
    productPrice: Number(row.productPrice ?? 0),
    gstPercent: Number(row.gstPercent ?? 0),
    gstAmount: Number(row.gstAmount ?? 0),
    gstNumber: String(row.gstNumber ?? ''),
    deliveryCharge: Number(row.deliveryCharge ?? 0),
    estimatedDeliveryDays: String(row.estimatedDeliveryDays ?? ''),
    price: Number(row.price ?? 0),
    paymentMethod: String(row.paymentMethod ?? 'UPI'),
    paymentScreenshot: row.paymentScreenshot ?? null,
    screenshot: row.paymentScreenshot ?? row.screenshot ?? null,
    referralCode: row.referralCode ?? null,
    promoterId: row.promoterId ?? null,
    promoterUserId: String(row.promoterUserId ?? ''),
    promoterEmail: String(row.promoterEmail ?? ''),
    promoterCommission: Number(row.promoterCommission ?? 0),
    trackingId: String(row.trackingId ?? ''),
    trackingUrl: String(row.trackingUrl ?? ''),
    courierName: String(row.courierName ?? ''),
    deliveryStatus: (row.deliveryStatus ?? 'pending') as 'pending' | 'shipped' | 'delivered',
    dispatchedAt: String(row.dispatchedAt ?? ''),
    deliveredAt: String(row.deliveredAt ?? ''),
    status: String(row.status ?? 'pending_verification'),
    createdAt: normalizeTimestampValue(row.createdAt) || new Date().toISOString(),
  };
}

export function mapPromoterFromDb(row: Record<string, any>, docId?: string) {
  return {
    id: String(row.id || docId || ''),
    userId: String(row.userId ?? ''),
    email: String(row.email || ''),
    name: String(row.name || ''),
    phone: String(row.phone || ''),
    channelName: String(row.channelName ?? 'YouTuber / Influencer'),
    paymentType: (row.paymentType === 'bank' ? 'bank' : 'upi') as 'upi' | 'bank',
    upiId: String(row.upiId ?? ''),
    bankName: String(row.bankName ?? ''),
    accountNumber: String(row.accountNumber ?? ''),
    ifscCode: String(row.ifscCode ?? ''),
    accountHolderName: String(row.accountHolderName ?? ''),
    commissionPerSale: Number(row.commissionPerSale ?? 100),
    paidAmount: Number(row.paidAmount ?? 0),
    createdAt: normalizeTimestampValue(row.createdAt) || new Date().toISOString(),
  };
}

export function mapPromoterToDb(p: Record<string, any>) {
  return {
    id: String(p.id).slice(0, 64),
    userId: String(p.userId || '').slice(0, 128),
    email: String(p.email || '').slice(0, 200),
    name: String(p.name || '').slice(0, 120),
    phone: String(p.phone || '').slice(0, 30),
    channelName: String(p.channelName || 'YouTuber / Influencer').slice(0, 120),
    paymentType: p.paymentType === 'bank' ? 'bank' : 'upi',
    upiId: String(p.upiId || '').slice(0, 120),
    bankName: String(p.bankName || '').slice(0, 120),
    accountNumber: String(p.accountNumber || '').slice(0, 64),
    ifscCode: String(p.ifscCode || '').slice(0, 32),
    accountHolderName: String(p.accountHolderName || '').slice(0, 120),
    commissionPerSale: Number(p.commissionPerSale ?? 100),
    paidAmount: Number(p.paidAmount ?? 0),
    createdAt: String(p.createdAt || new Date().toISOString()).slice(0, 100),
  };
}

export function mapPromoterSaleFromDb(row: Record<string, any>, docId?: string) {
  const orderId = String(row.orderId ?? docId ?? row.id ?? '');
  return {
    id: orderId,
    orderId,
    bookingDocId: String(row.bookingDocId ?? ''),
    buyerUserId: String(row.buyerUserId ?? ''),
    promoterId: String(row.promoterId ?? ''),
    promoterUserId: String(row.promoterUserId ?? ''),
    promoterEmail: String(row.promoterEmail ?? ''),
    productId: String(row.productId ?? ''),
    productName: String(row.productName ?? 'Amal Coolguard Vest'),
    price: Number(row.price ?? 0),
    commission: Number(row.commission ?? 100),
    deliveryStatus: (row.deliveryStatus ?? 'pending') as 'pending' | 'shipped' | 'delivered',
    courierName: String(row.courierName ?? ''),
    trackingId: String(row.trackingId ?? ''),
    dispatchedAt: String(row.dispatchedAt ?? ''),
    deliveredAt: String(row.deliveredAt ?? ''),
    status: String(row.status ?? 'pending_verification'),
    createdAt: normalizeTimestampValue(row.createdAt) || new Date().toISOString(),
  };
}

export function mapLiveConfigFromDb(row: Record<string, any>): LiveSaleConfig {
  const validTheme = (t: any): LiveBoxTheme =>
    t === 'amber' || t === 'blue' || t === 'emerald' ? t : 'crimson';
  const rawBoxes = Array.isArray(row.liveBoxes) ? row.liveBoxes : DEFAULT_LIVE_CONFIG.liveBoxes;
  const boxes: LiveSaleBox[] = rawBoxes
    .filter((b: any) => b && (b.title || b.offerBadge))
    .slice(0, 20)
    .map((b: any, i: number) => ({
      id: String(b.id || `box_${i + 1}`).slice(0, 64),
      sectionName: String(b.sectionName || '').trim().slice(0, 80),
      title: String(b.title || 'Live Deal').slice(0, 100),
      subtitle: String(b.subtitle || '').slice(0, 140),
      offerBadge: String(b.offerBadge || 'LIVE OFFER').slice(0, 40),
      offerPercent: Number(b.offerPercent || 0),
      offerAmount: Number(b.offerAmount || 0),
      ctaText: String(b.ctaText || 'Shop Live').slice(0, 40),
      theme: validTheme(b.theme),
    }));

  return {
    active: Boolean(row.active),
    headerLabel: String(row.headerLabel || 'LIVE').trim() || 'LIVE',
    subtitle: String(row.subtitle ?? DEFAULT_LIVE_CONFIG.subtitle),
    durationHours: Math.max(0, Number(row.durationHours ?? 2)),
    durationMinutes: Math.max(0, Number(row.durationMinutes ?? 0)),
    durationText: String(row.durationText ?? ''),
    startedAt: normalizeTimestampValue(row.startedAt) || '',
    endsAt: normalizeTimestampValue(row.endsAt) || '',
    defaultDiscountPercent: Math.max(0, Number(row.defaultDiscountPercent ?? 20)),
    defaultOfferAmount: Math.max(0, Number(row.defaultOfferAmount ?? 0)),
    liveBoxes: boxes,
    updatedAt: normalizeTimestampValue(row.updatedAt),
  };
}

export function mapLiveConfigToDb(cfg: LiveSaleConfig, deletedLiveIds: string[] = []) {
  return {
    active: Boolean(cfg.active),
    headerLabel: (String(cfg.headerLabel || 'LIVE').trim() || 'LIVE').slice(0, 80),
    subtitle: String(cfg.subtitle || '').slice(0, 200),
    durationHours: Math.max(0, Number(cfg.durationHours || 0)),
    durationMinutes: Math.max(0, Number(cfg.durationMinutes || 0)),
    durationText: String(cfg.durationText || '').slice(0, 100),
    startedAt: String(cfg.startedAt || '').slice(0, 100),
    endsAt: String(cfg.endsAt || '').slice(0, 100),
    defaultDiscountPercent: Math.max(0, Number(cfg.defaultDiscountPercent || 0)),
    defaultOfferAmount: Math.max(0, Number(cfg.defaultOfferAmount || 0)),
    liveBoxes: (cfg.liveBoxes || []).slice(0, 20).map((b, i) => ({
      id: String(b.id || `box_${i + 1}`).slice(0, 64),
      sectionName: String(b.sectionName || '').trim().slice(0, 80),
      title: String(b.title || 'Live Deal').slice(0, 100),
      subtitle: String(b.subtitle || '').slice(0, 140),
      offerBadge: String(b.offerBadge || 'LIVE OFFER').slice(0, 40),
      offerPercent: Math.max(0, Number(b.offerPercent || 0)),
      offerAmount: Math.max(0, Number(b.offerAmount || 0)),
      ctaText: String(b.ctaText || 'Shop Live').slice(0, 40),
      theme: b.theme || 'crimson',
    })),
    deletedLiveIds: deletedLiveIds.map(String).filter(Boolean).slice(0, 200),
    updatedAt: new Date().toISOString(),
  };
}

export function mapLiveItemFromDb(row: Record<string, any>, docId?: string): LiveSaleItem {
  const category = String(row.category || 'Coats').trim();
  const images = Array.isArray(row.images)
    ? row.images.map((s: any) => String(s || '').trim()).filter(Boolean)
    : [];
  const videos = Array.isArray(row.videos)
    ? row.videos.map((s: any) => String(s || '').trim()).filter(Boolean)
    : [];
  return {
    id: String(docId || row.id || ''),
    boxId: row.boxId ? String(row.boxId).trim() : '',
    sectionName: row.sectionName ? String(row.sectionName).trim() : '',
    title: String(row.title || 'Live Deal Item'),
    modelName: String(row.modelName || ''),
    category,
    originalPrice: Math.max(0, Number(row.originalPrice || 0)),
    offerPrice: Math.max(0, Number(row.offerPrice ?? row.originalPrice ?? 0)),
    discountPercent: Math.max(0, Number(row.discountPercent || 0)),
    offerAmount: Math.max(0, Number(row.offerAmount || 0)),
    tag: String(row.tag || ''),
    description: String(row.description || ''),
    images: images.length > 0 ? images : [getCategoryAutoImage(category)],
    videos,
    linkedProductId: row.linkedProductId ? String(row.linkedProductId) : '',
    visible: row.visible !== false,
    sortOrder: Number(row.sortOrder ?? 99),
    createdAt: normalizeTimestampValue(row.createdAt),
    updatedAt: normalizeTimestampValue(row.updatedAt),
  };
}

export function mapLiveItemToDb(item: LiveSaleItem) {
  const cleanId = String(item.id || `live_${Date.now()}`).slice(0, 128);
  const category = String(item.category || 'Coats').trim().slice(0, 100);
  const cleanImages = (item.images || [])
    .map(s => String(s || '').trim().slice(0, 950000))
    .filter(Boolean)
    .slice(0, 15);
  const cleanVideos = (item.videos || [])
    .map(s => String(s || '').trim().slice(0, 950000))
    .filter(Boolean)
    .slice(0, 10);

  return {
    id: cleanId,
    boxId: String(item.boxId || '').trim().slice(0, 64),
    sectionName: String(item.sectionName || '').trim().slice(0, 80),
    title: (String(item.title || 'Live Deal').trim() || 'Live Deal').slice(0, 200),
    modelName: String(item.modelName || '').trim().slice(0, 120),
    category,
    originalPrice: Math.max(0, Number(item.originalPrice || 0)),
    offerPrice: Math.max(0, Number(item.offerPrice || 0)),
    discountPercent: Math.max(0, Number(item.discountPercent || 0)),
    offerAmount: Math.max(0, Number(item.offerAmount || 0)),
    tag: String(item.tag || '').trim().slice(0, 80),
    description: String(item.description || '').trim().slice(0, 2000),
    images: cleanImages,
    videos: cleanVideos,
    linkedProductId: String(item.linkedProductId || '').trim().slice(0, 128),
    visible: item.visible !== false,
    sortOrder: Number(item.sortOrder ?? 99),
    createdAt: String(item.createdAt || new Date().toISOString()).slice(0, 100),
    updatedAt: new Date().toISOString(),
  };
}
