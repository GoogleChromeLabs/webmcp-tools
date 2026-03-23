/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx } from 'clsx';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AVAILABLE_AMENITIES, Z_INDEX } from '../constants';
import { hotels } from '../data/hotels';
import { useWebMCP } from '../hooks/useWebMCP';
import { Button } from './ui/Button';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  useWebMCP([
    {
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
    },
    {
      name: 'lookup_amenity',
      description: 'Look up specific amenity or policy details for a hotel',
      inputSchema: {
        type: 'object',
        properties: {
          hotel_id: { type: 'string', description: 'The ID of the hotel' },
          amenity: { type: 'string', enum: AVAILABLE_AMENITIES, description: 'The amenity or policy to look up (e.g. "late checkout")' }
        },
        required: ['hotel_id', 'amenity']
      },
      execute: (input: any) => {
        const formattedAmenity = input.amenity ? input.amenity.replace(/_/g, ' ') : input.amenity;
        navigate(`/hotel/${input.hotel_id}?amenity=${encodeURIComponent(formattedAmenity)}`);
        return { success: true, message: `Navigated to hotel details to show ${formattedAmenity}` };
      }
    },
    {
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
    }
  ]);

  return (
    <div className="min-h-screen flex flex-col items-center bg-white text-primary selection:bg-primary/10 selection:text-primary">
      {/* TopNavBar */}
      <nav 
        className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-outline-variant/10 transition-all duration-300"
        style={{ zIndex: Z_INDEX.NAV }}
      >
        <div className="max-w-[1440px] mx-auto flex justify-between items-center px-8 py-5">
          <div className="flex items-center gap-16">
            <Link 
              to="/" 
              className="text-3xl font-bold tracking-tighter text-primary font-headline hover:opacity-80 transition-opacity"
            >
              L'Atelier
            </Link>
            <div className="hidden md:flex items-center gap-10">
              <NavLink to="/" active={location.pathname === '/'}>Home</NavLink>
              <NavLink to="/search" active={location.pathname.startsWith('/search')}>Hotels</NavLink>
              <NavLink to="/search?q=all" active={false}>Destinations</NavLink>
              <NavLink to="/" active={false}>The Circle</NavLink>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <Button variant="outline" size="sm" className="hidden sm:flex">Sign In</Button>
             <Button size="sm">Book Now</Button>
          </div>
        </div>
      </nav>

      <div className="w-full flex-1">
        <Outlet />
      </div>

      {/* Footer */}
      <footer className="w-full pt-32 pb-16 bg-surface-container-low border-t border-outline-variant/10">
        <div className="max-w-[1440px] mx-auto px-10 flex flex-col lg:flex-row justify-between items-start gap-20">
          <div className="max-w-md">
            <span className="text-2xl font-bold font-headline text-primary mb-8 block tracking-tighter">L'Atelier</span>
            <p className="text-on-surface-variant text-lg leading-relaxed mb-10 editorial-indent opacity-80">
              Crafting extraordinary stays in the world's most evocative destinations. Part of the L'Atelier Hospitality Group.
            </p>
            <div className="flex gap-4">
              <FooterIcon icon="share" />
              <FooterIcon icon="mail" />
              <FooterIcon icon="person" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-16 lg:gap-32">
            <FooterLinkSection title="Discover" links={['Our Story', 'Sustainability', 'Newsroom']} />
            <FooterLinkSection title="Legal" links={['Privacy Policy', 'Terms of Service', 'Cookie Policy']} />
            <FooterLinkSection title="Support" links={['Concierge', 'Safety & Security', 'Contact Us']} />
          </div>
        </div>
        <div className="max-w-[1440px] mx-auto px-10 mt-32 pt-10 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-6">
          <span className="text-outline text-[10px] uppercase tracking-[0.2em] font-bold">
            © 2026 L'Atelier Hospitality Group. Not a real product. All rights reserved.
          </span>
          <div className="flex gap-8">
             <span className="text-[10px] text-outline uppercase font-bold tracking-widest cursor-pointer hover:text-primary transition-colors">Instagram</span>
             <span className="text-[10px] text-outline uppercase font-bold tracking-widest cursor-pointer hover:text-primary transition-colors">LinkedIn</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavLink({ to, children, active }: { to: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link 
      to={to} 
      className={clsx(
        "font-headline tracking-tight text-[1.05rem] transition-all duration-300 relative group",
        active ? "text-primary font-bold" : "text-outline hover:text-primary"
      )}
    >
      {children}
      <span className={clsx(
        "absolute -bottom-1 left-0 h-0.5 bg-primary transition-all duration-300",
        active ? "w-full" : "w-0 group-hover:w-full"
      )} />
    </Link>
  );
}

function FooterIcon({ icon }: { icon: string }) {
  return (
    <div className="w-12 h-12 rounded-full border border-outline-variant/20 flex items-center justify-center text-outline hover:text-primary hover:border-primary/40 hover:bg-white transition-all duration-300 cursor-pointer shadow-sm">
      <span className="material-symbols-outlined text-xl">{icon}</span>
    </div>
  );
}

function FooterLinkSection({ title, links }: { title: string; links: string[] }) {
  return (
    <div className="flex flex-col gap-6">
      <span className="font-bold text-primary font-headline text-sm uppercase tracking-widest">{title}</span>
      <div className="flex flex-col gap-4">
        {links.map(link => (
          <a key={link} className="text-on-surface-variant text-sm hover:text-primary transition-colors duration-200 font-medium" href="#">{link}</a>
        ))}
      </div>
    </div>
  );
}
