import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Z_INDEX } from '../constants';
import { clsx } from 'clsx';

export default function Home() {
  const navigate = useNavigate();
  const [locationValue, setLocationValue] = useState('');
  const [isLocationFocused, setIsLocationFocused] = useState(false);

  const supportedLocations = useMemo(() => ['New York, USA', 'Paris, France', 'Shibuya, Tokyo'], []);
  
  const filteredLocations = useMemo(() => 
    locationValue
      ? supportedLocations.filter(loc => loc.toLowerCase().includes(locationValue.toLowerCase()))
      : supportedLocations,
    [locationValue, supportedLocations]
  );

  const handleSearch = () => {
    navigate('/search?q=' + encodeURIComponent(locationValue.trim()));
  };

  return (
    <main className="w-full">
      {/* Hero Section */}
      <section className="relative h-[870px] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/60 to-transparent z-10" />
        <img 
          alt="Luxury Hotel Interior" 
          className="absolute inset-0 w-full h-full object-cover" 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCYC8JLUupOkProj1GcGAYcgKVuBIAz5xw5VV_vvDFSH6KWVldO_7pjmBqYvrTMskyw5qXc0CAXphccwh_rrWHOAAylJ721UcPvv2Gz8Q3QhNxeCpP_UuYWY0W8-X7dXpyWE2fild04zIaVoc6Hy3wyJLE9nsC5m_qJHis2MHyXDEAGRUgFGNj7TZAgBXS2tElp4TvHOnbl8ucx4Fy_JOj_vOg6zosZI_FHbbSRdafpeyXcHOfQBovd4fYV8V-5aTJNj6Wfj7iV2vk"
        />
        
        <div className="relative z-20 h-full max-w-[1440px] mx-auto px-8 flex flex-col justify-center">
          <p className="text-on-tertiary-container font-bold uppercase tracking-[0.3em] mb-6 text-xs">The Modern Concierge</p>
          <h1 className="font-headline text-6xl md:text-8xl font-extrabold text-white leading-[0.95] max-w-4xl tracking-tighter mb-16">
            Architecture <br/>of Quiet Luxury.
          </h1>

          {/* Availability Tray / Search Bar */}
          <div className="bg-white/90 backdrop-blur-3xl p-3 rounded-2xl shadow-[0_40px_80px_rgba(0,0,0,0.3)] max-w-5xl w-full flex flex-col md:flex-row items-stretch gap-3 border border-white/20">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-0">
              {/* Location Input */}
              <div className="relative flex flex-col px-6 py-4 border-r border-outline-variant/20 group">
                <label className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1 group-focus-within:text-primary transition-colors">Location</label>
                <input
                  className="bg-transparent border-none p-0 text-primary font-bold text-lg focus:ring-0 placeholder:text-slate-400 placeholder:font-normal"
                  type="text"
                  value={locationValue}
                  onChange={(e) => setLocationValue(e.target.value)}
                  onFocus={() => setIsLocationFocused(true)}
                  onBlur={() => setTimeout(() => setIsLocationFocused(false), 200)}
                  placeholder="Where to?"
                />

                {/* Suggestions Dropdown */}
                {isLocationFocused && (
                  <div 
                    className="absolute top-[110%] left-0 w-full bg-white rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                    style={{ zIndex: Z_INDEX.MODAL }}
                  >
                    <div className="px-5 py-3 text-[10px] uppercase tracking-widest text-outline font-extrabold bg-surface-container-low border-b border-outline-variant/10">
                      Top Destinations
                    </div>
                    {filteredLocations.map(loc => (
                      <button
                        key={loc}
                        className="w-full px-5 py-4 hover:bg-surface-container-low text-left text-sm text-primary font-bold transition-all flex items-center gap-3 border-none bg-transparent hover:pl-7 cursor-pointer"
                        onClick={() => setLocationValue(loc)}
                      >
                        <span className="material-symbols-outlined text-lg text-primary/40">location_on</span>
                        {loc}
                      </button>
                    ))}
                    {filteredLocations.length === 0 && (
                      <div className="px-5 py-4 text-xs text-outline italic">No matching locations found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Date Input */}
              <div className="flex flex-col px-6 py-4 border-r border-outline-variant/20">
                <label className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1">Check-in / Out</label>
                <div className="text-primary font-bold text-lg cursor-default">Jun 12 — 15</div>
              </div>

              {/* Guest Input */}
              <div className="flex flex-col px-6 py-4">
                <label className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1">Guests</label>
                <div className="text-primary font-bold text-lg cursor-default">2 Adults</div>
              </div>
            </div>

            <Button size="lg" onClick={handleSearch} className="px-12 py-6 rounded-xl text-xl tracking-tight shadow-xl shadow-primary/20">
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">search</span>
              Explore Stays
            </Button>
          </div>
        </div>
      </section>
      
      {/* Featured Destinations */}
      <section className="py-32 bg-surface w-full">
        <div className="max-w-[1440px] mx-auto px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8 border-b border-outline-variant/10 pb-12">
            <div className="max-w-2xl">
              <p className="text-on-tertiary-container font-bold uppercase tracking-[0.3em] mb-6 text-xs">Curated Collections</p>
              <h2 className="font-headline text-5xl md:text-6xl font-extrabold text-primary tracking-tighter leading-[1.1]">
                Destinations <br/>of Inspiration.
              </h2>
            </div>
            <Button variant="ghost" icon="arrow_forward">View All Properties</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <DestinationCard 
              className="md:col-span-8 aspect-[16/9]"
              title="Tokyo Metropolitan"
              subtitle="Urban serenity in the heart of Shibuya"
              imgSrc="https://lh3.googleusercontent.com/aida-public/AB6AXuDZRDBHhrefno74H4tFKMIs6cNckJqmZjWZkr4QMLR_5ypIHKILmGmktogDbf74MYt_-CFCnSZkqwpgJHOtmSjYwCFikxKTtLpHUl0C8RQt2UGkbaMfK5FvKCm1YykYOgIBw8z0XV5egI-P9gyYOWyj-7SV3OZL2zfSVV1TOZmFU8wKC3WUURBBSK3V1ulfpgMx-_lpONv96bEAN2N1uwGxtg1P1L3D5JCv-27zw_QKOOX-sbqkrByxg_FFBKSvXdgrRFE6WPspn6k"
              onClick={() => navigate('/search')}
            />
            <DestinationCard 
              className="md:col-span-4 aspect-square md:aspect-auto"
              title="Kyoto Retreat"
              subtitle="Zen meeting modern comfort"
              imgSrc="https://lh3.googleusercontent.com/aida-public/AB6AXuB8Ji9LJrOz_z1-nsuJIlW2etl1TjlBCHgSvepn7Zaup1J55-1ZppBWldvPETk2t3hP3zR2_4pXwSGUsO1N3F3ppa7sL6agSqZbr0uHlqTQuqLILDcJLFyNdLIbOblLKG7XVG08bK_HUjQWFV_0ixFJJ4pn6-gQkW_1ZztGmmbwNQasjM3mZ-PfGit3UruO0C0elnedtrHosM28ogB8nC1PJ2XQNl0aF5GOXA3fucyMB9nDErLDKor6SUGLqTGLZPDop-qUWpLVMV8"
              onClick={() => navigate('/search')}
            />
          </div>
        </div>
      </section>

      {/* Loyalty Perks */}
      <section className="py-40 bg-surface-container-low overflow-hidden w-full relative">
        <div className="absolute top-0 right-0 w-[40%] h-full bg-primary/5 -skew-x-12 translate-x-20" />
        <div className="max-w-[1440px] mx-auto px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-32">
            <div className="relative group">
              <div className="aspect-[4/5] rounded-2xl overflow-hidden shadow-[0_40px_80px_rgba(0,12,30,0.15)] transition-transform duration-700 group-hover:scale-[1.02]">
                <img alt="Loyalty Perks Illustration" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCdLvKA0SP_AF82Ii40W5hhvdAV-piKpzi66gw_ErOsfICnEzAq8cjmOlAIgncvcj8CdKpf-UbLGuYMnuu96plqfRs9oR-ewakL8X1JeM5ALkPyvj8PpDOoIkppMqZBUMQosb8Xxewy8wO9t3B-1Fabv85i6F6gyCPvmizljIoq7afMS17qBWp21jikLn6woZrg9-0RI4jFAetIhuCvRjyFzUCYqXDHQKSdPyp7WxPFtZzF8XFQMyGwb-7hHujw66tTYHTEhmFPp5U"/>
              </div>
              <div className="absolute -bottom-16 -right-16 w-80 h-80 bg-white p-12 rounded-2xl shadow-2xl hidden lg:flex flex-col justify-center animate-in fade-in slide-in-from-bottom-10 duration-1000">
                <p className="font-headline font-extrabold text-primary text-6xl mb-4 tracking-tighter">15%</p>
                <p className="text-secondary font-bold text-lg leading-snug">Exclusive member savings on every direct booking.</p>
              </div>
            </div>
            
            <div className="editorial-indent">
              <p className="text-on-tertiary-container font-bold uppercase tracking-[0.3em] mb-8 text-xs">The Atelier Circle</p>
              <h2 className="font-headline text-6xl font-extrabold text-primary mb-12 tracking-tighter leading-[0.95]">
                Recognition for the Discerning.
              </h2>
              <div className="space-y-10 mb-16">
                <PerkItem icon="verified" text="Early access to new global properties" />
                <PerkItem icon="auto_awesome" text="Complimentary upgrades upon arrival" />
                <PerkItem icon="explore" text="Curated local heritage experiences" />
              </div>

              <Button size="lg" className="px-12" onClick={() => navigate('/search')}>
                Join the Circle
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Signature Editorial Quote */}
      <section className="py-40 bg-white w-full">
        <div className="max-w-5xl mx-auto px-8 text-center flex flex-col items-center">
          <span className="material-symbols-outlined text-8xl text-primary opacity-10 mb-12" aria-hidden="true">format_quote</span>
          <blockquote className="font-headline text-4xl md:text-6xl font-extrabold text-primary leading-[1.1] tracking-tighter mb-16 italic max-w-4xl">
            "Hospitality is not just a service; it's the art of anticipating the unspoken needs of our guests."
          </blockquote>
          <div className="w-24 h-1.5 bg-on-tertiary-container mb-8 rounded-full" />
          <p className="font-bold uppercase tracking-[0.4em] text-xs text-outline">L'Atelier Philosophy</p>
        </div>
      </section>
    </main>
  );
}

function DestinationCard({ title, subtitle, imgSrc, onClick, className }: { title: string; subtitle: string; imgSrc: string; onClick: () => void; className?: string }) {
  return (
    <div 
      onClick={onClick} 
      className={clsx(
        "group relative overflow-hidden rounded-2xl bg-surface-container-low cursor-pointer transition-all duration-500 hover:shadow-2xl",
        className
      )}
    >
      <img alt={title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" src={imgSrc}/>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
      <div className="absolute bottom-10 left-10 text-white transform transition-transform duration-500 group-hover:-translate-y-2">
        <h3 className="font-headline text-4xl font-extrabold mb-3 tracking-tight">{title}</h3>
        <p className="text-white/80 font-bold text-lg">{subtitle}</p>
        <div className="mt-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <span className="text-xs font-bold uppercase tracking-widest">Explore Destination</span>
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </div>
      </div>
    </div>
  );
}

function PerkItem({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-6 group">
      <div className="w-14 h-14 rounded-full bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-all duration-300">
        <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      </div>
      <span className="text-xl font-bold text-secondary group-hover:text-primary transition-colors">{text}</span>
    </div>
  );
}
