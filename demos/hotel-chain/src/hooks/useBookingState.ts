/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';

export interface BookingInfo {
  query: string;
  checkin_date: string;
  nights: number;
  adults: number;
  kids: number;
  pets: number;
}

export function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const DEFAULT_BOOKING_INFO: BookingInfo = {
  query: '',
  checkin_date: getTodayString(),
  nights: 3,
  adults: 1,
  kids: 0,
  pets: 0
};

// Global in-memory store matching useSyncExternalStore signature
let currentBookingInfo: BookingInfo = { ...DEFAULT_BOOKING_INFO };
const listeners = new Set<() => void>();

export const bookingStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return currentBookingInfo;
  },
  update(info: Partial<BookingInfo>) {
    currentBookingInfo = { ...currentBookingInfo, ...info };
    listeners.forEach(listener => listener());
  }
};

// Keep backwards compatibility with getBookingInfo and updateBookingInfo imports
export const getBookingInfo = bookingStore.getSnapshot;
export const updateBookingInfo = bookingStore.update;

export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatHomeDates(checkin_date: string, nights: number): string {
  if (!checkin_date) return 'Select Date';
  const start = parseLocalDate(checkin_date);
  const end = new Date(start);
  end.setDate(start.getDate() + nights);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} — ${endDay}`;
  }
  return `${startMonth} ${startDay} — ${endMonth} ${endDay}`;
}

export function formatDetailsDates(checkin_date: string, nights: number): string {
  if (!checkin_date) return 'Select Date';
  const start = parseLocalDate(checkin_date);
  const end = new Date(start);
  end.setDate(start.getDate() + nights);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const endDay = end.getDate();

  return `${startMonth} ${startDay} — ${endMonth} ${endDay}`;
}

export function formatBookingDates(checkin_date: string, nights: number): string {
  if (!checkin_date) return 'Select Date';
  const start = parseLocalDate(checkin_date);
  const end = new Date(start);
  end.setDate(start.getDate() + nights);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const endDay = end.getDate();
  const year = end.getFullYear();

  return `${startMonth} ${startDay} — ${endMonth} ${endDay}, ${year}`;
}

export function formatGuests(adults: number, kids: number, pets: number): string {
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} ${adults === 1 ? 'Adult' : 'Adults'}`);
  if (kids > 0) parts.push(`${kids} ${kids === 1 ? 'Kid' : 'Kids'}`);
  if (pets > 0) parts.push(`${pets} ${pets === 1 ? 'Pet' : 'Pets'}`);
  return parts.join(', ') || '1 Adult';
}

export function useBookingState() {
  const bookingInfo = useSyncExternalStore(
    bookingStore.subscribe,
    bookingStore.getSnapshot
  );

  return {
    bookingInfo,
    updateBookingInfo: bookingStore.update,
    formattedHomeDates: formatHomeDates(bookingInfo.checkin_date, bookingInfo.nights),
    formattedDetailsDates: formatDetailsDates(bookingInfo.checkin_date, bookingInfo.nights),
    formattedBookingDates: formatBookingDates(bookingInfo.checkin_date, bookingInfo.nights),
    formattedGuests: formatGuests(bookingInfo.adults, bookingInfo.kids, bookingInfo.pets)
  };
}
