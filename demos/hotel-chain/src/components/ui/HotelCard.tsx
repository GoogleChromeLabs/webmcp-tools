/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Hotel } from '../../data/hotels';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { AmenityBadge } from './AmenityBadge';
import { clsx } from 'clsx';

interface HotelCardProps {
  hotel: Hotel;
  variant?: 'featured' | 'standard';
  className?: string;
}

export function HotelCard({ hotel, variant = 'standard', className }: HotelCardProps) {
  const navigate = useNavigate();

  if (variant === 'featured') {
    return (
      <section 
        className={clsx(
          "group relative overflow-hidden bg-surface-container-lowest rounded-xl shadow-[0_20px_40px_rgba(0,12,30,0.06)] flex flex-col lg:flex-row transition-all duration-500 hover:shadow-xl border border-outline-variant/5 hover:border-outline-variant/20",
          className
        )}
      >
        <div className="lg:w-3/5 h-[400px] lg:h-auto relative overflow-hidden">
          <img 
            alt={hotel.name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
            src={hotel.imageSrc} 
          />
          {hotel.isFeatured && (
            <div className="absolute top-6 left-6 bg-primary text-on-primary px-4 py-1 text-[10px] uppercase font-bold tracking-widest rounded shadow-lg">
              {hotel.featuredTag || 'Featured'}
            </div>
          )}
        </div>
        
        <div className="lg:w-2/5 p-10 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="font-headline text-3xl font-bold text-primary mb-2 line-clamp-1">{hotel.name}</h2>
                <div className="flex items-center gap-1.5 text-tertiary-fixed-dim" aria-label={`Rating: ${hotel.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                  <span className="text-on-surface-variant text-sm font-medium ml-2">({hotel.rating})</span>
                </div>
              </div>
            </div>
            
            <p className="text-on-surface-variant leading-relaxed mb-8 editorial-indent text-[0.95rem] line-clamp-3 italic">
              {hotel.description}
            </p>

            <div className="grid grid-cols-2 gap-y-5 mb-8">
              {hotel.amenities.map(am => (
                <AmenityBadge key={am.label} amenity={am} />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-8 border-t border-outline-variant/10 mt-auto">
            <div className="flex flex-col">
              <span className="text-on-surface-variant text-[10px] uppercase tracking-tighter font-bold mb-1">Starting from</span>
              <div className="text-2xl font-bold text-primary">${hotel.price} <span className="text-xs font-normal text-on-surface-variant">/ night</span></div>
            </div>
            <Button onClick={() => navigate('/hotel/' + hotel.id)}>
              View Experience
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <article 
      onClick={() => navigate('/hotel/' + hotel.id)} 
      className={clsx(
        "bg-surface-container-lowest rounded-xl overflow-hidden flex flex-col group border border-transparent hover:border-outline-variant/20 transition-all cursor-pointer shadow-sm hover:shadow-lg",
        className
      )}
    >
      <div className="h-64 relative overflow-hidden">
        <img 
          alt={hotel.name} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
          src={hotel.imageSrc} 
        />
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded text-[10px] font-bold text-primary shadow-sm">
          {hotel.rating} Rating
        </div>
      </div>
      
      <div className="p-6 flex-grow flex flex-col justify-between">
        <div>
          <h3 className="font-headline text-xl font-bold text-primary mb-3 line-clamp-1">{hotel.name}</h3>
          <div className="flex flex-wrap items-center gap-4 text-[0.7rem] uppercase tracking-wider text-outline font-bold mb-8">
            {hotel.amenities.slice(0, 3).map((am, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[1rem] text-on-primary-container" aria-hidden="true">
                  {am.icon}
                </span> 
                {am.label}
              </span>
            ))}
          </div>
        </div>
        
        <div className="flex items-end justify-between pt-4 border-t border-outline-variant/5">
          <div>
            <span className="text-2xl font-bold text-primary font-headline">${hotel.price}</span>
            <span className="text-[10px] text-on-surface-variant block uppercase font-bold tracking-widest mt-0.5">Avg/night</span>
          </div>
          <Button variant="ghost" size="sm">Select Dates</Button>
        </div>
      </div>
    </article>
  );
}
