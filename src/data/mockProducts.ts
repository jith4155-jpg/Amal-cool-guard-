export type ProductPlacement = 'grid' | 'banner' | 'deals' | 'spotlight';

export interface Product {
  id: string;
  name: string;
  price: number;
  discountPrice: number;
  description: string;
  imageUrl: string;
  category: string;
  tag?: string;
  placement?: ProductPlacement;
  sectionLabel?: string;
  visible?: boolean;
  isDemo?: boolean;
  rating?: number;
  reviewsCount?: number;
  features?: string[];
  stock?: number;
  galleryImages?: string[];
  gstPercent?: number;
  deliveryCharge?: number;
  estimatedDeliveryDays?: string;
}

export interface ProductReview {
  id: string;
  productId: string;
  productName?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  location?: string;
  rating: number; // 1 to 5
  comment: string;
  status?: string;
  createdAt: string;
  updatedAt?: string;
}

export const MOCK_PRODUCTS: Product[] = [];
