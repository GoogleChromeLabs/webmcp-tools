import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { hotels } from '../data/hotels';

export default function SearchResults() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const qParam = searchParams.get('q');
  const locationQuery = qParam !== null ? qParam : 'Shibuya, Tokyo';

  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [requiredAmenities, setRequiredAmenities] = useState<string[]>([]);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const availableAmenities = ['gym', 'spa', 'dining', 'wifi', 'breakfast', 'rooftop bar', 'bar', 'laundry', 'late checkout'];

  const toggleAmenity = (amenity: string) => {
    if (requiredAmenities.includes(amenity)) {
      setRequiredAmenities(requiredAmenities.filter(a => a !== amenity));
    } else {
      setRequiredAmenities([...requiredAmenities, amenity]);
    }
  };

  useEffect(() => {
    if (window.navigator.modelContext) {
      const modelContext = window.navigator.modelContext;
      modelContext.registerTool({
        name: 'search_hotels',
        description: 'Filter the search results by max price and required amenities',
        inputSchema: {
          type: 'object',
          properties: {
            max_price: { type: 'number', description: 'Maximum price per night' },
            amenities: { type: 'array', items: { type: 'string' }, description: 'Required amenities' }
          }
        },
        execute: async (input: any) => {
          if (input.max_price !== undefined) setMaxPrice(input.max_price);
          if (input.amenities) setRequiredAmenities(input.amenities);
          return { success: true, message: 'Filtered results on page' };
        }
      });
      return () => {
        modelContext.unregisterTool('search_hotels');
      };
    }
  }, []);



  const locRaw = locationQuery.toLowerCase();
  const isEmptyLocation = locRaw.trim() === '' || locRaw.trim() === 'all';
  const isNY = locRaw.includes('new york') || locRaw.includes('nyc') || locRaw.includes('manhattan');
  const isParis = locRaw.includes('paris') || locRaw.includes('france');

  const targetCity = isEmptyLocation ? 'all' : isNY ? 'new york' : isParis ? 'paris' : 'tokyo';

  const filteredHotels = hotels.filter(hotel => {
    // Location match
    if (targetCity !== 'all' && hotel.city !== targetCity) return false;

    // Price match
    if (maxPrice !== null && hotel.price > maxPrice) return false;

    // Amenities match
    if (requiredAmenities.length > 0) {
      const hasAll = requiredAmenities.every(req =>
        hotel.amenities.some(am => am.filterKey === req.toLowerCase())
      );
      if (!hasAll) return false;
    }

    return true;
  });

  const featuredHotels = filteredHotels.filter(h => h.isFeatured);
  const standardHotels = filteredHotels.filter(h => !h.isFeatured);

  const visibleCount = filteredHotels.length;

  const displayLocation = isEmptyLocation ? 'All Locations' : isNY ? 'New York, USA' : isParis ? 'Paris, France' : 'Shibuya, Tokyo';

  return (
    <main className="pt-32 pb-20 max-w-[1440px] mx-auto px-8 w-full">
      {/* Search Header & Filters */}
      <header className="mb-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <span className="text-on-tertiary-container font-semibold uppercase tracking-widest text-[0.75rem] mb-2 block">Found {visibleCount} Properties</span>
            <h1 className="font-headline text-5xl font-extrabold tracking-tight text-primary">{displayLocation}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {maxPrice !== null && (
              <div className="bg-surface-container-lowest border border-outline-variant/20 px-4 py-2 flex items-center gap-2 rounded-full text-sm">
                <span className="text-on-surface-variant">Max price ${maxPrice}</span>
                <span className="material-symbols-outlined text-xs cursor-pointer" onClick={() => setMaxPrice(null)}>close</span>
              </div>
            )}
            {requiredAmenities.map(am => (
              <div key={am} className="bg-surface-container-lowest border border-outline-variant/20 px-4 py-2 flex items-center gap-2 rounded-full text-sm">
                <span className="text-on-surface-variant">Amenity: {am}</span>
                <span className="material-symbols-outlined text-xs cursor-pointer" onClick={() => setRequiredAmenities(requiredAmenities.filter(a => a !== am))}>close</span>
              </div>
            ))}
            <button
              onClick={() => setIsFilterMenuOpen(true)}
              className="flex items-center gap-2 text-primary font-semibold text-sm ml-4 border-none bg-transparent cursor-pointer"
            >
              <span className="material-symbols-outlined">tune</span>
              All Filters
            </button>
          </div>
        </div>
      </header>

      {/* Search Results Grid */}
      {/* Featured Results Grid */}
      <div className="grid grid-cols-1 gap-10 mb-10">
        {featuredHotels.map(hotel => (
          <section key={hotel.id} className="group relative overflow-hidden bg-surface-container-lowest rounded-xl shadow-[0_20px_40px_rgba(0,12,30,0.06)] flex flex-col lg:flex-row transition-all duration-500 hover:shadow-xl">
            <div className="lg:w-3/5 h-[400px] lg:h-auto relative overflow-hidden">
              <img className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src={hotel.imageSrc} />
              <div className="absolute top-6 left-6 bg-primary text-on-primary px-4 py-1 text-xs font-bold tracking-widest uppercase rounded">{hotel.featuredTag}</div>
            </div>
            <div className="lg:w-2/5 p-10 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="font-headline text-3xl font-bold text-primary mb-1">{hotel.name}</h2>
                    <div className="flex items-center gap-1 text-tertiary-fixed-dim">
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span className="text-on-surface-variant text-sm font-medium ml-2">({hotel.rating}/5)</span>
                    </div>
                  </div>
                </div>
                <p className="text-on-surface-variant leading-relaxed mb-8 editorial-indent">{hotel.description}</p>

                <div className="grid grid-cols-2 gap-y-4 mb-8">
                  {hotel.amenities.map(am => (
                    <div key={am.label} className="flex items-center gap-3 text-sm text-on-surface">
                      <span className="material-symbols-outlined text-on-primary-container">{am.icon}</span>
                      <span>{am.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-8 border-t border-outline-variant/10">
                <div>
                  <span className="text-on-surface-variant text-xs uppercase tracking-tighter">Starting from</span>
                  <div className="text-2xl font-bold text-primary">${hotel.price} <span className="text-sm font-normal text-on-surface-variant">/ night</span></div>
                </div>
                <button 
                  onClick={() => navigate('/hotel/' + hotel.id)}
                  className="bg-primary text-on-primary px-10 py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors"
                >
                  View Experience
                </button>
              </div>
            </div>
          </section>
        ))}
      </div>

        {/* Standard Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {standardHotels.map(hotel => (
          <div key={hotel.id} onClick={() => navigate('/hotel/' + hotel.id)} className="bg-surface-container-lowest rounded-xl overflow-hidden flex flex-col group border border-transparent hover:border-outline-variant/20 transition-all cursor-pointer">
            <div className="h-64 relative overflow-hidden">
              <img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" src={hotel.imageSrc} />
              <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded text-xs font-bold text-primary">{hotel.rating} Rating</div>
            </div>
            <div className="p-6 flex-grow flex flex-col justify-between">
              <div>
                <h3 className="font-headline text-xl font-bold text-primary mb-2">{hotel.name}</h3>
                <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant mb-6">
                  {hotel.amenities.map((am, i) => (
                    <span key={i} className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">{am.icon}</span> {am.label}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-2xl font-bold text-primary">${hotel.price}</span>
                  <span className="text-xs text-on-surface-variant block">Avg/night</span>
                </div>
                <button className="text-on-tertiary-container font-bold text-sm bg-transparent border-none hover:underline underline-offset-8 transition-all">Select Dates</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Map View CTA */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40">
        <button className="bg-primary text-on-primary px-8 py-3 rounded-full flex items-center gap-3 shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer">
          <span className="material-symbols-outlined">map</span>
          <span className="font-bold tracking-tight">Show Map</span>
        </button>
      </div>

      {/* Filter Overlay */}
      {isFilterMenuOpen && (
        <div className="fixed inset-0 bg-secondary/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-primary font-headline">All Filters</h2>
              <button
                onClick={() => setIsFilterMenuOpen(false)}
                className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors cursor-pointer border-none bg-transparent p-0 flex"
              >
                close
              </button>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-bold text-on-surface mb-2">Max Price / Night ($)</label>
              <input
                type="number"
                value={maxPrice || ''}
                onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : null)}
                placeholder="No limit"
                className="w-full bg-surface-container border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="mb-8">
              <label className="block text-sm font-bold text-on-surface mb-3">Amenities</label>
              <div className="flex flex-wrap gap-2">
                {availableAmenities.map(am => (
                  <button
                    key={am}
                    onClick={() => toggleAmenity(am)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer ${requiredAmenities.includes(am)
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-transparent text-on-surface-variant border-outline-variant/30 hover:border-primary/50'
                      }`}
                  >
                    {am.charAt(0).toUpperCase() + am.slice(1).replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setIsFilterMenuOpen(false)}
              className="w-full bg-primary text-on-primary font-bold rounded-lg py-3 hover:bg-primary/90 transition-colors cursor-pointer border-none"
            >
              Show Results
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
