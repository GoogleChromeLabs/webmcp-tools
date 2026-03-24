/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import SearchResults from './pages/SearchResults';
import HotelDetails from './pages/HotelDetails';
import Booking from './pages/Booking';

const getBasename = () => {
  const path = window.location.pathname;
  // Common deep routes in this app
  const deepRoutes = ['/search', '/hotel', '/book'];
  
  for (const route of deepRoutes) {
    const index = path.indexOf(route);
    if (index !== -1) {
      return path.slice(0, index);
    }
  }

  return path.endsWith('/') ? path.slice(0, -1) : path;
};

function App() {
  return (
    <BrowserRouter basename={getBasename()}>
      <Routes>
        <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<SearchResults />} />
            <Route path="hotel/:id" element={<HotelDetails />} />
          <Route path="book/:id" element={<Booking />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
