import { createClient, type User as SupabaseAuthUser } from '@supabase/supabase-js';
import supabaseConfig from '../supabase-config.json';
import { Product } from './data/mockProducts';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || supabaseConfig.url;
const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  supabaseConfig.publishableKey;

export const SUPABASE_BUCKET =
  (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) ||
  supabaseConfig.storageBucket ||
  'Amalcoolguard';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export function toAppUser(sbUser: SupabaseAuthUser | null | undefined): AppUser | null {
  if (!sbUser) return null;
  const meta = (sbUser.user_metadata || {}) as Record<string, any>;
  return {
    uid: sbUser.id,
    email: sbUser.email || meta.email || null,
    displayName: meta.full_name || meta.name || (sbUser.email ? sbUser.email.split('@')[0] : null),
    photoURL: meta.avatar_url || meta.picture || null,
    emailVerified: Boolean(sbUser.email_confirmed_at || sbUser.confirmed_at || sbUser.email),
  };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binaryStr = atob(parts[1] || '');
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function uploadDataUrlToStorage(
  dataUrl: string,
  objectPath: string
): Promise<string | null> {
  try {
    if (!dataUrl.startsWith('data:')) {
      return dataUrl;
    }
    const blob = dataUrlToBlob(dataUrl);
    const cleanPath = objectPath.replace(/^\/+/, '');
    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(cleanPath, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: true,
        cacheControl: '31536000',
      });
    if (uploadError) {
      console.warn('Supabase storage upload skipped (using fallback):', uploadError.message);
      return null;
    }
    const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(cleanPath);
    return data?.publicUrl || null;
  } catch (err) {
    console.warn('Supabase storage helper warning:', err);
    return null;
  }
}

export function mapProductFromDb(row: Record<string, any>): Product {
  return {
    id: String(row.id),
    name: row.name || 'Amal Coolguard Vest',
    price: Number(row.price) || 2499,
    discountPrice: Number(row.discount_price ?? row.discountPrice ?? row.price) || 1999,
    description: row.description || 'Cooling coat for heat protection.',
    imageUrl: row.image_url ?? row.imageUrl ?? '',
    galleryImages: Array.isArray(row.gallery_images ?? row.galleryImages)
      ? (row.gallery_images ?? row.galleryImages)
      : undefined,
    category: row.category || 'Coats',
    rating: Number(row.rating) || 4.8,
    reviewsCount: Number(row.reviews_count ?? row.reviewsCount) || 1,
    features: Array.isArray(row.features) ? row.features : undefined,
    stock: typeof row.stock === 'number' ? row.stock : undefined,
    gstPercent: Number(row.gst_percent ?? row.gstPercent ?? 0),
    deliveryCharge: Number(row.delivery_charge ?? row.deliveryCharge ?? 0),
    estimatedDeliveryDays: String(row.estimated_delivery_days ?? row.estimatedDeliveryDays ?? ''),
  };
}

export function mapProductToDb(prod: Product) {
  return {
    id: String(prod.id),
    name: String(prod.name || '').slice(0, 200),
    price: Number(prod.price || 0),
    discount_price: Number(prod.discountPrice || prod.price || 0),
    description: String(prod.description || '').slice(0, 2000),
    image_url: String(prod.imageUrl || ''),
    gallery_images: (prod.galleryImages || (prod.imageUrl ? [prod.imageUrl] : [])).slice(0, 15),
    category: String(prod.category || 'Coats').slice(0, 100),
    rating: Number(prod.rating || 4.8),
    reviews_count: Number(prod.reviewsCount || 1),
    features: (prod.features || []).slice(0, 20),
    stock: Number(prod.stock ?? 25),
    gst_percent: Math.max(0, Number(prod.gstPercent || 0)),
    delivery_charge: Math.max(0, Number(prod.deliveryCharge || 0)),
    estimated_delivery_days: String(prod.estimatedDeliveryDays || '').trim().slice(0, 100),
    updated_at: new Date().toISOString(),
  };
}

export function mapUserProfileFromDb(row: Record<string, any>) {
  return {
    uid: String(row.uid),
    email: String(row.email || ''),
    name: String(row.name || 'Customer'),
    photoURL: String(row.photo_url ?? row.photoURL ?? ''),
    mobile: String(row.mobile || ''),
    address: String(row.address || ''),
    pincode: String(row.pincode || ''),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
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
    uid: profile.uid,
    email: profile.email,
    name: profile.name,
    photo_url: profile.photoURL || '',
    mobile: profile.mobile || '',
    address: profile.address || '',
    pincode: profile.pincode || '',
    created_at: profile.createdAt || new Date().toISOString(),
    updated_at: profile.updatedAt || new Date().toISOString(),
  };
}

