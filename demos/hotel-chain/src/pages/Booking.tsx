import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { hotels } from '../data/hotels';

export default function Booking() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const hotel = hotels.find(h => h.id === id) || hotels[0];

  const [success, setSuccess] = useState(false);

  const handleConfirm = (e: React.SubmitEvent) => {
    e.preventDefault();

    const nativeEvent = e.nativeEvent as any;
    if (nativeEvent.agentInvoked && nativeEvent.respondWith) {
      nativeEvent.respondWith({ success: true, message: "Reservation confirmed successfully." });
    }

    // Yield to the browser's macrotask queue. 
    // This allows the native 'submit' event to finish bubbling up to the
    // document level before React synchronously destroys the <form> DOM node.
    setTimeout(() => {
      setSuccess(true);
    }, 0);
  };

  if (success) {
    return (
      <main className="pt-32 pb-24 max-w-[1440px] mx-auto px-8 min-h-[70vh] flex flex-col items-center justify-center text-center">
        <span className="material-symbols-outlined text-[120px] text-emerald-600 mb-8" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        <h1 className="font-headline text-5xl font-extrabold text-primary mb-4">Reservation Confirmed</h1>
        <p className="text-secondary mb-8">Your journey to {hotel.name} is secured. We look forward to welcoming you.</p>
        <button onClick={() => navigate('/')} className="text-primary font-bold hover:underline">Return to Home</button>
      </main>
    );
  }

  return (
    <main className="pt-32 pb-24 max-w-[1440px] mx-auto px-8 w-full">
      <div className="mb-16">
        <span className="text-on-tertiary-container font-headline text-xs uppercase tracking-[0.2em] font-bold mb-4 block">Secure Reservation</span>
        <h1 className="font-headline text-5xl font-extrabold tracking-tighter text-primary mb-6">Complete Your Stay</h1>
        <p className="pl-11 text-secondary max-w-2xl leading-relaxed">Refining your experience at <span className="text-primary font-semibold">{hotel.name}</span>. Your journey to {hotel.city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} begins here.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
        {/* Main Form Column */}
        <div className="lg:col-span-7 space-y-16">
          <form id="booking-form" onSubmit={handleConfirm} toolname="complete_booking" tooldescription="Complete the reservation for the selected hotel by providing guest information.">
            {/* Step 1: Contact */}
            <section className="mb-16 bg-white shrink-0">
              <div className="flex items-center gap-4 mb-8">
                <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs font-bold">01</span>
                <h2 className="font-headline text-2xl font-bold tracking-tight">Guest Information</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-10 gap-x-12 pl-11">
                <div className="relative group">
                  <label className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1 block">First Name</label>
                  <input name="firstName" required defaultValue="Jane" toolparamdescription="The first name of the primary guest." className="w-full bg-transparent border-t-0 border-l-0 border-r-0 border-b border-outline-variant focus:border-tertiary-fixed-dim focus:ring-0 px-0 py-2 transition-all placeholder:text-surface-container-highest" placeholder="e.g. Julian" type="text" />
                </div>
                <div className="relative group">
                  <label className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1 block">Last Name</label>
                  <input name="lastName" required defaultValue="Doe" toolparamdescription="The last name of the primary guest." className="w-full bg-transparent border-t-0 border-l-0 border-r-0 border-b border-outline-variant focus:border-tertiary-fixed-dim focus:ring-0 px-0 py-2 transition-all placeholder:text-surface-container-highest" placeholder="e.g. Vane" type="text" />
                </div>
                <div className="md:col-span-2 relative group">
                  <label className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1 block">Email Address</label>
                  <input name="email" required defaultValue="jane.doe@example.com" toolparamdescription="The email address where the reservation confirmation will be sent." className="w-full bg-transparent border-t-0 border-l-0 border-r-0 border-b border-outline-variant focus:border-tertiary-fixed-dim focus:ring-0 px-0 py-2 transition-all placeholder:text-surface-container-highest" placeholder="j.vane@atelier.com" type="email" />
                </div>
              </div>
            </section>

            {/* Step 2: Payment */}
            <section className="mb-16">
              <div className="flex items-center gap-4 mb-8">
                <span className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center text-xs font-bold">02</span>
                <h2 className="font-headline text-2xl font-bold tracking-tight">Payment Method</h2>
              </div>
              <div className="pl-11">
                <div className="bg-surface-container-low p-8 rounded-xl mb-10 border border-outline-variant/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-outlined text-primary text-3xl">credit_card</span>
                      <div>
                        <span className="font-headline font-semibold block text-primary text-lg">Visa ending in •••• XXXX</span>
                        <span className="text-sm text-on-surface-variant mt-1 block">Expires 12/28</span>
                      </div>
                    </div>
                    <span className="bg-tertiary-fixed text-on-tertiary-fixed-variant px-3 py-1 rounded text-xs font-bold uppercase tracking-wider self-start sm:self-auto">This is not a real card number</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Step 3: Review */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <span className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center text-xs font-bold">03</span>
                <h2 className="font-headline text-2xl font-bold tracking-tight">Final Review</h2>
              </div>
              <div className="pl-11 space-y-6">
                <div className="flex items-start gap-4 p-6 bg-tertiary-fixed/30 rounded-lg border border-tertiary-fixed-dim/20 mb-6">
                  <span className="material-symbols-outlined text-on-tertiary-fixed-variant" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  <div>
                    <p className="font-headline font-bold text-sm text-on-tertiary-fixed-variant">L'Atelier Exclusive Benefit</p>
                    <p className="text-sm text-on-tertiary-fixed-variant/80 mt-1">Your reservation includes a guaranteed <span className="font-bold">2 PM late check-out</span>.</p>
                  </div>
                </div>
                <button type="submit" form="booking-form" className="w-full bg-primary text-on-primary py-5 rounded-lg font-headline font-extrabold text-lg tracking-tight shadow-[0_20px_40px_rgba(0,12,30,0.15)] hover:scale-[1.01] active:scale-[0.99] transition-all">
                  Confirm Reservation
                </button>
              </div>
            </section>
          </form>
        </div>

        {/* Sidebar Summary Column */}
        <aside className="lg:col-span-5 sticky top-32">
          <div className="bg-surface-container-lowest p-8 rounded-xl shadow-[0_20px_40px_rgba(0,12,30,0.04)] overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-tertiary-fixed/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>

            <div className="flex gap-6 mb-8">
              <div className="w-24 h-32 rounded-lg overflow-hidden flex-shrink-0">
                <img className="w-full h-full object-cover" src={hotel.imageSrc} />
              </div>
              <div>
                <h3 className="font-headline font-bold text-xl tracking-tight text-primary">{hotel.name}</h3>
                <p className="text-xs text-outline font-semibold uppercase tracking-widest mt-1">
                  {hotel.city === 'tokyo' ? 'Tokyo, Japan' : hotel.city === 'paris' ? 'Paris, France' : 'New York, USA'}
                </p>
                <div className="flex items-center gap-1 mt-3">
                  <span className="material-symbols-outlined text-[14px] text-on-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined text-[14px] text-on-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined text-[14px] text-on-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined text-[14px] text-on-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined text-[14px] text-on-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                </div>
              </div>
            </div>

            <div className="space-y-6 py-8 border-y border-outline-variant/10">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-secondary">Dates</span>
                <span className="text-sm font-bold text-primary">Oct 12 — Oct 15, 2024</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-secondary">Guests</span>
                <span className="text-sm font-bold text-primary">2 Adults</span>
              </div>
              {hotel.amenities.some(a => a.filterKey === 'late checkout') && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-secondary">Late Check-out</span>
                  <span className="text-xs font-bold text-on-tertiary-container bg-tertiary-fixed px-2 py-1 rounded">GIFTED 2 PM</span>
                </div>
              )}
            </div>

            <div className="pt-8 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-secondary">3 Nights</span>
                <span className="text-primary font-medium">${hotel.price * 3}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Taxes & Fees</span>
                <span className="text-primary font-medium">${Math.round(hotel.price * 3 * 0.1)}</span>
              </div>
              <div className="flex justify-between pt-6 border-t border-outline-variant/20 mt-6">
                <span className="font-bold text-primary">Total Amount</span>
                <div className="text-right">
                  <span className="text-primary font-bold text-xl">${Math.round(hotel.price * 3 * 1.1)}</span>
                </div>
                <span className="text-[10px] text-secondary">Prices in USD</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
