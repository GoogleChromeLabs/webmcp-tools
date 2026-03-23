/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { hotels } from '../data/hotels';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useWebMCP } from '../hooks/useWebMCP';
import { clsx } from 'clsx';

export default function HotelDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  const hotel = hotels.find(h => h.id === id) || hotels[0];

  const policiesRef = useRef<HTMLDivElement>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const amenity = searchParams.get('amenity');
    if (amenity) {
      policiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setIsHighlighted(true);
      const timer = setTimeout(() => setIsHighlighted(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [location.search]);

  // Register WebMCP Tool
  useWebMCP([{
    name: 'start_booking',
    description: `Navigate to the booking form to reserve a room at ${hotel.name}.`,
    execute: () => {
      navigate('/book/' + hotel.id);
      return { success: true, message: `Navigated to booking form for ${hotel.name}` };
    }
  }]);

  const images = [
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDQxRN8_hOFnc70kYbgBrmjLNchifXRmYUKYtwuMHkQKqEzYiJJXQT8Oak14-B9uAPjYAa0JyHsXxVg7F4Uia_poQNqjnXkclGEWh90-KYEug0k2V_7uKhD134ApHp2JLOwBUGa2RNrjKafsJa_VL1q_ieTttYX53Xjv8qg8Ma-I1lCcr-3M9UOgQj_Hs0-z5HE7l46uHb5fUsOQa1ZItotouaZCVF3DGIe9E5MdW3j5ncxj2qqd9w0tW_alY4JuXL17YJRyPU8BUQ",
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBHsDdC7NJXc_HFy8TT4_8cn6xTsT70qWJ2jlWtx3cry8AL4EtSCRBgT7S82oJ4yUfXTd7eoYJrqoOnjvIK3xS1rQrpyOcl475TSTeHqYw-OvNxqbBjukleVGZWmf_rQsAFffapDOwKcsxSDIuG7bB4IhXmUzkqFPy4lIbcyV8Rz-bTl26wd9sztoRG3wIuvAxJK1joru2saARM97cdsZOtPtfZ6K96N95kC-RVkx3yiT-V4NUZl7WlT8LItwHXMpY5_mw-Kfi3Ir8"
  ];

  return (
    <main className="pt-24 pb-20 max-w-[1440px] mx-auto px-8 w-full">
      <PageHeader 
        label={`${hotel.city}, Japan`}
        title={hotel.name}
        description={
          <div className="flex gap-4 mt-6">
            <Button variant="outline" size="sm" icon="share">Share</Button>
            <Button variant="outline" size="sm" icon="favorite">Save</Button>
          </div>
        }
      />

      {/* Asymmetric Gallery */}
      <section className="grid grid-cols-12 gap-[1.4rem] mb-20 h-[600px]">
        <div className="col-span-12 md:col-span-8 h-full bg-surface-container overflow-hidden rounded-xl shadow-inner">
          <img alt="Hotel Main" className="w-full h-full object-cover" src={images[0]} />
        </div>
        <div className="hidden md:flex col-span-4 flex-col gap-[1.4rem] h-full">
          <div className="flex-1 bg-surface-container overflow-hidden rounded-xl shadow-inner">
            <img alt="Detail 1" className="w-full h-full object-cover" src={images[1]} />
          </div>
          <div className="flex-1 bg-surface-container overflow-hidden rounded-xl relative shadow-inner">
            <img alt="Detail 2" className="w-full h-full object-cover" src={hotel.imageSrc} />
            <div className="absolute bottom-6 right-6">
              <Button variant="outline" size="sm" className="bg-white/90 backdrop-blur-md border-none shadow-xl">
                +14 Photos
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content & Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
        <div className="lg:col-span-8">
          <section className="mb-20">
            <h2 className="text-3xl font-headline font-bold mb-8 text-primary tracking-tight">An Urban Sanctuary</h2>
            <p className="text-xl text-on-surface-variant leading-relaxed max-w-3xl editorial-indent italic opacity-90">
              {hotel.description || `Experience unparalleled comfort at ${hotel.name}, a masterclass in contemporary luxury.`}
            </p>
          </section>

          {/* Amenities Bento */}
          <section className="mb-20">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-outline mb-10 border-b border-outline-variant/10 pb-4">
              Amenities & Services
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-12 gap-x-8">
              {hotel.amenities.map((am) => (
                <div key={am.label} className="flex flex-col gap-4 group">
                  <span 
                    className="material-symbols-outlined text-4xl text-primary transition-transform group-hover:scale-110 duration-300" 
                    aria-hidden="true"
                  >
                    {am.icon}
                  </span>
                  <div>
                    <p className="font-bold text-primary tracking-tight mb-1">{am.label}</p>
                    <p className="text-[10px] uppercase font-bold text-on-tertiary-container tracking-widest opacity-60">
                      {am.filterKey}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Policies Section */}
          <section 
            ref={policiesRef} 
            className={clsx(
              "bg-surface-container-low p-10 rounded-xl mb-20 border-l-4 border-on-tertiary-container transition-all duration-1000",
              isHighlighted ? "ring-4 ring-primary ring-offset-4 scale-[1.02] shadow-2xl" : "shadow-sm"
            )}
          >
            <div className="flex items-center gap-4 mb-8">
              <span className="material-symbols-outlined text-on-tertiary-container text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
              <h3 className="text-2xl font-headline font-bold text-primary tracking-tight">Stay Details & Policies</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-bold uppercase text-outline tracking-wider mb-2">Check-in</p>
                  <p className="text-primary font-bold text-lg">3:00 PM</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-outline tracking-wider mb-2">Check-out</p>
                  <p className="text-primary font-bold text-lg">11:00 AM</p>
                </div>
              </div>
              <div className="bg-white/50 p-6 rounded-lg border border-outline-variant/10 text-sm text-on-surface-variant leading-relaxed">
                Our team is dedicated to your comfort. Early check-in or late check-out may be requested through the Atelier Concierge.
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar Booking Card */}
        <aside className="lg:col-span-4">
          <div className="sticky top-32 bg-surface-container-lowest p-8 rounded-xl shadow-[0_40px_80px_rgba(0,12,30,0.08)] border border-outline-variant/10">
            <div className="flex justify-between items-baseline mb-10 border-b border-outline-variant/10 pb-6">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1">Starting from</span>
                <span className="text-5xl font-headline font-extrabold text-primary tracking-tighter">
                  ${hotel.price}
                </span>
              </div>
              <span className="text-on-surface-variant text-sm font-medium italic">/ night</span>
            </div>

            <div className="space-y-8 mb-10">
              <div className="flex justify-between items-center group">
                <span className="text-sm font-bold text-outline uppercase tracking-widest">Dates</span>
                <span className="text-primary font-bold border-b border-primary/20 pb-1">Oct 12 — Oct 15</span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-sm font-bold text-outline uppercase tracking-widest">Guests</span>
                <span className="text-primary font-bold border-b border-primary/20 pb-1">2 Adults</span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-sm font-bold text-outline uppercase tracking-widest">Room Type</span>
                <span className="text-primary font-bold text-right border-b border-primary/20 pb-1">Skyline King Studio</span>
              </div>
            </div>

            <div className="bg-primary/5 p-8 rounded-xl mb-10 border border-primary/10">
              <div className="flex justify-between text-on-surface-variant mb-3 font-medium">
                <span>Subtotal (3 Sessions)</span>
                <span className="font-bold text-primary">${hotel.price * 3}</span>
              </div>
              <div className="flex justify-between text-primary font-bold text-xl mt-6 border-t border-primary/10 pt-6">
                <span className="uppercase text-sm tracking-widest">Grand Total</span>
                <span className="text-3xl tracking-tighter">${Math.round(hotel.price * 3 * 1.10)}</span>
              </div>
              <p className="text-[10px] text-outline font-bold mt-4 uppercase tracking-[0.1em]">Includes tax and luxury service fees.</p>
            </div>

            <Button 
              size="full" 
              className="py-6 rounded-xl shadow-xl shadow-primary/20"
              onClick={() => navigate('/book/' + hotel.id)}
            >
              Reserve Experience
            </Button>
          </div>
        </aside>
      </div>
    </main>
  );
}
