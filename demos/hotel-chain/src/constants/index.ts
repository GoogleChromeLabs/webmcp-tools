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

export const Z_INDEX = {
  NAV: 50,
  MODAL: 100,
  FLOATING_CTA: 40
} as const;
