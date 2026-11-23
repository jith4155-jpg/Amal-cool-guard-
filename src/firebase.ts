import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type User as FirebaseAuthUser } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { Product } from './data/mockProducts';

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

function normalizeTimestampValue(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
  return undefined;
}

export function mapProductFromDb(row: Record<string, any>, docId?: string): Product {
  return {
    id: String(docId || row.id || ''),
    name: String(row.name || 'Amal Coolguard Vest'),
    price: Number(row.price) || 2499,
    discountPrice: Number(row.discountPrice ?? row.price) || 1999,
    description: String(row.description || 'Cooling coat for heat protection.'),
    imageUrl: String(row.imageUrl || ''),
    galleryImages: Array.isArray(row.galleryImages) ? row.galleryImages : undefined,
    category: String(row.category || 'Coats'),
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
