import { useState, useMemo } from 'react';
import { hotels } from '../data/hotels';
import { getTargetCity } from '../constants';

interface FilterState {
  maxPrice: number | null;
  requiredAmenities: string[];
}

export function useHotelFilter(locationQuery: string | null) {
  const [filters, setFilters] = useState<FilterState>({
    maxPrice: null,
    requiredAmenities: [],
  });

  const setMaxPrice = (price: number | null) => 
    setFilters(prev => ({ ...prev, maxPrice: price }));

  const setRequiredAmenities = (amenities: string[]) => 
    setFilters(prev => ({ ...prev, requiredAmenities: amenities }));

  const toggleAmenity = (amenity: string) => {
    setFilters(prev => {
      const isIncluded = prev.requiredAmenities.includes(amenity);
      return {
        ...prev,
        requiredAmenities: isIncluded
          ? prev.requiredAmenities.filter(a => a !== amenity)
          : [...prev.requiredAmenities, amenity]
      };
    });
  };

  const filteredHotels = useMemo(() => {
    const targetCity = getTargetCity(locationQuery);

    return hotels.filter(hotel => {
      // Location match
      if (targetCity === null) return false;
      if (targetCity !== 'all' && hotel.city !== targetCity) return false;

      // Price match
      if (filters.maxPrice !== null && hotel.price > filters.maxPrice) return false;

      // Amenities match
      if (filters.requiredAmenities.length > 0) {
        return filters.requiredAmenities.every(req =>
          hotel.amenities.some(am => am.filterKey === req.toLowerCase())
        );
      }

      return true;
    });
  }, [locationQuery, filters]);

  const featuredHotels = useMemo(() => filteredHotels.filter(h => h.isFeatured), [filteredHotels]);
  const standardHotels = useMemo(() => filteredHotels.filter(h => !h.isFeatured), [filteredHotels]);

  return {
    ...filters,
    setMaxPrice,
    setRequiredAmenities,
    toggleAmenity,
    filteredHotels,
    featuredHotels,
    standardHotels,
    count: filteredHotels.length
  };
}
