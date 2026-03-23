/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Amenity {
  icon: string;
  label: string;
  filterKey: string;
}

export interface Hotel {
  id: string;
  name: string;
  city: string;
  isFeatured: boolean;
  featuredTag?: string;
  rating: number;
  price: number;
  description?: string;
  imageSrc: string;
  amenities: Amenity[];
}

export const hotels: Hotel[] = [
  {
    id: "aurelian",
    name: "The Aurelian Shibuya",
    city: "tokyo",
    isFeatured: true,
    featuredTag: "Premium Selection",
    rating: 4.9,
    price: 242,
    description: "A masterclass in contemporary luxury, floating above the neon pulse of Shibuya. Floor-to-ceiling vistas paired with artisan craftsmanship.",
    imageSrc: "https://lh3.googleusercontent.com/aida-public/AB6AXuBfXYwwOpZRaKOTfBbyFDmeDARySFPFpZi0TDrMQdC6BX0XkVEeKajRgGJdRgqeadQUKlqiSBHlBiauNESucphjipCZqWPoidkgX3kXS_y37ddrgzUZOxeUVYwPth9pt6F7fHCGsIJmixhsotrbVhEWe4aTBVZAIe-sHnSmopSXV69Vy1lMKzYGS8bLw9yPVbnazOtJWAT-_ER1bL_Raqqc2ZA6mzQCIHMmxM-hiPw1O8tJzS9YZCIJAO5pSxYxojQXLh8vJ5Fn9eI",
    amenities: [
      { icon: "fitness_center", label: "Premier Athletic Club", filterKey: "gym" },
      { icon: "spa", label: "Onsen Ritual Spa", filterKey: "spa" },
      { icon: "restaurant", label: "Michelin Star Dining", filterKey: "dining" },
      { icon: "wifi", label: "Fiber Connection", filterKey: "wifi" },
      { icon: "schedule", label: "Late Checkout", filterKey: "late checkout" }
    ]
  },
  {
    id: "metropolis",
    name: "Metropolis Loft Hotel",
    city: "tokyo",
    isFeatured: false,
    rating: 4.6,
    price: 185,
    imageSrc: "https://lh3.googleusercontent.com/aida-public/AB6AXuArVsCK6kcFg6-ZP1ClShYntlb6f1U0bCzJffCUX8ua2nvoiyhBXrh1GUAL9jK8QqF_mmyyV7bxkW3LxWUfPWni6b2s7VmJuB6wnLGiv-6R5C7z6UyEzkxWrYgODvk7IHrXUqwiZq3wFYQY0i3PYgVr_SJJHFJxLSLGATR-YyRQ5Uq6zZiys5BjzlF_esecH3aKu3PkIc2PLc7g23IvUTsYZhDniIVRBgX8NM4W1ALR2FkgxLbV6WElrPkifOC9dNWJF4O6iDw5RQg",
    amenities: [
      { icon: "fitness_center", label: "Gym", filterKey: "gym" },
      { icon: "coffee", label: "Breakfast", filterKey: "breakfast" },
      { icon: "schedule", label: "Late Checkout", filterKey: "late checkout" }
    ]
  },
  {
    id: "zengarden",
    name: "The Zen Garden Shibuya",
    city: "tokyo",
    isFeatured: false,
    rating: 4.8,
    price: 210,
    imageSrc: "https://lh3.googleusercontent.com/aida-public/AB6AXuDlT0djDdsg5jIerE_l8hi2RXJG5Z7KeH4Tx38sM8QIIFiF7EG50WkDwWhmwHsVFvL55HVlVvlMXyhEuZyb398aPFiQnhAmNJLfeuBxEGyhFKtm22WDvBYNr7tmOpeo_m9rLb2g7D39VU-MjTeNyJ0QIR9yMs0YajfZcq0n6mDcABuaQnVknIjlOb--LSfODhcvkLRoi2lW66izgPyh6YRg2ICUW-PXi6c1kSzFlMwBEg7vvTJhRW4n43RtbJv7K3xnxyQ5DRIzp2E",
    amenities: [
      { icon: "fitness_center", label: "Gym", filterKey: "gym" },
      { icon: "local_bar", label: "Rooftop Bar", filterKey: "rooftop bar" },
      { icon: "local_bar", label: "Bar", filterKey: "bar" }
    ]
  },
  {
    id: "crossroads",
    name: "Crossroads Boutique Suites",
    city: "tokyo",
    isFeatured: false,
    rating: 4.4,
    price: 158,
    imageSrc: "https://lh3.googleusercontent.com/aida-public/AB6AXuC92boc248S5MHTDarGjJhNfCIOPtHj2koOu44INPZLWBI5LqH0CLF4lMPN_cfOe1JM0tsR55GlNBWt4cDxIjZA5gxdXyDAOEiwEWArdVTD2MMe9mf7JHmVFAmXifVqKQwBnPQpFIXw3byn9L_ZanS3161U5961QKLjeKEyNvOd4LdDSD9ImypzLziZfzcQyAwo9xpKmcK3EAoAQ84AsxVDsmkf5YwJwn-k-SJOMp9RoF5HjWj2wFwcJy29wsX2uiOv76a8-eZgiIA",
    amenities: [
      { icon: "fitness_center", label: "Gym", filterKey: "gym" },
      { icon: "dry_cleaning", label: "Laundry", filterKey: "laundry" }
    ]
  },
  {
    id: "manhattan",
    name: "The Manhattan Grand",
    city: "new york",
    isFeatured: true,
    featuredTag: "Luxury Suites",
    rating: 4.8,
    price: 350,
    description: "An iconic skyscraper in the heart of New York. Unmatched service paired with panoramic views of Central Park.",
    imageSrc: "https://lh3.googleusercontent.com/aida-public/AB6AXuBfXYwwOpZRaKOTfBbyFDmeDARySFPFpZi0TDrMQdC6BX0XkVEeKajRgGJdRgqeadQUKlqiSBHlBiauNESucphjipCZqWPoidkgX3kXS_y37ddrgzUZOxeUVYwPth9pt6F7fHCGsIJmixhsotrbVhEWe4aTBVZAIe-sHnSmopSXV69Vy1lMKzYGS8bLw9yPVbnazOtJWAT-_ER1bL_Raqqc2ZA6mzQCIHMmxM-hiPw1O8tJzS9YZCIJAO5pSxYxojQXLh8vJ5Fn9eI",
    amenities: [
      { icon: "fitness_center", label: "Fitness Studio", filterKey: "gym" },
      { icon: "spa", label: "Revive Spa", filterKey: "spa" },
      { icon: "restaurant", label: "Grand Dining", filterKey: "dining" },
      { icon: "wifi", label: "High-Speed WiFi", filterKey: "wifi" }
    ]
  },
  {
    id: "brooklyn",
    name: "Brooklyn Loft Hotel",
    city: "new york",
    isFeatured: false,
    rating: 4.7,
    price: 195,
    imageSrc: "https://lh3.googleusercontent.com/aida-public/AB6AXuDlT0djDdsg5jIerE_l8hi2RXJG5Z7KeH4Tx38sM8QIIFiF7EG50WkDwWhmwHsVFvL55HVlVvlMXyhEuZyb398aPFiQnhAmNJLfeuBxEGyhFKtm22WDvBYNr7tmOpeo_m9rLb2g7D39VU-MjTeNyJ0QIR9yMs0YajfZcq0n6mDcABuaQnVknIjlOb--LSfODhcvkLRoi2lW66izgPyh6YRg2ICUW-PXi6c1kSzFlMwBEg7vvTJhRW4n43RtbJv7K3xnxyQ5DRIzp2E",
    amenities: [
      { icon: "fitness_center", label: "Gym", filterKey: "gym" },
      { icon: "wifi", label: "WiFi", filterKey: "wifi" },
      { icon: "local_bar", label: "Bar", filterKey: "bar" }
    ]
  },
  {
    id: "champs",
    name: "Le Champs-Élysées",
    city: "paris",
    isFeatured: true,
    featuredTag: "Royal Selection",
    rating: 4.9,
    price: 420,
    description: "A historic chateau transformed into a modern masterpiece. Wake up to the Eiffel Tower glittering outside your window.",
    imageSrc: "https://lh3.googleusercontent.com/aida-public/AB6AXuBfXYwwOpZRaKOTfBbyFDmeDARySFPFpZi0TDrMQdC6BX0XkVEeKajRgGJdRgqeadQUKlqiSBHlBiauNESucphjipCZqWPoidkgX3kXS_y37ddrgzUZOxeUVYwPth9pt6F7fHCGsIJmixhsotrbVhEWe4aTBVZAIe-sHnSmopSXV69Vy1lMKzYGS8bLw9yPVbnazOtJWAT-_ER1bL_Raqqc2ZA6mzQCIHMmxM-hiPw1O8tJzS9YZCIJAO5pSxYxojQXLh8vJ5Fn9eI",
    amenities: [
      { icon: "spa", label: "Thermes Spa", filterKey: "spa" },
      { icon: "restaurant", label: "Bistro Élysées", filterKey: "dining" },
      { icon: "wifi", label: "WiFi", filterKey: "wifi" }
    ]
  },
  {
    id: "montmartre",
    name: "Montmartre Suites",
    city: "paris",
    isFeatured: false,
    rating: 4.5,
    price: 160,
    imageSrc: "https://lh3.googleusercontent.com/aida-public/AB6AXuArVsCK6kcFg6-ZP1ClShYntlb6f1U0bCzJffCUX8ua2nvoiyhBXrh1GUAL9jK8QqF_mmyyV7bxkW3LxWUfPWni6b2s7VmJuB6wnLGiv-6R5C7z6UyEzkxWrYgODvk7IHrXUqwiZq3wFYQY0i3PYgVr_SJJHFJxLSLGATR-YyRQ5Uq6zZiys5BjzlF_esecH3aKu3PkIc2PLc7g23IvUTsYZhDniIVRBgX8NM4W1ALR2FkgxLbV6WElrPkifOC9dNWJF4O6iDw5RQg",
    amenities: [
      { icon: "coffee", label: "Breakfast", filterKey: "breakfast" },
      { icon: "wifi", label: "WiFi", filterKey: "wifi" }
    ]
  }
];
