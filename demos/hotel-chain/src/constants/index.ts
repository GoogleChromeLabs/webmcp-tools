export const AVAILABLE_AMENITIES = [
  'gym',
  'spa',
  'dining',
  'wifi',
  'breakfast',
  'rooftop bar',
  'bar',
  'laundry',
  'late checkout'
] as string[];

export const CITY_LABELS: Record<string, string> = {
  tokyo: 'Shibuya, Tokyo',
  'new york': 'New York, USA',
  paris: 'Paris, France',
  all: 'All Locations'
};

export const CITY_KEYWORDS: Record<string, string[]> = {
  'tokyo': ['tokyo', 'shibuya', 'japan'],
  'new york': ['new york', 'nyc', 'manhattan'],
  'paris': ['paris', 'france']
};

export function getTargetCity(query: string | null): string | null {
  const q = (query || '').toLowerCase();
  if (q === '' || q === 'all') return 'all';
  
  for (const [city, keywords] of Object.entries(CITY_KEYWORDS)) {
    if (keywords.some(k => q.includes(k))) return city;
  }
  
  return null;
}

export const Z_INDEX = {
  NAV: 50,
  MODAL: 100,
  FLOATING_CTA: 40
} as const;
