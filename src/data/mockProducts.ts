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
}

export const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Amal Heat-Reflective Overcoat',
    price: 2999,
    discountPrice: 2499,
    description: 'Special heat-reflective coat designed for bike riders, daily workers, and outdoor travellers under hot sunlight. Reflects 90% of solar radiation and keeps body cool.',
    imageUrl: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600',
    category: 'Coats',
    rating: 4.8,
    reviewsCount: 124,
    features: ['Heat Reflective Fabric', 'UV Sun Protection', 'Lightweight & Breathable', 'Water-Resistant Finish'],
    stock: 25
  },
  {
    id: '2',
    name: 'Amal Waterproof Cooling Poncho',
    price: 1499,
    discountPrice: 1299,
    description: 'Heavy duty waterproof poncho with heat ventilation channels. Ideal for monsoon and hot summer bike riding in Kerala.',
    imageUrl: 'https://images.unsplash.com/photo-1523381210434-271e8be1952b?w=600',
    category: 'Rainwear',
    rating: 4.6,
    reviewsCount: 89,
    features: ['100% Waterproof', 'Ventilated Cooling Back', 'Reflective Safety Strips', 'Compact Carrying Pouch'],
    stock: 40
  },
  {
    id: '3',
    name: 'Amal Premium USB Blower Cooling Vest',
    price: 1999,
    discountPrice: 1799,
    description: 'Built-in dual fan cooling vest powered by USB power bank. Provides active continuous airflow inside the coat in extreme summer heat.',
    imageUrl: 'https://images.unsplash.com/photo-1554568218-0f1715e72254?w=600',
    category: 'Vests',
    rating: 4.9,
    reviewsCount: 210,
    features: ['Dual Speed Air Fans', 'USB Power Bank Compatible', 'Ergonomic Fit', 'Washable Outer Fabric'],
    stock: 15
  },
  {
    id: '4',
    name: 'Amal Rider Sun Shield Jacket',
    price: 2299,
    discountPrice: 1899,
    description: 'Full sleeve lightweight sun shield jacket for long distance two-wheeler riding in high temperatures.',
    imageUrl: 'https://images.unsplash.com/photo-1548883354-7622d03aca27?w=600',
    category: 'Jackets',
    rating: 4.7,
    reviewsCount: 65,
    features: ['UPF 50+ Sun Block', 'Quick-Dry Fabric', 'Zip Pockets', 'Sweat Wicking Layer'],
    stock: 30
  }
];
