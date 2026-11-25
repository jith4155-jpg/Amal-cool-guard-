import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMapView,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  DEFAULT_LOCATION_LABEL,
  SavedDeliveryLocation,
  extractIndianPincode,
  formatShortLocationLabel,
  getComponentText,
  getSavedDeliveryLocation,
  isGmpQuotaError,
  isPlaceholderLocation,
  reverseLookupFromNominatim,
  saveDeliveryLocation,
  triggerGmpQuotaExceeded,
} from '../utils/locationSync';

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const DEFAULT_KERALA_CENTER = { lat: 11.2588, lng: 75.7804 };

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (loc: SavedDeliveryLocation) => void;
  title?: string;
}

interface LatLngPoint {
  lat: number;
  lng: number;
}

function MapCameraUpdater({ target }: { target: LatLngPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    const currentZoom = map.getZoom() ?? 11;
    if (currentZoom < 15) {
      map.setZoom(15);
    }
  }, [map, target]);

  return null;
}

interface InnerMapsContentProps {
  onClose: () => void;
  onSaved?: (loc: SavedDeliveryLocation) => void;
  title: string;
  hasMapsKey: boolean;
}

function LocationPickerBody({ onClose, onSaved, title, hasMapsKey }: InnerMapsContentProps) {
  const placesLib = useMapsLibrary('places');
  const initialSaved = getSavedDeliveryLocation();

  type PlacesLib = NonNullable<typeof placesLib>;
  type PlaceSuggestionItem = Awaited<
    ReturnType<PlacesLib['AutocompleteSuggestion']['fetchAutocompleteSuggestions']>
  >['suggestions'][number];
  type PlaceSessionToken = InstanceType<PlacesLib['AutocompleteSessionToken']>;

  const [pinPos, setPinPos] = useState<LatLngPoint>(() =>
    initialSaved?.lat != null && initialSaved?.lng != null
      ? { lat: initialSaved.lat, lng: initialSaved.lng }
      : DEFAULT_KERALA_CENTER
  );
  const [cameraTarget, setCameraTarget] = useState<LatLngPoint | null>(null);

  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestionItem[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

  const [addressInput, setAddressInput] = useState<string>(() =>
    initialSaved?.fullAddress && !isPlaceholderLocation(initialSaved.fullAddress)
      ? initialSaved.fullAddress
      : ''
  );
  const [pincodeInput, setPincodeInput] = useState<string>(() => initialSaved?.pincode || '');
  const [cityMeta, setCityMeta] = useState<string>(() => initialSaved?.city || '');
  const [stateMeta, setStateMeta] = useState<string>(() => initialSaved?.state || '');
  const [placeIdMeta, setPlaceIdMeta] = useState<string>(() => initialSaved?.placeId || '');
  const [locationSource, setLocationSource] = useState<SavedDeliveryLocation['source']>(
    () => initialSaved?.source || 'manual'
  );

  const [locatingGps, setLocatingGps] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const sessionTokenRef = useRef<PlaceSessionToken | null>(null);

  const resetSearchSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  // Debounced Places API (New) AutocompleteSuggestion lookup
  useEffect(() => {
    if (!hasMapsKey || !placesLib) return;
    const trimmed = searchText.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearchingPlaces(false);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    setSearchingPlaces(true);

    const timer = setTimeout(async () => {
      try {
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current || undefined,
          includedRegionCodes: ['in'],
        });
        if (!cancelled) {
          setSuggestions(res?.suggestions || []);
        }
      } catch (err) {
        if (isGmpQuotaError(err)) {
          triggerGmpQuotaExceeded();
        }
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setSearchingPlaces(false);
        }
      }
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasMapsKey, placesLib, searchText]);

  const resolveAddressFromCoords = useCallback(
    async (lat: number, lng: number, source: 'gps' | 'map') => {
      setResolvingAddress(true);
      setErrorMessage('');
      setLocationSource(source);

      let resolvedFull = '';
      let resolvedPin = '';
      let resolvedCity = '';
      let resolvedState = '';
      let resolvedPlaceId = '';

      // 1. Primary lookup via modern Google Places API (New) Place.searchNearby (CORS-safe JS SDK)
      if (hasMapsKey && placesLib?.Place?.searchNearby) {
        try {
          const nearbyRes = await placesLib.Place.searchNearby({
            locationRestriction: {
              center: { lat, lng },
              radius: 200,
            },
            fields: ['id', 'displayName', 'formattedAddress', 'addressComponents', 'location'],
            maxResultCount: 1,
          });
          const nearest = nearbyRes?.places?.[0];
          if (nearest) {
            resolvedFull = String(nearest.formattedAddress || nearest.displayName || '').trim();
            resolvedPlaceId = String(nearest.id || '');
            resolvedPin = extractIndianPincode(resolvedFull, nearest.addressComponents);
            resolvedCity = getComponentText(nearest.addressComponents, [
              'locality',
              'sublocality_level_1',
              'administrative_area_level_3',
              'administrative_area_level_2',
            ]);
            resolvedState = getComponentText(nearest.addressComponents, [
              'administrative_area_level_1',
            ]);
          }
        } catch (err) {
          if (isGmpQuotaError(err)) {
            triggerGmpQuotaExceeded();
          }
        }
      }

      // 2. Fallback / pincode enrichment if residential coordinate has no nearby POI or missing pincode
      if (!resolvedFull || !resolvedPin) {
        const osmResult = await reverseLookupFromNominatim(lat, lng);
        if (osmResult) {
          if (!resolvedFull) resolvedFull = osmResult.fullAddress;
          if (!resolvedPin) resolvedPin = osmResult.pincode;
          if (!resolvedCity) resolvedCity = osmResult.city;
          if (!resolvedState) resolvedState = osmResult.state;
        }
      }

      // 3. Coordinate-only fallback if device is offline
      if (!resolvedFull) {
        resolvedFull = `GPS Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      }

      setAddressInput(resolvedFull);
      if (resolvedPin) setPincodeInput(resolvedPin);
      setCityMeta(resolvedCity);
      setStateMeta(resolvedState);
      setPlaceIdMeta(resolvedPlaceId);
      setStatusMessage(
        source === 'gps'
          ? 'Live GPS location detected. Confirm address below and save.'
          : 'Map pin updated. Confirm address below and save.'
      );
      setResolvingAddress(false);
    },
    [hasMapsKey, placesLib]
  );

  const handleSelectSuggestion = async (suggestion: PlaceSuggestionItem) => {
    if (!suggestion.placePrediction) return;
    setResolvingAddress(true);
    setErrorMessage('');

    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'],
      });

      const locLat = place.location?.lat();
      const locLng = place.location?.lng();
      if (locLat != null && locLng != null) {
        const nextPt = { lat: locLat, lng: locLng };
        setPinPos(nextPt);
        setCameraTarget(nextPt);
      }

      const fullAddr = String(
        place.formattedAddress || place.displayName || suggestion.placePrediction.text?.text || ''
      ).trim();
      let pin = extractIndianPincode(fullAddr, place.addressComponents);
      let city = getComponentText(place.addressComponents, [
        'locality',
        'sublocality_level_1',
        'administrative_area_level_3',
        'administrative_area_level_2',
      ]);
      let state = getComponentText(place.addressComponents, ['administrative_area_level_1']);

      if (!pin && locLat != null && locLng != null) {
        const osm = await reverseLookupFromNominatim(locLat, locLng);
        if (osm) {
          if (osm.pincode) pin = osm.pincode;
          if (!city) city = osm.city;
          if (!state) state = osm.state;
        }
      }

      setAddressInput(fullAddr);
      if (pin) setPincodeInput(pin);
      setCityMeta(city);
      setStateMeta(state);
      setPlaceIdMeta(String(place.id || ''));
      setLocationSource('search');
      setSearchText('');
      setStatusMessage('Location selected from Google Maps. Confirm and save.');
      resetSearchSession();
    } catch (err) {
      if (isGmpQuotaError(err)) {
        triggerGmpQuotaExceeded();
      }
      setErrorMessage('Could not load selected place details. Please try another search or tap the map.');
    } finally {
      setResolvingAddress(false);
    }
  };

  const handleUseCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMessage('Live GPS is not supported on this browser. Please search or type your address.');
      return;
    }

    setLocatingGps(true);
    setErrorMessage('');
    setStatusMessage('Detecting your current GPS location...');

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const nextPt = { lat, lng };
        setPinPos(nextPt);
        setCameraTarget(nextPt);
        setLocatingGps(false);
        await resolveAddressFromCoords(lat, lng, 'gps');
      },
      err => {
        setLocatingGps(false);
        setStatusMessage('');
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMessage(
            'Location permission denied. Please allow GPS access or search / pick your area on the map.'
          );
        } else {
          setErrorMessage('Unable to fetch GPS signal right now. You can search or tap on the map.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000,
      }
    );
  };

  const handleSave = () => {
    const cleanFull = addressInput.trim();
    const cleanPin = pincodeInput.trim() || extractIndianPincode(cleanFull);

    if (!cleanFull && !cleanPin) {
      setErrorMessage('Please detect GPS, pick a map pin, or enter your delivery address.');
      return;
    }

    const shortLabel = formatShortLocationLabel(
      cityMeta,
      stateMeta,
      cleanPin,
      cleanFull || DEFAULT_LOCATION_LABEL
    );

    const saved = saveDeliveryLocation({
      displayName: shortLabel,
      fullAddress: cleanFull || shortLabel,
      pincode: cleanPin,
      city: cityMeta || undefined,
      state: stateMeta || undefined,
      lat: pinPos.lat,
      lng: pinPos.lng,
      placeId: placeIdMeta || undefined,
      source: locationSource,
      updatedAt: new Date().toISOString(),
    });

    if (onSaved) {
      onSaved(saved);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] bg-[#0B1324] text-slate-100 border-[1px] border-slate-700/80 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-[#0F172A] border-b-[1px] border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-sky-500/20 border-[1px] border-sky-400/40 text-sky-300 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
                <circle cx="12" cy="11" r="2.2" />
              </svg>
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-white truncate">{title}</h3>
              <p className="text-[11px] text-slate-400 truncate">
                Detect GPS or drop a Google Maps pin for instant checkout auto-fill
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location modal"
            className="w-8 h-8 rounded-xl bg-[#151F32] border-[1px] border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 flex items-center justify-center text-xs font-bold shrink-0 transition"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {/* Primary GPS Action Button */}
          <button
            type="button"
            onClick={handleUseCurrentGps}
            disabled={locatingGps}
            className="w-full h-11 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="7" />
            </svg>
            <span>
              {locatingGps
                ? 'Detecting Live GPS...'
                : resolvingAddress
                  ? 'Fetching Address...'
                  : 'Use Current Live GPS Location'}
            </span>
          </button>

          {/* Google Places Search Input */}
          {hasMapsKey && (
            <div className="relative">
              <div className="relative flex items-center">
                <svg
                  className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="Search town, landmark, road or pincode..."
                  className="w-full h-10 bg-[#151F32] border-[1px] border-slate-700/80 rounded-xl pl-9 pr-8 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchText('');
                      resetSearchSession();
                    }}
                    className="absolute right-2.5 text-xs font-bold text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {(suggestions.length > 0 || searchingPlaces) && (
                <div className="mt-1.5 bg-[#151F32] border-[1px] border-slate-700 rounded-xl overflow-hidden shadow-lg max-h-44 overflow-y-auto">
                  {searchingPlaces && suggestions.length === 0 ? (
                    <div className="px-3.5 py-2.5 text-xs text-slate-400">Searching places...</div>
                  ) : (
                    suggestions.map((item, idx) => (
                      <button
                        key={item.placePrediction?.placeId || idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(item)}
                        className="w-full px-3.5 py-2.5 text-left text-xs text-slate-100 hover:bg-[#1E293B] border-b-[1px] border-slate-800 last:border-b-0 flex items-start gap-2 transition"
                      >
                        <span className="text-sky-400 mt-0.5 shrink-0">📍</span>
                        <span className="leading-snug">{item.placePrediction?.text?.text}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Interactive Google Map Canvas with Draggable AdvancedMarker Pin */}
          {hasMapsKey && (
            <div className="space-y-1.5">
              <div className="w-full h-52 sm:h-60 rounded-2xl overflow-hidden border-[1px] border-slate-700/80 bg-[#0F172A] relative">
                <GoogleMapView
                  mapId="DEMO_MAP_ID"
                  defaultCenter={pinPos}
                  defaultZoom={initialSaved?.lat != null ? 15 : 11}
                  gestureHandling="greedy"
                  streetViewControl={false}
                  mapTypeControl={false}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  onClick={e => {
                    const clicked = e.detail?.latLng;
                    if (clicked) {
                      const pt = { lat: clicked.lat, lng: clicked.lng };
                      setPinPos(pt);
                      setCameraTarget(pt);
                      void resolveAddressFromCoords(pt.lat, pt.lng, 'map');
                    }
                  }}
                >
                  <MapCameraUpdater target={cameraTarget} />
                  <AdvancedMarker
                    position={pinPos}
                    draggable={true}
                    onDragEnd={e => {
                      const lat = e.latLng?.lat();
                      const lng = e.latLng?.lng();
                      if (lat != null && lng != null) {
                        const pt = { lat, lng };
                        setPinPos(pt);
                        void resolveAddressFromCoords(lat, lng, 'map');
                      }
                    }}
                    title="Delivery Pin"
                  >
                    <Pin background="#0284c7" borderColor="#e0f2fe" glyphColor="#ffffff" scale={1.15} />
                  </AdvancedMarker>
                </GoogleMapView>
              </div>
              <p className="text-[11px] text-slate-400">
                Tap anywhere on the map or drag the blue pin to pinpoint your exact delivery spot.
              </p>
            </div>
          )}

          {statusMessage && (
            <div className="px-3 py-2 rounded-xl bg-sky-500/15 border-[1px] border-sky-400/40 text-xs font-semibold text-sky-200">
              {statusMessage}
            </div>
          )}

          {errorMessage && (
            <div className="px-3 py-2 rounded-xl bg-rose-500/15 border-[1px] border-rose-400/40 text-xs font-semibold text-rose-200">
              {errorMessage}
            </div>
          )}

          {/* Editable Address & Pincode Fields */}
          <div className="space-y-3 pt-0.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Full Delivery Address (auto-filled in Checkout)
              </label>
              <textarea
                rows={2}
                value={addressInput}
                onChange={e => setAddressInput(e.target.value)}
                placeholder="House name, street, landmark, town, district"
                className="w-full bg-[#151F32] border-[1px] border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Pincode
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={pincodeInput}
                onChange={e => setPincodeInput(e.target.value)}
                placeholder="e.g. 673001"
                className="w-full h-10 bg-[#151F32] border-[1px] border-slate-700/80 rounded-xl px-3.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="px-4 sm:px-5 py-3.5 bg-[#0F172A] border-t-[1px] border-slate-800 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-xl bg-[#151F32] hover:bg-[#1E293B] border-[1px] border-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-[1.6] h-10 rounded-xl bg-[#FFC200] hover:bg-[#f5b800] text-slate-950 text-xs sm:text-sm font-extrabold shadow-xs transition cursor-pointer"
          >
            Save &amp; Use Location
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LocationPickerModal({
  isOpen,
  onClose,
  onSaved,
  title = 'Choose Delivery Location',
}: LocationPickerModalProps) {
  if (!isOpen) return null;

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <LocationPickerBody
        onClose={onClose}
        onSaved={onSaved}
        title={title}
        hasMapsKey={false}
      />
    );
  }

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      region="IN"
      language="en"
      libraries={['places', 'marker']}
    >
      <LocationPickerBody
        onClose={onClose}
        onSaved={onSaved}
        title={title}
        hasMapsKey={true}
      />
    </APIProvider>
  );
}
