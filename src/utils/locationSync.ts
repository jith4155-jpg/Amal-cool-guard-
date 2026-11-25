export interface SavedDeliveryLocation {
  displayName: string;
  fullAddress: string;
  pincode: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  source: 'gps' | 'map' | 'search' | 'manual';
  updatedAt: string;
}

export const USER_LOCATION_KEY = 'amal_user_location';
export const USER_LOCATION_DETAILS_KEY = 'amal_user_location_details';
export const DEFAULT_LOCATION_LABEL = 'Kerala, India';

export function isPlaceholderLocation(value?: string | null): boolean {
  const clean = (value || '').trim().toLowerCase();
  return !clean || clean === 'kerala, india' || clean === 'india';
}

export function extractIndianPincode(
  text?: string | null,
  addressComponents?: Array<{
    types?: string[];
    longText?: string | null;
    shortText?: string | null;
  }>
): string {
  if (Array.isArray(addressComponents)) {
    const postal = addressComponents.find(comp => comp.types?.includes('postal_code'));
    const code = (postal?.longText || postal?.shortText || '').trim();
    const matchFromComp = code.match(/\b([1-9][0-9]{5})\b/);
    if (matchFromComp) return matchFromComp[1];
  }

  if (text) {
    const match = text.match(/\b([1-9][0-9]{5})\b/);
    if (match) return match[1];
  }
  return '';
}

export function getComponentText(
  addressComponents:
    | Array<{ types?: string[]; longText?: string | null; shortText?: string | null }>
    | undefined,
  preferredTypes: string[]
): string {
  if (!Array.isArray(addressComponents)) return '';
  for (const targetType of preferredTypes) {
    const found = addressComponents.find(c => c.types?.includes(targetType));
    const txt = (found?.longText || found?.shortText || '').trim();
    if (txt) return txt;
  }
  return '';
}

export function formatShortLocationLabel(
  city?: string,
  state?: string,
  pincode?: string,
  fallbackText?: string
): string {
  const cleanCity = (city || '').trim();
  const cleanState = (state || '').trim();
  const cleanPin = (pincode || '').trim();

  if (cleanCity && cleanPin) return `${cleanCity} • ${cleanPin}`;
  if (cleanCity && cleanState) return `${cleanCity}, ${cleanState}`;
  if (cleanCity) return cleanCity;
  if (fallbackText) {
    const parts = fallbackText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const compact = `${parts[0]}, ${parts[1]}`;
      return cleanPin && !compact.includes(cleanPin) ? `${compact} • ${cleanPin}` : compact;
    }
    return fallbackText.slice(0, 48);
  }
  return DEFAULT_LOCATION_LABEL;
}

export function getSavedDeliveryLocation(): SavedDeliveryLocation | null {
  try {
    const raw = localStorage.getItem(USER_LOCATION_DETAILS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedDeliveryLocation;
      if (parsed && (parsed.fullAddress || parsed.displayName)) {
        return {
          ...parsed,
          pincode: parsed.pincode || extractIndianPincode(parsed.fullAddress || parsed.displayName),
        };
      }
    }

    const legacyLabel = localStorage.getItem(USER_LOCATION_KEY);
    if (legacyLabel && !isPlaceholderLocation(legacyLabel)) {
      const pin = extractIndianPincode(legacyLabel);
      return {
        displayName: legacyLabel,
        fullAddress: legacyLabel,
        pincode: pin,
        source: 'manual',
        updatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

export function getSavedLocationDisplayLabel(): string {
  try {
    const details = getSavedDeliveryLocation();
    if (details?.displayName && !isPlaceholderLocation(details.displayName)) {
      return details.displayName;
    }
    const raw = localStorage.getItem(USER_LOCATION_KEY);
    if (raw && raw.trim()) return raw.trim();
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_LOCATION_LABEL;
}

export function saveDeliveryLocation(location: SavedDeliveryLocation): SavedDeliveryLocation {
  const normalizedPin =
    (location.pincode || '').trim() ||
    extractIndianPincode(location.fullAddress || location.displayName);

  const normalizedDisplay =
    (location.displayName || '').trim() ||
    formatShortLocationLabel(location.city, location.state, normalizedPin, location.fullAddress);

  const normalizedFull = (location.fullAddress || '').trim() || normalizedDisplay;

  const payload: SavedDeliveryLocation = {
    ...location,
    displayName: normalizedDisplay,
    fullAddress: normalizedFull,
    pincode: normalizedPin,
    updatedAt: location.updatedAt || new Date().toISOString(),
  };

  try {
    localStorage.setItem(USER_LOCATION_KEY, payload.displayName);
    localStorage.setItem(USER_LOCATION_DETAILS_KEY, JSON.stringify(payload));
    if (payload.fullAddress && !isPlaceholderLocation(payload.fullAddress)) {
      localStorage.setItem('amal_customer_address', payload.fullAddress);
    }
    if (payload.pincode) {
      localStorage.setItem('amal_customer_pincode', payload.pincode);
    }
    window.dispatchEvent(new Event('amal_store_updated'));
  } catch {
    // Ignore storage quota errors
  }

  return payload;
}

export function isGmpQuotaError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: unknown; code?: unknown; message?: unknown };
  const statusStr = String(anyErr.status || anyErr.code || '').toUpperCase();
  const msgStr = String(anyErr.message || err || '').toUpperCase();
  return (
    statusStr === 'OVER_QUERY_LIMIT' ||
    statusStr === 'RESOURCE_EXHAUSTED' ||
    statusStr === '429' ||
    msgStr.includes('OVER_QUERY_LIMIT') ||
    msgStr.includes('RESOURCE_EXHAUSTED') ||
    msgStr.includes('QUOTA') ||
    msgStr.includes('429')
  );
}

export function triggerGmpQuotaExceeded(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

export async function reverseLookupFromNominatim(
  lat: number,
  lng: number
): Promise<{
  displayName: string;
  fullAddress: string;
  pincode: string;
  city: string;
  state: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&addressdetails=1&accept-language=en`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json();
    const addr = data?.address || {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.suburb ||
      addr.county ||
      addr.state_district ||
      '';
    const state = addr.state || '';
    const pincode = extractIndianPincode(addr.postcode || data?.display_name || '');
    const fullAddress = String(data?.display_name || '').trim();
    const displayName = formatShortLocationLabel(city, state, pincode, fullAddress);

    if (!fullAddress && !city) return null;
    return {
      displayName,
      fullAddress: fullAddress || displayName,
      pincode,
      city,
      state,
    };
  } catch {
    return null;
  }
}
