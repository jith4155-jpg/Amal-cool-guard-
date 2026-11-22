export interface Product {
  id: string;
  name: string;
  price: number;
  discountPrice: number;
  description: string;
  imageUrl: string;
  category: string;
  rating?: number;
  reviewsCount?: number;
  features?: string[];
  stock?: number;
  galleryImages?: string[];
  gstPercent?: number;
  deliveryCharge?: number;
  estimatedDeliveryDays?: string;
}

export const MOCK_PRODUCTS: Product[] = [];
