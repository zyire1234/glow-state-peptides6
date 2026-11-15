import React, { useEffect, useRef, useState } from 'react';

/**
 * Australian address autocomplete using Photon (photon.komoot.io).
 * Photon is a free, key-less geocoder built on OpenStreetMap data and made for
 * search-as-you-type (unlike the public Nominatim server, which forbids autocomplete).
 *
 * - No API key, no Google, no Australia Post.
 * - Restricted to Australia: bounding box around Australia + countrycode === 'AU' filter.
 * - Starts after 3 characters, 300ms debounce, cancels stale requests.
 */

// minLon,minLat,maxLon,maxLat — covers mainland Australia, Tasmania and offshore islands.
const AU_BBOX = '112.5,-44.0,154.0,-9.0';
const PHOTON_URL =
  `https://photon.komoot.io/api/?lang=en&limit=15&bbox=${AU_BBOX}&q=`;

const STATE_MAP: Record<string, string> = {
  'new south wales': 'NSW',
  'victoria': 'VIC',
  'queensland': 'QLD',
  'south australia': 'SA',
  'western australia': 'WA',
  'tasmania': 'TAS',
  'northern territory': 'NT',
  'australian capital territory': 'ACT',
  'jervis bay territory': 'ACT',
};

/** True when the 4-digit postcode belongs to the given Australian state/territory. */
export function postcodeMatchesState(postcode: string, state: string): boolean {
  if (!/^\d{4}$/.test(postcode)) return false;
  const n = parseInt(postcode, 10);
  const inRange = (a: number, b: number) => n >= a && n <= b;
  switch (state) {
    case 'NSW': return inRange(1000, 2599) || inRange(2619, 2898) || inRange(2921, 2999);
    case 'ACT': return inRange(200, 299) || inRange(2600, 2618) || inRange(2900, 2920);
    case 'VIC': return inRange(3000, 3999) || inRange(8000, 8999);
    case 'QLD': return inRange(4000, 4999) || inRange(9000, 9999);
    case 'SA':  return inRange(5000, 5999);
    case 'WA':  return inRange(6000, 6999);
    case 'TAS': return inRange(7000, 7999);
    case 'NT':  return inRange(800, 999);
    default:    return false;
  }
}

export interface AddressSelection {
  address: string;   // full display text
  suburb: string;    // billing_city
  state: string;     // billing_state
  postcode: string;  // billing_postcode
}

interface PhotonFeature {
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    district?: string;
    locality?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string; // house | street | locality | district | city | county | state | country | other
  };
}

interface Suggestion extends AddressSelection {
  id: string;
}

/** Turn one Photon result into display text + suburb / state / postcode (blank when unknown). */
export function parsePhotonFeature(f: PhotonFeature): AddressSelection {
  const p = f.properties || {};

  // Suburb / city. For place-type results (a suburb, town, village) the name IS the suburb.
  const placeTypes = ['city', 'locality', 'district'];
  const suburb =
    (p.type && placeTypes.includes(p.type) && p.name) ||
    p.district || p.locality || p.city || p.county || '';

  const state = STATE_MAP[(p.state || '').toLowerCase().trim()] || '';

  // Keep only a clean 4-digit postcode.
  const pc = (p.postcode || '').match(/\b\d{4}\b/);
  const postcode = pc ? pc[0] : '';

  // Build "12 Smith St, Suburb, State 2000, Australia" style text.
  const streetLine = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street || '';
  const parts: string[] = [];
  if (p.name && p.name !== p.street && p.name !== suburb && !(p.type && placeTypes.includes(p.type))) {
    parts.push(p.name); // shop / building / landmark name
  }
  if (streetLine) parts.push(streetLine);
  if (suburb) parts.push(suburb);
  if (p.state) parts.push(postcode ? `${p.state} ${postcode}` : p.state);
  else if (postcode) parts.push(postcode);
  parts.push('Australia');

  const address = parts.filter((x, i) => x && x !== parts[i - 1]).join(', ');
  return { address, suburb, state, postcode };
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: AddressSelection) => void;
  inputClassName?: string;
  placeholder?: string;
}

export const AddressAutocomplete: React.FC<Props> = ({
  value,
  onChange,
  onSelect,
  inputClassName = '',
  placeholder = '123 Queen Street, Brisbane',
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Set when the value change came from picking a suggestion, so we don't search again.
  const skipNextSearchRef = useRef(false);

  // Debounced search whenever the typed value changes.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      setMessage('');
      return;
    }

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setMessage('');
      try {
        const res = await fetch(PHOTON_URL + encodeURIComponent(query), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error('Photon error ' + res.status);
        const data = await res.json();
        const features: PhotonFeature[] = Array.isArray(data?.features) ? data.features : [];

        // Australia only (safety net on top of the bounding box), no duplicates, max 10.
        const seen = new Set<string>();
        const clean: Suggestion[] = [];
        for (const f of features) {
          const p = f.properties || {};
          if ((p.countrycode || '').toUpperCase() !== 'AU') continue;
          // Only street-level results can be delivered to (not a whole suburb, city, state or country).
          if (p.type && !['house', 'street', 'other'].includes(p.type)) continue;
          const parsed = parsePhotonFeature(f);
          if (!parsed.address || seen.has(parsed.address)) continue;
          seen.add(parsed.address);
          clean.push({ ...parsed, id: `${p.osm_type || ''}${p.osm_id || ''}-${clean.length}` });
          if (clean.length >= 10) break;
        }
        setSuggestions(clean);
        setMessage(clean.length === 0 ? 'No matching Australian street address found. Check the spelling or add the street name.' : '');
        setOpen(true);
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // a newer search replaced this one
        setSuggestions([]);
        setMessage('Address lookup is unavailable right now. Please try again in a moment.');
        setOpen(true);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  // Close dropdown when tapping / clicking outside (works for touch and mouse).
  useEffect(() => {
    const handler = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const choose = (s: Suggestion) => {
    skipNextSearchRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setSuggestions([]);
    setOpen(false);
    setLoading(false);
    setMessage('');
    onSelect({ address: s.address, suburb: s.suburb, state: s.state, postcode: s.postcode });
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        id="delivery-address"
        name="delivery_address"
        type="text"
        required
        autoComplete="off"
        autoCorrect="off"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          if (!v.trim()) setOpen(false);
        }}
        onFocus={() => {
          if (suggestions.length > 0 || message) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className={inputClassName}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="suggestions"
      />

      {open && value.trim().length >= 3 && (
        <div
          id="suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-300 rounded-xl shadow-lg overflow-y-auto"
          style={{ maxHeight: 260, WebkitOverflowScrolling: 'touch' }}
        >
          {suggestions.map((s) => (
            <div
              key={s.id}
              role="option"
              tabIndex={-1}
              // preventDefault keeps focus on the input so the click registers on mobile and desktop.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
              className="px-3.5 py-3 text-sm text-gray-900 bg-white border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-purple-50 active:bg-purple-100"
            >
              {s.address}
            </div>
          ))}
          {message && suggestions.length === 0 && (
            <div className="px-3.5 py-3 text-xs text-gray-600 bg-white">{message}</div>
          )}
        </div>
      )}

      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
          Searching…
        </span>
      )}
    </div>
  );
};
