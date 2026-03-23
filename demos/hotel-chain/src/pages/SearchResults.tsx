import { useLocation } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useHotelFilter } from '../hooks/useHotelFilter';
import { useWebMCP } from '../hooks/useWebMCP';
import { HotelCard } from '../components/ui/HotelCard';
import { PageHeader } from '../components/ui/PageHeader';
import { FilterBadge } from '../components/ui/AmenityBadge';
import { Button } from '../components/ui/Button';
import { AVAILABLE_AMENITIES, CITY_LABELS, Z_INDEX } from '../constants';

export default function SearchResults() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const locationQuery = searchParams.get('q') || 'Shibuya, Tokyo';

  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const {
    maxPrice,
    requiredAmenities,
    setMaxPrice,
    setRequiredAmenities,
    toggleAmenity,
    featuredHotels,
    standardHotels,
    count
  } = useHotelFilter(locationQuery);

  // Register WebMCP Tool
  useWebMCP([{
    name: 'search_hotels',
    description: 'Filter the search results by max price and required amenities',
    inputSchema: {
      type: 'object',
      properties: {
        max_price: { type: 'number', description: 'Maximum price per night' },
        amenities: { type: 'array', items: { type: 'string' }, description: 'Required amenities' }
      }
    },
    execute: (input: any) => {
      if (input.max_price !== undefined) setMaxPrice(input.max_price);
      if (input.amenities) setRequiredAmenities(input.amenities);
      return { success: true, message: 'Filtered results on page' };
    }
  }]);

  const displayLocation = useMemo(() => {
    const q = locationQuery.toLowerCase();
    if (q.includes('new york') || q.includes('nyc')) return CITY_LABELS['new york'];
    if (q.includes('paris')) return CITY_LABELS['paris'];
    if (q === 'all' || q === '') return CITY_LABELS['all'];
    return CITY_LABELS['tokyo'];
  }, [locationQuery]);

  return (
    <main className="pt-32 pb-20 max-w-[1440px] mx-auto px-8 w-full">
      <PageHeader
        label={`Found ${count} Properties`}
        title={displayLocation}
        description={
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {maxPrice !== null && (
              <FilterBadge 
                label={`Max price $${maxPrice}`} 
                onRemove={() => setMaxPrice(null)} 
              />
            )}
            {requiredAmenities.map(am => (
              <FilterBadge 
                key={am} 
                label={`Amenity: ${am}`} 
                onRemove={() => toggleAmenity(am)} 
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              icon="tune"
              onClick={() => setIsFilterMenuOpen(true)}
              className="ml-2"
            >
              All Filters
            </Button>
          </div>
        }
      />

      {/* Featured Results */}
      <div className="grid grid-cols-1 gap-10 mb-16">
        {featuredHotels.map(hotel => (
          <HotelCard key={hotel.id} hotel={hotel} variant="featured" />
        ))}
      </div>

      {/* Standard Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {standardHotels.map(hotel => (
          <HotelCard key={hotel.id} hotel={hotel} variant="standard" />
        ))}
      </div>

      {/* Map View CTA */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2" style={{ zIndex: Z_INDEX.FLOATING_CTA }}>
        <Button variant="primary" icon="map" className="rounded-full shadow-2xl scale-110">
          Show Map
        </Button>
      </div>

      {/* Filter Overlay */}
      {isFilterMenuOpen && (
        <div 
          className="fixed inset-0 bg-secondary/20 backdrop-blur-sm flex items-center justify-center p-4 transition-all animate-in fade-in duration-300"
          style={{ zIndex: Z_INDEX.MODAL }}
        >
          <div className="bg-surface-container-lowest rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-primary font-headline">Refine Search</h2>
              <Button variant="outline" size="sm" icon="close" onClick={() => setIsFilterMenuOpen(false)} className="rounded-full h-10 w-10 p-0" />
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-[10px] uppercase font-bold text-outline tracking-widest mb-3">Max Price / Night ($)</label>
                <input
                  type="number"
                  value={maxPrice || ''}
                  onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Unlimited budget"
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-4 text-primary focus:outline-none focus:border-primary transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-outline tracking-widest mb-4">Required Amenities</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_AMENITIES.map(am => {
                    const isActive = requiredAmenities.includes(am);
                    return (
                      <button
                        key={am}
                        onClick={() => toggleAmenity(am)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border cursor-pointer ${
                          isActive
                            ? 'bg-primary text-on-primary border-primary shadow-md'
                            : 'bg-transparent text-on-surface-variant border-outline-variant/30 hover:border-primary/50'
                        }`}
                      >
                        {am.charAt(0).toUpperCase() + am.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button size="full" onClick={() => setIsFilterMenuOpen(false)} className="mt-4">
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
