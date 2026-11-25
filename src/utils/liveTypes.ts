export type LiveBoxTheme = 'crimson' | 'amber' | 'blue' | 'emerald';

export interface LiveSaleBox {
  id: string;
  sectionName?: string;
  title: string;
  subtitle: string;
  offerBadge: string;
  offerPercent?: number;
  offerAmount?: number;
  ctaText?: string;
  theme?: LiveBoxTheme;
}

export interface LiveSaleConfig {
  active: boolean;
  headerLabel: string;
  subtitle: string;
  durationHours: number;
  durationMinutes: number;
  durationText: string;
  startedAt: string;
  endsAt: string;
  defaultDiscountPercent: number;
  defaultOfferAmount: number;
  liveBoxes: LiveSaleBox[];
  updatedAt?: string;
}

export interface LiveSaleItem {
  id: string;
  boxId?: string;
  sectionName?: string;
  title: string;
  modelName: string;
  category: string;
  originalPrice: number;
  offerPrice: number;
  discountPercent: number;
  offerAmount: number;
  tag?: string;
  description?: string;
  images: string[];
  videos: string[];
  linkedProductId?: string;
  visible: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_LIVE_CONFIG: LiveSaleConfig = {
  active: false,
  headerLabel: 'LIVE',
  subtitle: 'Special Live Cooling Gear Deals • Extra Percentage & Instant Offers',
  durationHours: 2,
  durationMinutes: 0,
  durationText: '2 Hours Live Special',
  startedAt: '',
  endsAt: '',
  defaultDiscountPercent: 20,
  defaultOfferAmount: 0,
  liveBoxes: [
    {
      id: 'box_live_10',
      title: 'Flash 10% Extra Off',
      subtitle: 'Cooling Vests & Bike Gear',
      offerBadge: '10% OFF',
      offerPercent: 10,
      offerAmount: 0,
      ctaText: 'Shop Live',
      theme: 'crimson',
    },
    {
      id: 'box_live_20',
      title: 'Mega 20% Live Deal',
      subtitle: 'Sun Coats & Helmet Coolers',
      offerBadge: '20% OFF',
      offerPercent: 20,
      offerAmount: 0,
      ctaText: 'Grab Deal',
      theme: 'amber',
    },
  ],
};

export function calculateLiveItemPricing(input: {
  originalPrice?: number;
  offerPrice?: number;
  discountPercent?: number;
  offerAmount?: number;
}): {
  originalPrice: number;
  offerPrice: number;
  discountPercent: number;
  offerAmount: number;
  savings: number;
} {
  const orig = Math.max(0, Math.round(Number(input.originalPrice || 0)));
  const rawOfferPrice = Number(input.offerPrice || 0);
  const rawPct = Math.max(0, Math.min(95, Number(input.discountPercent || 0)));
  const rawAmt = Math.max(0, Number(input.offerAmount || 0));

  let computedOffer = rawOfferPrice > 0 ? Math.round(rawOfferPrice) : orig;
  if (rawOfferPrice <= 0 && orig > 0) {
    if (rawPct > 0) {
      computedOffer = Math.max(1, Math.round(orig * (1 - rawPct / 100)));
    } else if (rawAmt > 0) {
      computedOffer = Math.max(1, orig - Math.round(rawAmt));
    }
  }
  if (orig > 0 && computedOffer > orig) {
    computedOffer = orig;
  }

  const savings = Math.max(0, orig - computedOffer);
  const derivedPct =
    rawPct > 0
      ? Math.round(rawPct)
      : orig > 0 && savings > 0
      ? Math.round((savings / orig) * 100)
      : 0;

  return {
    originalPrice: orig,
    offerPrice: computedOffer,
    discountPercent: derivedPct,
    offerAmount: rawAmt > 0 ? Math.round(rawAmt) : savings,
    savings,
  };
}

export function computeLiveEndsAt(hours: number, minutes: number, fromMs = Date.now()): string {
  const totalMinutes = Math.max(0, Math.round(Number(hours || 0) * 60 + Number(minutes || 0)));
  if (totalMinutes <= 0) return '';
  return new Date(fromMs + totalMinutes * 60 * 1000).toISOString();
}

export function formatRemainingLiveTime(
  config: Pick<LiveSaleConfig, 'endsAt' | 'durationHours' | 'durationMinutes' | 'durationText'>,
  nowMs = Date.now()
): {
  expired: boolean;
  countdownText: string;
  durationSummary: string;
  remainingSeconds: number;
} {
  const h = Math.max(0, Math.floor(Number(config.durationHours || 0)));
  const m = Math.max(0, Math.floor(Number(config.durationMinutes || 0)));
  const fallbackSummary =
    (config.durationText || '').trim() ||
    (h > 0 || m > 0 ? `${h}h ${m}m Live Offer` : 'Limited Live Offer');

  if (!config.endsAt) {
    return {
      expired: false,
      countdownText:
        h > 0 || m > 0
          ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
          : fallbackSummary,
      durationSummary: fallbackSummary,
      remainingSeconds: h * 3600 + m * 60,
    };
  }

  const endMs = new Date(config.endsAt).getTime();
  if (Number.isNaN(endMs)) {
    return {
      expired: false,
      countdownText: fallbackSummary,
      durationSummary: fallbackSummary,
      remainingSeconds: 0,
    };
  }

  const diffSec = Math.max(0, Math.floor((endMs - nowMs) / 1000));
  if (diffSec <= 0) {
    return {
      expired: true,
      countdownText: '00:00:00',
      durationSummary: fallbackSummary,
      remainingSeconds: 0,
    };
  }

  const remH = Math.floor(diffSec / 3600);
  const remM = Math.floor((diffSec % 3600) / 60);
  const remS = diffSec % 60;
  return {
    expired: false,
    countdownText: `${String(remH).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(
      remS
    ).padStart(2, '0')}`,
    durationSummary: fallbackSummary,
    remainingSeconds: diffSec,
  };
}

export function getYoutubeEmbedUrl(rawUrl: string): string | null {
  try {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) return null;
    if (trimmed.includes('youtube.com/watch')) {
      const url = new URL(trimmed);
      const vid = url.searchParams.get('v');
      return vid ? `https://www.youtube.com/embed/${vid}` : null;
    }
    if (trimmed.includes('youtu.be/')) {
      const part = trimmed.split('youtu.be/')[1]?.split(/[?#]/)[0];
      return part ? `https://www.youtube.com/embed/${part}` : null;
    }
    if (trimmed.includes('youtube.com/shorts/')) {
      const part = trimmed.split('youtube.com/shorts/')[1]?.split(/[?#]/)[0];
      return part ? `https://www.youtube.com/embed/${part}` : null;
    }
    if (trimmed.includes('youtube.com/embed/')) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}