export function mapBookingFromDb(row: Record<string, any>) {
  const rowId = String(row.id || row.docId || row.order_id || row.orderId || '');
  return {
    id: rowId,
    docId: rowId,
    orderId: String(row.order_id ?? row.orderId ?? rowId),
    userId: String(row.user_id ?? row.userId ?? ''),
    userEmail: String(row.user_email ?? row.userEmail ?? ''),
    userName: String(row.user_name ?? row.userName ?? ''),
    userPhoto: String(row.user_photo ?? row.userPhoto ?? ''),
    customerName: String(row.customer_name ?? row.customerName ?? 'Customer'),
    phoneNumber: String(row.phone_number ?? row.phoneNumber ?? ''),
    address: String(row.address ?? ''),
    pincode: String(row.pincode ?? ''),
    productId: String(row.product_id ?? row.productId ?? ''),
    productName: String(row.product_name ?? row.productName ?? 'Amal Coolguard Vest'),
    productImage: String(row.product_image ?? row.productImage ?? ''),
    productPrice: Number(row.product_price ?? row.productPrice ?? 0),
    gstPercent: Number(row.gst_percent ?? row.gstPercent ?? 0),
    gstAmount: Number(row.gst_amount ?? row.gstAmount ?? 0),
    gstNumber: String(row.gst_number ?? row.gstNumber ?? ''),
    deliveryCharge: Number(row.delivery_charge ?? row.deliveryCharge ?? 0),
    estimatedDeliveryDays: String(row.estimated_delivery_days ?? row.estimatedDeliveryDays ?? ''),
    price: Number(row.price ?? 0),
    paymentMethod: String(row.payment_method ?? row.paymentMethod ?? 'UPI'),
    paymentScreenshot: row.payment_screenshot ?? row.paymentScreenshot ?? null,
    screenshot: row.payment_screenshot ?? row.paymentScreenshot ?? row.screenshot ?? null,
    referralCode: row.referral_code ?? row.referralCode ?? null,
    promoterId: row.promoter_id ?? row.promoterId ?? null,
    promoterUserId: String(row.promoter_user_id ?? row.promoterUserId ?? ''),
    promoterEmail: String(row.promoter_email ?? row.promoterEmail ?? ''),
    promoterCommission: Number(row.promoter_commission ?? row.promoterCommission ?? 0),
    trackingId: String(row.tracking_id ?? row.trackingId ?? ''),
    trackingUrl: String(row.tracking_url ?? row.trackingUrl ?? ''),
    courierName: String(row.courier_name ?? row.courierName ?? ''),
    deliveryStatus: (row.delivery_status ?? row.deliveryStatus ?? 'pending') as
      | 'pending'
      | 'shipped'
      | 'delivered',
    dispatchedAt: String(row.dispatched_at ?? row.dispatchedAt ?? ''),
    deliveredAt: String(row.delivered_at ?? row.deliveredAt ?? ''),
    status: String(row.status ?? 'pending_verification'),
    createdAt: row.created_at ?? row.createdAt,
  };
}

export function mapPromoterFromDb(row: Record<string, any>) {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId ?? ''),
    email: String(row.email || ''),
    name: String(row.name || ''),
    phone: String(row.phone || ''),
    channelName: String(row.channel_name ?? row.channelName ?? 'YouTuber / Influencer'),
    paymentType: ((row.payment_type ?? row.paymentType) === 'bank' ? 'bank' : 'upi') as 'upi' | 'bank',
    upiId: String(row.upi_id ?? row.upiId ?? ''),
    bankName: String(row.bank_name ?? row.bankName ?? ''),
    accountNumber: String(row.account_number ?? row.accountNumber ?? ''),
    ifscCode: String(row.ifsc_code ?? row.ifscCode ?? ''),
    accountHolderName: String(row.account_holder_name ?? row.accountHolderName ?? ''),
    commissionPerSale: Number(row.commission_per_sale ?? row.commissionPerSale ?? 100),
    paidAmount: Number(row.paid_amount ?? row.paidAmount ?? 0),
    createdAt: row.created_at ?? row.createdAt,
  };
}

export function mapPromoterToDb(p: Record<string, any>) {
  return {
    id: String(p.id),
    user_id: String(p.userId || ''),
    email: String(p.email || ''),
    name: String(p.name || ''),
    phone: String(p.phone || ''),
    channel_name: String(p.channelName || 'YouTuber / Influencer'),
    payment_type: p.paymentType === 'bank' ? 'bank' : 'upi',
    upi_id: String(p.upiId || ''),
    bank_name: String(p.bankName || ''),
    account_number: String(p.accountNumber || ''),
    ifsc_code: String(p.ifscCode || ''),
    account_holder_name: String(p.accountHolderName || ''),
    commission_per_sale: Number(p.commissionPerSale ?? 100),
    paid_amount: Number(p.paidAmount ?? 0),
    created_at: p.createdAt || new Date().toISOString(),
  };
}

export function mapPromoterSaleFromDb(row: Record<string, any>) {
  const orderId = String(row.order_id ?? row.orderId ?? row.id ?? '');
  return {
    id: orderId,
    orderId,
    bookingDocId: String(row.booking_doc_id ?? row.bookingDocId ?? ''),
    buyerUserId: String(row.buyer_user_id ?? row.buyerUserId ?? ''),
    promoterId: String(row.promoter_id ?? row.promoterId ?? ''),
    promoterUserId: String(row.promoter_user_id ?? row.promoterUserId ?? ''),
    promoterEmail: String(row.promoter_email ?? row.promoterEmail ?? ''),
    productId: String(row.product_id ?? row.productId ?? ''),
    productName: String(row.product_name ?? row.productName ?? 'Amal Coolguard Vest'),
    price: Number(row.price ?? 0),
    commission: Number(row.commission ?? 100),
    deliveryStatus: (row.delivery_status ?? row.deliveryStatus ?? 'pending') as
      | 'pending'
      | 'shipped'
      | 'delivered',
    courierName: String(row.courier_name ?? row.courierName ?? ''),
    trackingId: String(row.tracking_id ?? row.trackingId ?? ''),
    dispatchedAt: String(row.dispatched_at ?? row.dispatchedAt ?? ''),
    deliveredAt: String(row.delivered_at ?? row.deliveredAt ?? ''),
    status: String(row.status ?? 'pending_verification'),
    createdAt: row.created_at ?? row.createdAt,
  };
}
