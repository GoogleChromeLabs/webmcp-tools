import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { hotels } from '../data/hotels';

export default function Layout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (window.navigator.modelContext) {
      const modelContext = window.navigator.modelContext;

      modelContext.registerTool({
        name: 'search_location',
        description: 'Find me a hotel in a specific location',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The location query' }
          },
          required: ['query']
        },
        execute: (input: any) => {
          navigate('/search?q=' + encodeURIComponent(input.query));
          return { success: true, message: `Navigated to search results for ${input.query}` };
        }
      });

      modelContext.registerTool({
        name: 'lookup_amenity',
        description: 'Look up specific amenity or policy details for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotel_id: { type: 'string', description: 'The ID of the hotel' },
            amenity: { type: 'string', description: 'The amenity or policy to look up (e.g. "late_checkout")' }
          },
          required: ['hotel_id', 'amenity']
        },
        execute: (input: any) => {
          navigate(`/hotel/${input.hotel_id}?amenity=${encodeURIComponent(input.amenity)}`);
          return { success: true, message: `Navigated to hotel details to show ${input.amenity}` };
        }
      });

      modelContext.registerTool({
        name: 'view_hotel',
        description: 'View the details of a specific hotel by name or id',
        inputSchema: {
          type: 'object',
          properties: {
            hotel_name_or_id: { type: 'string', description: 'The exact name or ID of the hotel to view' }
          },
          required: ['hotel_name_or_id']
        },
        execute: (input: any) => {
          const query = input.hotel_name_or_id.toLowerCase();
          const hotel = hotels.find(h => h.id.toLowerCase() === query || h.name.toLowerCase().includes(query));
          if (hotel) {
            navigate(`/hotel/${hotel.id}`);
            return { success: true, message: `Navigated to hotel details for ${hotel.name}` };
          }
          return { success: false, error: `Could not find a hotel matching "${input.hotel_name_or_id}". Please search first.` };
        }
      });

      return () => {
        modelContext.unregisterTool('search_location');
        modelContext.unregisterTool('lookup_amenity');
        modelContext.unregisterTool('view_hotel');
      };
    }
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,12,30,0.06)]">
        <div className="max-w-[1440px] mx-auto flex justify-between items-center px-8 py-4">
          <div className="flex items-center gap-12">
            <Link to="/" className="text-2xl font-bold tracking-tighter text-slate-900 dark:text-slate-50 font-headline">L'Atelier</Link>
            <div className="hidden md:flex items-center gap-8">
              <Link to="/" className="text-slate-900 dark:text-slate-50 border-b-2 border-amber-600/50 pb-1 font-headline tracking-tight hover:text-amber-700 transition-colors duration-300">Home</Link>
              <Link to="/search" className="text-slate-500 dark:text-slate-400 pb-1 font-headline tracking-tight hover:text-amber-700 transition-colors duration-300">Hotels</Link>
              <Link to="/" className="text-slate-500 dark:text-slate-400 pb-1 font-headline tracking-tight hover:text-amber-700 transition-colors duration-300">Destinations</Link>
              <Link to="/" className="text-slate-500 dark:text-slate-400 pb-1 font-headline tracking-tight hover:text-amber-700 transition-colors duration-300">Loyalty</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="w-full flex-1">
        <Outlet />
      </div>

      {/* Footer */}
      <footer className="w-full pt-20 pb-10 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-900">
        <div className="max-w-[1440px] mx-auto px-10 flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="max-w-sm">
            <span className="text-xl font-bold font-headline text-slate-900 dark:text-slate-50 mb-6 block">L'Atelier</span>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-8 font-body antialiased">
              Crafting extraordinary stays in the world's most evocative destinations. Part of the L'Atelier Hospitality Group.
            </p>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-amber-600 transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm" data-icon="share">share</span>
              </div>
              <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-amber-600 transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm" data-icon="mail">mail</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 md:gap-24">
            <div className="flex flex-col gap-4">
              <span className="font-bold text-slate-900 dark:text-slate-50 font-body text-sm antialiased">Discover</span>
              <a className="text-slate-500 dark:text-slate-400 text-sm hover:text-amber-700 transition-all duration-200" href="#">Our Story</a>
              <a className="text-slate-500 dark:text-slate-400 text-sm hover:text-amber-700 transition-all duration-200" href="#">Sustainability</a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="font-bold text-slate-900 dark:text-slate-50 font-body text-sm antialiased">Legal</span>
              <a className="text-slate-500 dark:text-slate-400 text-sm hover:text-amber-700 transition-all duration-200" href="#">Privacy Policy</a>
              <a className="text-slate-500 dark:text-slate-400 text-sm hover:text-amber-700 transition-all duration-200" href="#">Terms of Service</a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="font-bold text-slate-900 dark:text-slate-50 font-body text-sm antialiased">Support</span>
              <a className="text-slate-500 dark:text-slate-400 text-sm hover:text-amber-700 transition-all duration-200" href="#">Contact</a>
            </div>
          </div>
        </div>
        <div className="max-w-[1440px] mx-auto px-10 mt-20 pt-8 border-t border-slate-100 dark:border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">© 2026 Demo Website. Not a real product. L'Atelier Hospitality Group. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
