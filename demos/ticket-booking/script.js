/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { movies as baseMovies } from './movies.js';

function getISODate(date) {
  return date.toISOString().split('T')[0];
}

const today = new Date();
const movies = baseMovies.map((movie) => {
  const showtimes = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    showtimes.push({
      date: getISODate(date),
      times: movie.showtimes,
    });
  }
  return { ...movie, showtimes };
});

let currentCity = '';
let currentGenre = 'all';
let pendingShowtime = null;
let currentSelectedDate = getISODate(today);

// Elements
const movieGrid = document.getElementById('movie-grid');
const homeView = document.getElementById('home-view');
const detailsView = document.getElementById('details-view');
const locationBtn = document.getElementById('location-btn');
const locationText = document.getElementById('location-text');
const locationModal = document.getElementById('location-modal');
const cityInput = document.getElementById('city-input');
const updateLocationBtn = document.getElementById('update-location-btn');
const clearLocationBtn = document.getElementById('clear-location-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const backBtn = document.getElementById('back-btn');
const genreBtns = document.querySelectorAll('.genre-btn');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3000);
}

function updateStateFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const city = urlParams.get('city') || '';
  const genre = urlParams.get('genre') || 'all';

  currentCity = city;
  currentGenre = genre;

  // Update UI for location
  locationText.textContent = city || 'Select Location';
  cityInput.value = city;

  // Update UI for genre buttons
  genreBtns.forEach((btn) => {
    if (btn.dataset.genre === genre) {
      btn.classList.remove('bg-gray-800', 'text-gray-300');
      btn.classList.add('bg-blue-600', 'text-white');
    } else {
      btn.classList.remove('bg-blue-600', 'text-white');
      btn.classList.add('bg-gray-800', 'text-gray-300');
    }
  });

  // Handle movie details if present in hash
  const hash = window.location.hash;
  if (hash.startsWith('#movie/')) {
    const id = hash.replace('#movie/', '');
    renderMovieDetails(id);
  } else {
    detailsView.classList.add('hidden');
    homeView.classList.remove('hidden');
    document.getElementById('checkout-section').classList.add('hidden');
  }

  renderMovies();
}

function renderMovies() {
  movieGrid.innerHTML = '';
  const filtered = movies.filter((m) => {
    const genreMatch = currentGenre === 'all' || m.genre === currentGenre;
    const locationMatch = !currentCity || m.locations.includes(currentCity);
    return genreMatch && locationMatch;
  });

  const movieCountEl = document.getElementById('movie-count');
  if (movieCountEl) {
    movieCountEl.textContent = `(${filtered.length})`;
  }

  if (filtered.length === 0) {
    movieGrid.innerHTML = `<div class="col-span-full py-20 text-center text-gray-500">No movies found in ${currentCity || 'this area'}.</div>`;
    return;
  }

  filtered.forEach((movie) => {
    const card = document.createElement('div');
    card.className =
      'bg-gray-800 rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition';
    card.onclick = () => showMovieDetails(movie.id);
    card.innerHTML = `
      <img src="${movie.poster}" alt="${movie.title}" class="w-full aspect-[2/3] object-cover">
      <div class="p-3">
        <h3 class="font-bold text-lg leading-tight truncate">${movie.title}</h3>
        <p class="text-sm text-gray-400 capitalize">${movie.genre}</p>
      </div>
    `;
    movieGrid.appendChild(card);
  });
}

function renderMovieDetails(id) {
  const movie = movies.find((m) => m.id === id);
  if (!movie) {
    window.location.hash = '';
    pendingShowtime = null;
    return;
  }

  if (currentCity && !movie.locations.includes(currentCity)) {
    showToast(`${movie.title} is not showing in ${currentCity}.`);
    window.location.hash = '';
    pendingShowtime = null;
    return;
  }

  homeView.classList.add('hidden');
  detailsView.classList.remove('hidden');

  document.getElementById('detail-title').textContent = movie.title;
  document.getElementById('detail-genre').textContent =
    movie.genre.charAt(0).toUpperCase() + movie.genre.slice(1);
  document.getElementById('detail-locations-text').textContent =
    `Playing in: ${movie.locations.join(', ')}`;
  document.getElementById('detail-poster').src = movie.poster;

  const dateSelector = document.getElementById('date-selector');
  dateSelector.innerHTML = '';
  movie.showtimes.forEach((day) => {
    const btn = document.createElement('button');
    btn.className = `w-16 flex-shrink-0 snap-start flex flex-col items-center justify-center py-2 rounded-xl transition ${
      currentSelectedDate === day.date
        ? 'bg-blue-600 text-white shadow-lg'
        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
    }`;
    const dateObj = new Date(day.date + 'T00:00:00');
    const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
    const month = dateObj.toLocaleDateString(undefined, { month: 'short' });
    const dateNum = dateObj.toLocaleDateString(undefined, { day: 'numeric' });

    btn.innerHTML = `<span class="text-xs font-normal uppercase tracking-wider">${weekday}</span><span class="text-lg font-bold leading-none my-1">${dateNum}</span><span class="text-xs font-normal">${month}</span>`;

    btn.onclick = () => {
      currentSelectedDate = day.date;
      renderMovieDetails(id);
    };
    dateSelector.appendChild(btn);
  });

  const showtimeList = document.getElementById('showtime-list');
  showtimeList.innerHTML = '';

  const selectedDay =
    movie.showtimes.find((d) => d.date === currentSelectedDate) || movie.showtimes[0];

  selectedDay.times.forEach((time) => {
    const btn = document.createElement('button');
    btn.className = 'px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 font-medium transition';
    btn.textContent = time;
    btn.onclick = () => initiateCheckout(currentSelectedDate, time);
    showtimeList.appendChild(btn);
  });

  document.getElementById('checkout-section').classList.add('hidden');

  if (pendingShowtime) {
    currentSelectedDate = pendingShowtime.date;
    initiateCheckout(pendingShowtime.date, pendingShowtime.time);
    pendingShowtime = null;
    renderMovieDetails(id); // Re-render to show correct date selected
  }
}

