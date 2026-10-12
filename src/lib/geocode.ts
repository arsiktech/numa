/**
 * Geolocation + reverse-geocoding helpers.
 *
 * - `getCurrentPosition` wraps `navigator.geolocation.getCurrentPosition` in a
 *   Promise with a 10s timeout. Rejects with a typed error on denial or failure.
 * - `reverseGeocode` queries the free Nominatim API for a short human-readable
 *   label ("Mercadona, Madrid"). Times out after 5s. Results are cached in
 *   localStorage (rounded to ~110m precision) so we never repeat the same
 *   request — keeps us well under Nominatim's 1 req/sec policy.
 *
 * Note: Nominatim's CORS policy permits browser-side requests, but the service
 * is slow and rate-limited. Treat the label as best-effort; on failure the UI
 * silently falls back to raw coordinates (or omits the label entirely).
 */

export interface Coords {
  lat: number;
  lng: number;
}

export interface GeoError extends Error {
  code: "denied" | "unavailable" | "timeout" | "unsupported";
}

function makeError(message: string, code: GeoError["code"]): GeoError {
  const err = new Error(message) as GeoError;
  err.code = code;
  return err;
}

/**
 * Resolve with the browser's current GPS position. Rejects with a typed `GeoError`.
 * Must be called from a user gesture on iOS Safari — the prompt won't show otherwise.
 */
export function getCurrentPosition(): Promise<Coords> {
  return new Promise<Coords>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(makeError("Geolocation is not available in this browser.", "unsupported"));
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(makeError("Location request timed out.", "timeout"));
    }, 10_000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (err.code === err.PERMISSION_DENIED) {
          reject(makeError("Location access blocked.", "denied"));
        } else if (err.code === err.TIMEOUT) {
          reject(makeError("Location request timed out.", "timeout"));
        } else {
          reject(makeError("Location is unavailable.", "unavailable"));
        }
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Reverse geocoding via Nominatim + localStorage cache               */
/* ------------------------------------------------------------------ */

const CACHE_KEY = "numa:geocode:v1";
const CACHE_LIMIT = 50;

interface CacheEntry {
  key: string;
  label: string;
  at: number;
}

function roundKey(lat: number, lng: number): string {
  // ~110m precision (3 decimal places). Plenty granular for a "where did I shop".
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function readCache(): CacheEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CacheEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as CacheEntry).key === "string" &&
        typeof (e as CacheEntry).label === "string" &&
        typeof (e as CacheEntry).at === "number"
    );
  } catch {
    return [];
  }
}

function writeCache(entries: CacheEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = entries.slice(-CACHE_LIMIT);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may throw on quota / private-mode; treat as best-effort.
  }
}

function readCachedLabel(lat: number, lng: number): string | undefined {
  const key = roundKey(lat, lng);
  const entries = readCache();
  return entries.find((e) => e.key === key)?.label;
}

function cacheLabel(lat: number, lng: number, label: string): void {
  const key = roundKey(lat, lng);
  const entries = readCache().filter((e) => e.key !== key);
  entries.push({ key, label, at: Date.now() });
  writeCache(entries);
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  state?: string;
  country?: string;
  shop?: string;
  amenity?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
}

/**
 * Pull a short "place, city" style label from a Nominatim response.
 * Falls back to the first comma-separated chunk of `display_name`.
 */
function shortLabel(data: NominatimResponse): string | null {
  const a = data.address;
  if (a) {
    const place = a.shop ?? a.amenity ?? a.road ?? a.pedestrian ?? a.neighbourhood ?? a.suburb;
    const city = a.city ?? a.town ?? a.village ?? a.municipality;
    if (place && city) return `${place}, ${city}`;
    if (place) return place;
    if (city) return city;
  }
  if (data.display_name) {
    // "Mercadona, Calle X, Centro, Madrid, Spain" → "Mercadona, Calle X"
    const parts = data.display_name.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
    if (parts.length === 1) return parts[0]!;
  }
  return null;
}

/**
 * Resolve to a short human-readable label or `null` on failure.
 * Cached in localStorage. Times out after 5s.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const cached = readCachedLabel(lat, lng);
  if (cached) return cached;

  if (typeof fetch === "undefined") return null;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
      lat.toString()
    )}&lon=${encodeURIComponent(lng.toString())}&zoom=18&addressdetails=1`;
    // NOTE: Nominatim's usage policy asks for a custom UA. Browsers won't let
    // us override `User-Agent`, but they do attach `Referer`/`Origin` and
    // `Accept-Language`, which Nominatim accepts as identification. We also
    // cache aggressively to stay well under their 1 req/sec ceiling.
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": navigator.language || "en"
      }
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResponse;
    const label = shortLabel(data);
    if (!label) return null;
    cacheLabel(lat, lng, label);
    return label;
  } catch {
    window.clearTimeout(timer);
    return null;
  }
}
