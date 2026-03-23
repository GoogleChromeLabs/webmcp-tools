import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { hotels } from '../data/hotels';

export default function HotelDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  const hotel = hotels.find(h => h.id === id) || hotels[0];

  const policiesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const amenity = searchParams.get('amenity');
    if (amenity) {
      policiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      policiesRef.current?.classList.add('ring-4', 'ring-primary', 'transition-all', 'duration-1000');
      setTimeout(() => {
        policiesRef.current?.classList.remove('ring-4', 'ring-primary');
      }, 3000);
    }
  }, [location.search]);

  useEffect(() => {
    const modelContext = window.navigator.modelContext;
    if (modelContext) {
      modelContext.registerTool({
        name: 'start_booking',
        description: `Navigate to the booking form to reserve a room at ${hotel.name}.`,
        execute: () => {
          navigate('/book/' + hotel.id);
          return { success: true, message: `Navigated to booking form for ${hotel.name}` };
        }
      });
      return () => {
        modelContext.unregisterTool('start_booking');
      };
    }
  }, [hotel, navigate]);

  return (
    <main className="pt-24 pb-20 max-w-[1440px] mx-auto px-8 w-full">
      {/* Editorial Header */}
      <header className="mb-14">
        <div className="flex flex-col md:flex-row justify-between items-end gap-6">
          <div>
            <span className="uppercase tracking-[0.2em] text-[0.7rem] font-bold text-on-tertiary-container mb-4 block">{hotel.city}, Japan</span>
            <h1 className="text-5xl md:text-7xl font-headline font-extrabold tracking-tighter text-primary">{hotel.name}</h1>
          </div>
          <div className="flex gap-4 pb-2">
            <button className="flex items-center gap-2 text-sm text-primary font-semibold hover:text-on-tertiary-container transition-colors bg-transparent border-none">
              <span className="material-symbols-outlined text-xl">share</span>
              Share
            </button>
            <button className="flex items-center gap-2 text-sm text-primary font-semibold hover:text-on-tertiary-container transition-colors bg-transparent border-none">
              <span className="material-symbols-outlined text-xl">favorite</span>
              Save
            </button>
          </div>
        </div>
      </header>

      {/* Asymmetric Gallery */}
      <section className="grid grid-cols-12 gap-[1.4rem] mb-20 h-[600px]">
        <div className="col-span-12 md:col-span-8 h-full bg-surface-container overflow-hidden rounded-xl">
          <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQxRN8_hOFnc70kYbgBrmjLNchifXRmYUKYtwuMHkQKqEzYiJJXQT8Oak14-B9uAPjYAa0JyHsXxVg7F4Uia_poQNqjnXkclGEWh90-KYEug0k2V_7uKhD134ApHp2JLOwBUGa2RNrjKafsJa_VL1q_ieTttYX53Xjv8qg8Ma-I1lCcr-3M9UOgQj_Hs0-z5HE7l46uHb5fUsOQa1ZItotouaZCVF3DGIe9E5MdW3j5ncxj2qqd9w0tW_alY4JuXL17YJRyPU8BUQ" />
        </div>
        <div className="hidden md:flex col-span-4 flex-col gap-[1.4rem] h-full">
          <div className="flex-1 bg-surface-container overflow-hidden rounded-xl">
            <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBHsDdC7NJXc_HFy8TT4_8cn6xTsT70qWJ2jlWtx3cry8AL4EtSCRBgT7S82oJ4yUfXTd7eoYJrqoOnjvIK3xS1rQrpyOcl475TSTeHqYw-OvNxqbBjukleVGZWmf_rQsAFffapDOwKcsxSDIuG7bB4IhXmUzkqFPy4lIbcyV8Rz-bTl26wd9sztoRG3wIuvAxJK1joru2saARM97cdsZOtPtfZ6K96N95kC-RVkx3yiT-V4NUZl7WlT8LItwHXMpY5_mw-Kfi3Ir8" />
          </div>
          <div className="flex-1 bg-surface-container overflow-hidden rounded-xl relative">
            <img className="w-full h-full object-cover" src={hotel.imageSrc} />
            <button className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-md text-primary px-4 py-2 rounded-lg font-headline font-bold text-xs shadow-xl border-none">
              +14 Photos
            </button>
          </div>
        </div>
      </section>

      {/* Main Content & Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">

        {/* Content Area */}
        <div className="lg:col-span-8">
          <div className="mb-16">
            <h2 className="text-2xl font-headline font-bold mb-6 text-primary">An Urban Sanctuary</h2>
            <p className="text-lg text-on-surface-variant leading-relaxed mb-8 max-w-2xl">
              {hotel.description || `Experience unparalleled comfort at ${hotel.name}, a masterclass in contemporary luxury.`}
            </p>
          </div>

          {/* Amenities Bento */}
          <div className="mb-20">
            <h3 className="text-sm font-bold uppercase tracking-widest text-on-tertiary-container mb-8">Amenities & Services</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {hotel.amenities.map((am) => (
                <div key={am.label} className="flex flex-col gap-3">
                  <span className="material-symbols-outlined text-3xl text-primary" data-icon={am.icon}>{am.icon}</span>
                  <div>
                    <p className="font-bold text-primary">{am.label}</p>
                    <p className="text-sm text-on-surface-variant max-w-[120px]">{am.filterKey.toUpperCase()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Policies Section */}
          <div ref={policiesRef} className="bg-surface-container-low p-10 rounded-xl mb-20 border-l-4 border-on-tertiary-container">
            <div className="flex items-center gap-4 mb-6">
              <span className="material-symbols-outlined text-on-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
              <h3 className="text-xl font-headline font-bold text-primary">Stay Details & Policies</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">Check-in</p>
                  <p className="text-primary font-medium">3:00 PM</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-1">Check-out</p>
                  <p className="text-primary font-medium">11:00 AM</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Booking Card */}
        <aside className="lg:col-span-4">
          <div className="sticky top-32 bg-surface-container-lowest p-8 rounded-xl shadow-[0_20px_40px_rgba(0,12,30,0.06)]">
            <div className="flex justify-between items-baseline mb-8">
              <div className="flex flex-col">
                <span className="text-sm text-on-surface-variant">Starting from</span>
                <span className="text-4xl font-headline font-extrabold text-primary">
                  ${hotel.price}
                </span>
              </div>
              <span className="text-on-surface-variant text-sm font-medium">/ night</span>
            </div>

            <div className="space-y-6 mb-10">
              <div className="border-b border-outline-variant/20 pb-4 flex justify-between">
                <span className="text-on-surface-variant">Dates</span>
                <span className="text-primary font-semibold">Oct 12 — Oct 15</span>
              </div>
              <div className="border-b border-outline-variant/20 pb-4 flex justify-between">
                <span className="text-on-surface-variant">Guests</span>
                <span className="text-primary font-semibold">2 Adults</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Room Type</span>
                <span className="text-primary font-semibold text-right">Skyline King Studio</span>
              </div>
            </div>

            <div className="bg-primary-container p-6 rounded-lg mb-8">
              <div className="flex justify-between text-on-primary-container mb-2">
                <span>Subtotal</span>
                <span>${hotel.price * 3}</span>
              </div>
              <div className="flex justify-between text-on-primary-container font-bold text-lg mt-4 border-t border-on-primary-container/20 pt-4">
                <span>Total</span>
                <span>${Math.round(hotel.price * 3 * 1.10)}</span>
              </div>
              <p className="text-[0.7rem] text-on-primary-container/60 mt-2">Includes tax and luxury service fees.</p>
            </div>

            <button
              onClick={() => navigate('/book/' + hotel.id)}
              className="w-full bg-primary text-on-primary py-5 rounded-lg font-headline font-bold text-lg hover:bg-slate-900 transition-colors shadow-lg shadow-primary/10"
            >
              Reserve Now
            </button>
          </div>
        </aside>
      </div>

    </main>
  );
}