function showMovieDetails(id) {
  window.location.hash = `movie/${id}`;
}

function initiateCheckout(date, time) {
  document.getElementById('checkout-section').classList.remove('hidden');
  const dateObj = new Date(date + 'T00:00:00');
  const label = dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  document.getElementById('checkout-time').textContent = `${label} at ${time}`;
  showToast(`Checkout started for ${label} at ${time}`);
}

// Event Listeners
locationBtn.onclick = () => locationModal.classList.remove('hidden');
closeModalBtn.onclick = () => locationModal.classList.add('hidden');

updateLocationBtn.onclick = () => {
  const city = cityInput.value;
  if (city) {
    setLocation(city);
    locationModal.classList.add('hidden');
  }
};

clearLocationBtn.onclick = () => {
  setLocation('');
  locationModal.classList.add('hidden');
};

backBtn.onclick = () => {
  window.location.hash = '';
};

genreBtns.forEach((btn) => {
  btn.onclick = () => {
    setGenre(btn.dataset.genre);
  };
});

function setLocation(city) {
  const url = new URL(window.location);
  if (city) {
    url.searchParams.set('city', city);
  } else {
    url.searchParams.delete('city');
  }

  // If we are on details view and the movie isn't in this city, go back home
  if (window.location.hash.startsWith('#movie/')) {
    const id = window.location.hash.replace('#movie/', '');
    const movie = movies.find((m) => m.id === id);
    if (movie && city && !movie.locations.includes(city)) {
      url.hash = '';
      showToast(`${movie.title} is not playing in ${city}.`);
    }
  }

  window.history.pushState({}, '', url);
  updateStateFromUrl();
}

function setGenre(genre) {
  const url = new URL(window.location);
  if (genre && genre !== 'all') {
    url.searchParams.set('genre', genre);
  } else {
    url.searchParams.delete('genre');
  }
  window.history.pushState({}, '', url);
  updateStateFromUrl();
}

// Routing
window.addEventListener('hashchange', updateStateFromUrl);
// window.addEventListener('popstate', updateStateFromUrl);

// Initial load
updateStateFromUrl();

// WebMCP Implementation
const modelContext = document.modelContext || navigator.modelContext;
if (modelContext) {
  modelContext.registerTool({
    name: 'update_location',
    description: "Updates the user's location.",
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: "The city to set as the user's location. (e.g. Montpelier, Paris, New York)",
        },
      },
      required: ['city'],
    },
    execute: ({ city }) => {
      if (![...cityInput.options].find((o) => o.value === city)) {
        return { status: 'error', message: `Invalid city value (${city})` };
      }
      setLocation(city);
      return { status: 'success', message: `Location updated to ${city}` };
    },
  });

  modelContext.registerTool({
    name: 'query_content',
    description: 'Filters the movie catalog by a specific genre.',
    inputSchema: {
      type: 'object',
      properties: {
        genre: {
          type: 'string',
          description: 'The genre to filter by (e.g., horror, action, comedy).',
        },
      },
      required: ['genre'],
    },
    execute: (params) => {
      setGenre(params.genre.toLowerCase());
      const filtered = movies
        .filter((m) => m.genre === params.genre.toLowerCase())
        .map((v) => {
          return { id: v.id, title: v.title, locations: v.locations, showtimes: v.showtimes };
        });
      return { status: 'success', results: filtered };
    },
  });

  modelContext.registerTool({
    name: 'select_showtime',
    description: 'Selects a movie and a specific showtime to initiate the checkout process.',
    inputSchema: {
      type: 'object',
      properties: {
        movie_id: {
          type: 'string',
          description: 'The ID of the movie to select.',
        },
        date: {
          type: 'string',
          description: `The date of the show in YYYY-MM-DD format (e.g., '${getISODate(today)}').`,
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        time: {
          type: 'string',
          description: "The start time of the show in 12-hour format with AM/PM (e.g., '8:30 PM').",
          pattern: '^[1-12]:[0-5][0-9] (AM|PM)$',
        },
        tickets: {
          type: 'number',
          description: 'Number of tickets.',
          default: 1,
        },
      },
      required: ['movie_id', 'date', 'time'],
    },
    execute: ({ movie_id, date, time }) => {
      const movie = movies.find((m) => m.id === movie_id);
      if (!movie) {
        return { status: 'error', message: `Invalid movie_id value (${movie_id})` };
      }

      const day = movie.showtimes.find((d) => d.date === date);
      if (!day) {
        return { status: 'error', message: `Invalid date value (${date})` };
      }

      if (!day.times.includes(time)) {
        return { status: 'error', message: `Invalid time value (${time} on ${date})` };
      }

      if (window.location.hash === `#movie/${movie_id}`) {
        currentSelectedDate = date;
        initiateCheckout(date, time);
        renderMovieDetails(movie_id); // Update date selector UI
      } else {
        pendingShowtime = { date, time };
        showMovieDetails(movie_id);
      }

      return {
        status: 'success',
        message: `Selected showtime ${time} on ${date} for "${movie.title}" movie. You can now proceed to checkout.`,
      };
    },
  });
}
