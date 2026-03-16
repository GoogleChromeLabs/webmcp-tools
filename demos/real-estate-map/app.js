window.realEstateApp = {
    map: null,
    markers: [],
    infoWindow: null,
    debounceTimer: null,

    initMap: function() {
        // Seattle coordinates
        const seattle = { lat: 47.6062, lng: -122.3321 };
        
        // Ensure google maps is loaded
        if (typeof google === 'undefined' || !google.maps) {
            console.error("Google Maps API failed to load or is missing key.");
            return;
        }

        this.map = new google.maps.Map(document.getElementById('map'), {
            zoom: 12,
            center: seattle,
            styles: [],
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            gestureHandling: 'greedy' // makes it easier to use on desktop/mobile
        });

        this.infoWindow = new google.maps.InfoWindow();
        this.renderMarkers();
        this.renderListings(mockProperties); // Initial render
        
        // Initialize noUiSlider
        const priceSlider = document.getElementById('price-slider');
        if (priceSlider && typeof noUiSlider !== 'undefined') {
            noUiSlider.create(priceSlider, {
                start: [0, 5000000],
                connect: true,
                step: 50000,
                range: {
                    'min': 0,
                    'max': 5000000
                },
                format: {
                    to: function (value) { return Math.round(value); },
                    from: function (value) { return Number(value); }
                }
            });
            
            priceSlider.noUiSlider.on('update', () => {
                this.updatePriceDisplay();
            });
            
            priceSlider.noUiSlider.on('change', () => {
                this.debounceApplyFilters();
            });
        }
    },

    formatPrice: function(price) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
    },

    createMarkerContent: function(property) {
        const div = document.createElement('div');
        div.className = 'bg-white px-3 py-1.5 rounded-full shadow-md border border-slate-200 text-sm font-bold text-slate-800 hover:bg-primary hover:text-white hover:border-primary transition-colors cursor-pointer transform hover:scale-105';
        
        let displayPrice = property.price >= 1000000 
            ? '$' + (property.price / 1000000).toFixed(1) + 'M' 
            : '$' + (property.price / 1000).toFixed(0) + 'k';
            
        div.innerHTML = displayPrice;
        return div;
    },

    renderMarkers: function() {
        // Clear old markers
        this.markers.forEach(marker => marker.setMap(null));
        this.markers = [];

        mockProperties.forEach(property => {
            // Check if google maps AdvancedMarkerElement is available (beta API), otherwise fallback to standard Marker
            // Standard Marker for simplicity and broadest compatibility without needing a map ID
            const marker = new google.maps.Marker({
                position: { lat: property.lat, lng: property.lng },
                map: this.map,
                title: property.title,
                // Custom minimalist icon
                icon: {
                    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
                    scale: 1.5,
                    anchor: new google.maps.Point(12, 24),
                    fillColor: "#1d4ed8",
                    fillOpacity: 1,
                    strokeWeight: 1,
                    strokeColor: "#ffffff",
                }
            });

            // Keep reference to real property data on the marker object
            marker.propertyData = property;

            marker.addListener("click", () => {
                const contentStr = `
                    <div class="w-64 cursor-pointer" onclick="realEstateApp.showAlert('Opening detailed page for ${property.title}')">
                        <img src="${property.image}" alt="${property.title}" class="w-full h-32 object-cover rounded-t-xl mb-2">
                        <div class="px-3 pb-3">
                            <h3 class="font-bold text-lg text-slate-900">${this.formatPrice(property.price)}</h3>
                            <p class="text-xs text-slate-500 font-medium mb-1 truncate">${property.title}</p>
                            <div class="flex items-center gap-3 text-xs text-slate-700 font-semibold mb-2">
                                <span>${property.rooms} rooms</span>
                                <span>${property.bedrooms} bedrooms</span>
                                <span>${property.area} sq ft</span>
                            </div>
                        </div>
                    </div>
                `;
                this.infoWindow.setContent(contentStr);
                this.infoWindow.open({
                    anchor: marker,
                    map: this.map,
                    shouldFocus: false,
                });
            });

            this.markers.push(marker);
        });
    },

    renderListings: function(filteredProperties) {
        const container = document.getElementById('listings-container');
        document.getElementById('results-count').innerText = `${filteredProperties.length} Properties`;
        
        if (filteredProperties.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10 opacity-60">
                    <span class="material-symbols-outlined text-4xl mb-2">search_off</span>
                    <p class="text-sm font-medium">No properties match your current filters.</p>
                </div>
            `;
            return;
        }

        let html = '';
        filteredProperties.forEach((prop, index) => {
            // Construct features pills
            let featuresHtml = '';
            
            if (prop.features.includes("Central AC")) {
                featuresHtml += `<span class="px-2 py-1 rounded-md bg-white text-slate-700 border border-slate-200 shadow-sm text-[10px] font-bold">A/C</span>`;
            }
            if (prop.features.includes("Parking")) {
                featuresHtml += `<span class="px-2 py-1 rounded-md bg-white text-slate-700 border border-slate-200 shadow-sm text-[10px] font-bold">Parking</span>`;
            }
            if (prop.features.includes("Terrace") || prop.features.includes("Balcony")) {
                featuresHtml += `<span class="px-2 py-1 rounded-md bg-white text-slate-700 border border-slate-200 shadow-sm text-[10px] font-bold">Exterior</span>`;
            }

            html += `
                <article class="bg-white border text-sm border-slate-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow cursor-pointer listing-card group" style="animation-delay: ${index * 0.05}s" onclick="realEstateApp.panToProperty(${prop.lat}, ${prop.lng})">
                    <div class="relative h-48 overflow-hidden">
                        <img src="${prop.image}" alt="${prop.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                        <div class="absolute top-3 right-3">
                            <button class="bg-white/90 backdrop-blur rounded-full p-2 text-slate-500 hover:text-red-500 transition-colors shadow-sm focus:outline-none" onclick="event.stopPropagation(); this.classList.toggle('text-red-500'); this.classList.toggle('text-slate-500'); realEstateApp.showAlert('Toggled Favorite')">
                                <span class="material-symbols-outlined text-lg leading-none">favorite</span>
                            </button>
                        </div>
                        <div class="absolute bottom-3 left-3 flex gap-1">
                            ${featuresHtml}
                        </div>
                    </div>
                    <div class="p-4">
                        <div class="flex justify-between items-start mb-1">
                            <h3 class="text-xl font-bold text-slate-900">${this.formatPrice(prop.price)}</h3>
                        </div>
                        <p class="text-sm font-semibold text-primary mb-2">${prop.type} • ${prop.address}</p>
                        
                        <div class="flex items-center gap-4 text-slate-600 mb-3 border-b border-slate-100 pb-3">
                            <div class="flex items-center gap-1">
                                <span class="material-symbols-outlined text-base">meeting_room</span>
                                <span class="text-sm font-semibold tracking-tight">${prop.rooms}</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <span class="material-symbols-outlined text-base">bed</span>
                                <span class="text-sm font-semibold tracking-tight">${prop.bedrooms} BR</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <span class="material-symbols-outlined text-base">square_foot</span>
                                <span class="text-sm font-semibold tracking-tight">${prop.area} sq ft</span>
                            </div>
                        </div>
                        
                        <p class="text-slate-500 text-xs line-clamp-2">${prop.description}</p>
                    </div>
                </article>
            `;
        });
        
        container.innerHTML = html;
    },

    panToProperty: function(lat, lng) {
        if (this.map) {
            this.map.panTo({lat, lng});
            this.map.setZoom(16);
            
            // In mobile view, close the list to show the map
            const mapContainer = document.getElementById('map-container');
            if (mapContainer && window.innerWidth < 768) {
                mapContainer.classList.remove('hidden');
            }
        }
    },

    updatePriceDisplay: function() {
        const slider = document.getElementById('price-slider');
        const displaySpan = document.getElementById('price-display-val');
        
        if (slider && slider.noUiSlider && displaySpan) {
            const values = slider.noUiSlider.get();
            let minVal = parseInt(values[0]);
            let maxVal = parseInt(values[1]);

            if (minVal === 0 && maxVal >= 5000000) {
                displaySpan.innerText = 'Any';
            } else if (minVal === 0) {
                displaySpan.innerText = 'Up to ' + this.formatPrice(maxVal);
            } else if (maxVal >= 5000000) {
                displaySpan.innerText = this.formatPrice(minVal) + ' +';
            } else {
                displaySpan.innerText = this.formatPrice(minVal) + ' - ' + this.formatPrice(maxVal);
            }
        }
    },

    debounceApplyFilters: function() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.applyFilters();
        }, 300);
    },

    applyFilters: function() {
        // Collect standard form inputs
        const types = Array.from(document.querySelectorAll('.type-filter:checked')).map(el => el.value);
        
        let minPrice = 0;
        let maxPrice = Infinity;
        const slider = document.getElementById('price-slider');
        
        if (slider && slider.noUiSlider) {
            const values = slider.noUiSlider.get();
            minPrice = parseInt(values[0]);
            maxPrice = parseInt(values[1]);
            if (maxPrice >= 5000000) maxPrice = Infinity;
        }
        
        const rawMinArea = document.getElementById('filter-minArea').value;
        const minArea = rawMinArea ? parseInt(rawMinArea) : 0;
        
        const bedRadio = document.querySelector('input[name="minBedrooms"]:checked');
        const minBedrooms = bedRadio ? parseInt(bedRadio.value) : 0;
        
        // Collect Advanced form inputs
        const requiredFeatures = Array.from(document.querySelectorAll('.feature-filter:checked')).map(el => el.value);

        // Filter data array
        const filteredProperties = mockProperties.filter(p => {
            // Type
            if (types.length > 0 && !types.includes(p.type)) return false;
            // Price
            if (p.price < minPrice || p.price > maxPrice) return false;
            // Area
            if (p.area < minArea) return false;
            // Beds
            if (p.bedrooms < minBedrooms) return false;
            
            // Features (must have ALL required features)
            if (requiredFeatures.length > 0) {
                const hasAllFeatures = requiredFeatures.every(f => p.features.includes(f));
                if (!hasAllFeatures) return false;
            }

            return true;
        });

        // Update markers visibility
        this.markers.forEach(marker => {
            const p = marker.propertyData;
            const isVisible = filteredProperties.some(fp => fp.id === p.id);
            marker.setVisible(isVisible);
            
            // Close info window if it's attached to a newly hidden marker
            if (!isVisible && this.infoWindow && this.infoWindow.anchor === marker) {
                this.infoWindow.close();
            }
        });

        // Update List
        this.renderListings(filteredProperties);
    },

    clearFilters: function() {
        // Reset inputs
        document.querySelectorAll('.type-filter').forEach(el => el.checked = true);
        
        const slider = document.getElementById('price-slider');
        if (slider && slider.noUiSlider) {
            slider.noUiSlider.set([0, 5000000]);
        }
        
        document.getElementById('filter-minArea').value = '';
        document.querySelectorAll('input[name="minBedrooms"]').forEach(el => {
            el.checked = (el.value === '0');
        });
        
        document.querySelectorAll('.feature-filter:checked').forEach(el => el.checked = false);

        this.updatePriceDisplay();
        this.applyFilters();
        this.showAlert("Filters reset");
    },

    showAlert: function(message) {
        const alert = document.getElementById('alert-banner');
        document.getElementById('alert-text').innerText = message;
        
        alert.classList.remove('translate-y-[-150%]');
        
        setTimeout(() => {
            alert.classList.add('translate-y-[-150%]');
        }, 3000);
    }
};

// Map Mobile Toggle Setup
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('mobile-map-toggle');
    if(btn) {
        btn.addEventListener('click', () => {
            const mapContainer = document.getElementById('map-container');
            mapContainer.classList.remove('hidden');
        });
    }

    // Handle URL parameters for routing from landing page
    const params = new URLSearchParams(window.location.search);
    const locationQuery = params.get('location');
    if (locationQuery) {
        // Just for visual feedback since our mock data is statically Paris
        setTimeout(() => {
            window.realEstateApp.showAlert(`Showing matches for: ${locationQuery}`);
            const resultsCountEl = document.getElementById('results-count');
            if (resultsCountEl) {
                resultsCountEl.innerText = `${mockProperties.length} Properties in ${locationQuery}`;
            }
        }, 1000);
    }
});

