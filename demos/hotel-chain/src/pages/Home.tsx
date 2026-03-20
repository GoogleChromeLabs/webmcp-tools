import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Home() {
  const navigate = useNavigate();
  const [locationValue, setLocationValue] = useState('');
  const [isLocationFocused, setIsLocationFocused] = useState(false);

  const supportedLocations = ['New York, USA', 'Paris, France', 'Shibuya, Tokyo'];
  const filteredLocations = locationValue
    ? supportedLocations.filter(loc => loc.toLowerCase().includes(locationValue.toLowerCase()))
    : supportedLocations;

  const handleSearch = () => {
    if (locationValue.trim()) {
      navigate('/search?q=' + encodeURIComponent(locationValue.trim()));
    } else {
      navigate('/search?q=');
    }
  };

  return (
    <main className="pt-20 w-full">
      {/* Hero Section */}
      <section className="relative h-[870px] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/60 to-transparent z-10"></div>
        <img alt="Luxury Hotel" className="absolute inset-0 w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCYC8JLUupOkProj1GcGAYcgKVuBIAz5xw5VV_vvDFSH6KWVldO_7pjmBqYvrTMskyw5qXc0CAXphccwh_rrWHOAAylJ721UcPvv2Gz8Q3QhNxeCpP_UuYWY0W8-X7dXpyWE2fild04zIaVoc6Hy3wyJLE9nsC5m_qJHis2MHyXDEAGRUgFGNj7TZAgBXS2tElp4TvHOnbl8ucx4Fy_JOj_vOg6zosZI_FHbbSRdafpeyXcHOfQBovd4fYV8V-5aTJNj6Wfj7iV2vk"/>
        <div className="relative z-20 h-full max-w-[1440px] mx-auto px-8 flex flex-col justify-center">
          <p className="text-on-tertiary-container font-semibold uppercase tracking-[0.2em] mb-4 text-sm font-label">The Modern Concierge</p>
          <h1 className="font-headline text-5xl md:text-7xl font-extrabold text-white leading-[1.1] max-w-3xl tracking-tighter">
            Architecture <br/>of Quiet Luxury.
          </h1>
          {/* Availability Tray / Search Bar */}
          <div className="mt-16 bg-white/80 backdrop-blur-2xl p-2 rounded-xl shadow-2xl max-w-5xl flex flex-col md:flex-row items-center gap-2">
            <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-2 p-2 relative">
              <div className="relative flex flex-col px-4 py-2 border-r border-outline-variant/20">
                <label className="text-[10px] uppercase tracking-widest text-outline font-bold">Location</label>
                <input
                  className="bg-transparent border-none p-0 text-primary font-semibold focus:ring-0 placeholder:text-slate-400"
                  type="text"
                  value={locationValue}
                  onChange={(e) => setLocationValue(e.target.value)}
                  onFocus={() => setIsLocationFocused(true)}
                  onBlur={() => setTimeout(() => setIsLocationFocused(false), 200)}
                  placeholder="e.g. New York"
                />

                {/* Suggestions Dropdown */}
                {isLocationFocused && filteredLocations.length > 0 && (
                  <div className="absolute top-[120%] left-0 w-[120%] bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden z-50">
                    <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-outline font-bold bg-surface-container-low border-b border-outline-variant/10">
                      Suggestions
                    </div>
                    {filteredLocations.map(loc => (
                      <div
                        key={loc}
                        className="px-4 py-3 hover:bg-surface-container-low cursor-pointer text-sm text-primary font-medium transition-colors flex items-center gap-2"
                        onClick={() => {
                          setLocationValue(loc);
                          setIsLocationFocused(false);
                        }}
                      >
                        <span className="material-symbols-outlined text-sm text-on-surface-variant">location_on</span>
                        {loc}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col px-4 py-2 border-r border-outline-variant/20">
                <label className="text-[10px] uppercase tracking-widest text-outline font-bold">Dates</label>
                <input className="bg-transparent border-none p-0 text-primary font-semibold focus:ring-0" type="text" defaultValue="Jun 12-15"/>
              </div>
              <div className="flex flex-col px-4 py-2">
                <label className="text-[10px] uppercase tracking-widest text-outline font-bold">Guests</label>
                <input className="bg-transparent border-none p-0 text-primary font-semibold focus:ring-0" type="text" defaultValue="2 Adults"/>
              </div>
            </div>
            <button onClick={handleSearch} className="w-full md:w-auto bg-primary text-on-primary px-12 py-5 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined" data-icon="search">search</span>
              Check Availability
            </button>
          </div>
        </div>
      </section>
      
      {/* Featured Destinations */}
      <section className="py-24 bg-surface w-full">
        <div className="max-w-[1440px] mx-auto px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <div className="max-w-xl">
              <p className="text-on-tertiary-container font-semibold uppercase tracking-[0.2em] mb-4 text-sm font-label">Curated Experiences</p>
              <h2 className="font-headline text-4xl font-extrabold text-primary tracking-tight">Destinations of <br/>Inspiration.</h2>
            </div>
            <button className="text-on-tertiary-container font-bold border-b border-on-tertiary-container/30 pb-1 hover:border-on-tertiary-container transition-all">View All Properties</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div onClick={() => navigate('/search')} className="md:col-span-8 group relative aspect-[16/9] overflow-hidden rounded-xl bg-surface-container-low cursor-pointer">
              <img alt="Tokyo" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDZRDBHhrefno74H4tFKMIs6cNckJqmZjWZkr4QMLR_5ypIHKILmGmktogDbf74MYt_-CFCnSZkqwpgJHOtmSjYwCFikxKTtLpHUl0C8RQt2UGkbaMfK5FvKCm1YykYOgIBw8z0XV5egI-P9gyYOWyj-7SV3OZL2zfSVV1TOZmFU8wKC3WUURBBSK3V1ulfpgMx-_lpONv96bEAN2N1uwGxtg1P1L3D5JCv-27zw_QKOOX-sbqkrByxg_FFBKSvXdgrRFE6WPspn6k"/>
              <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent"></div>
              <div className="absolute bottom-8 left-8 text-white">
                <h3 className="font-headline text-3xl font-bold mb-2">Tokyo Metropolitan</h3>
                <p className="text-white/80 font-medium">Urban serenity in the heart of Shibuya</p>
              </div>
            </div>
            <div className="md:col-span-4 group relative aspect-square md:aspect-auto overflow-hidden rounded-xl bg-surface-container-low cursor-pointer">
              <img alt="Maldives" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB8Ji9LJrOz_z1-nsuJIlW2etl1TjlBCHgSvepn7Zaup1J55-1ZppBWldvPETk2t3hP3zR2_4pXwSGUsO1N3F3ppa7sL6agSqZbr0uHlqTQuqLILDcJLFyNdLIbOblLKG7XVG08bK_HUjQWFV_0ixFJJ4pn6-gQkW_1ZztGmmbwNQasjM3mZ-PfGit3UruO0C0elnedtrHosM28ogB8nC1PJ2XQNl0aF5GOXA3fucyMB9nDErLDKor6SUGLqTGLZPDop-qUWpLVMV8"/>
              <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent"></div>
              <div className="absolute bottom-8 left-8 text-white">
                <h3 className="font-headline text-2xl font-bold mb-2">Kyoto Retreat</h3>
                <p className="text-white/80 font-medium">Traditional Zen meets modern comfort</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Loyalty Perks */}
      <section className="py-32 bg-surface-container-low overflow-hidden w-full">
        <div className="max-w-[1440px] mx-auto px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-24">
            <div className="relative">
              <div className="aspect-[4/5] rounded-xl overflow-hidden shadow-2xl">
                <img alt="Perks" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCdLvKA0SP_AF82Ii40W5hhvdAV-piKpzi66gw_ErOsfICnEzAq8cjmOlAIgncvcj8CdKpf-UbLGuYMnuu96plqfRs9oR-ewakL8X1JeM5ALkPyvj8PpDOoIkppMqZBUMQosb8Xxewy8wO9t3B-1Fabv85i6F6gyCPvmizljIoq7afMS17qBWp21jikLn6woZrg9-0RI4jFAetIhuCvRjyFzUCYqXDHQKSdPyp7WxPFtZzF8XFQMyGwb-7hHujw66tTYHTEhmFPp5U"/>
              </div>
              <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-white p-8 rounded-xl shadow-xl hidden md:block">
                <p className="text-on-tertiary-container font-bold text-4xl mb-2">15%</p>
                <p className="text-primary font-semibold text-sm leading-relaxed">Exclusive member savings on every direct booking.</p>
              </div>
            </div>
            <div className="editorial-indent">
              <p className="text-on-tertiary-container font-semibold uppercase tracking-[0.2em] mb-6 text-sm font-label">The Atelier Circle</p>
              <h2 className="font-headline text-5xl font-extrabold text-primary mb-12 tracking-tight leading-tight">
                Recognition for the Discerning Traveler.
              </h2>
              <ul className="space-y-6 mb-8 text-left inline-block">
                <li className="flex items-center gap-4 text-secondary">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span>Early access to new properties</span>
                </li>
                <li className="flex items-center gap-4 text-secondary">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span>Complimentary upgrades upon availability</span>
                </li>
                <li className="flex items-center gap-4 text-secondary">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span>Curated local experiences</span>
                </li>
              </ul>

              <div className="mt-16">
                <button onClick={() => navigate('/search')} className="bg-primary text-on-primary px-10 py-4 rounded-lg font-bold tracking-tight hover:bg-primary-container transition-colors">Find a Stay</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Signature Editorial Quote */}
      <section className="py-32 bg-white w-full">
        <div className="max-w-4xl mx-auto px-8 text-center">
          <span className="material-symbols-outlined text-6xl text-tertiary-fixed-dim opacity-40 mb-8" data-icon="format_quote">format_quote</span>
          <blockquote className="font-headline text-3xl md:text-5xl font-extrabold text-primary leading-tight tracking-tighter mb-12 italic">
            "Hospitality is not just a service; it's the art of anticipating the unspoken needs of our guests."
          </blockquote>
          <div className="w-12 h-1 bg-on-tertiary-container mx-auto mb-6"></div>
          <p className="font-label uppercase tracking-widest text-sm text-outline font-bold">L'Atelier Philosophy</p>
        </div>
      </section>
    </main>
  );
}
