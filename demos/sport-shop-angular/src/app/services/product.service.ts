/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Injectable } from '@angular/core';
import { Product } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private products: Product[] = [
    {
      id: 'nano-banana-glove',
      name: 'Nano Banana Field Master',
      price: 52.99,
      category: 'BASEBALL',
      description: 'Crafted from premium synthetic leather, the Nano Banana Field Master offers pro-grade durability and an instant break-in feel. Master every play with a glove that blends tradition with elite performance.',
      image: 'assets/products/nano-banana-glove.png',
      size: 'child',
      tags: ['youth', 'glove', 'gift', 'under $50', 'nano banana']
    },
    {
      id: 'google-impact-balls',
      name: 'Google Impact Training Balls (12pk)',
      price: 24.00,
      category: 'BASEBALL',
      description: 'Build confidence at the plate with indestructible limited-flight training balls by Google. Engineered for repeated impact, they provide instant feedback without leaving the field.',
      image: 'assets/products/google-impact-balls.png',
      size: 'child',
      tags: ['training', 'gift', 'under $50', 'google']
    },
    {
      id: 'gemini-pro-grip-gloves',
      name: 'Gemini Pro Grip Batting Gloves',
      price: 19.99,
      category: 'BASEBALL',
      description: 'Dominating at the plate requires a superior hold. Gemini Pro Grip gloves feature genuine leather palms and ventilated mesh for maximum comfort and control during every swing.',
      image: 'assets/products/gemini-pro-grip-gloves.png',
      size: 'child',
      tags: ['apparel', 'gift', 'under $50', 'gemini']
    },
    {
      id: 'nano-banana-speed-bat',
      name: 'Nano Banana Speed-Balance Alloy Bat',
      price: 48.50,
      category: 'BASEBALL',
      description: 'Specifically engineered for the youth hitter, this Nano Banana speed-balanced alloy bat delivers explosive energy transfer and a lightweight feel for lightning-fast swings.',
      image: 'assets/products/nano-banana-speed-bat.png',
      size: 'child',
      tags: ['bat', 'gift', 'under $50', 'nano banana']
    },
    // BASKETBALL
    {
      id: 'gemini-basketball',
      name: 'Gemini Evolution Basketball',
      price: 59.99,
      category: 'BASKETBALL',
      description: 'The #1 indoor game ball. Features a micro-fiber composite leather cover and laid-in channels for ultimate grip and consistency with Gemini technology.',
      image: 'assets/products/gemini-basketball.png',
      size: 'adult',
      tags: ['indoor', 'ball', 'gemini']
    },
    {
      id: 'gemini-basketball-junior',
      name: 'Gemini Evolution Basketball Junior',
      price: 44.99,
      category: 'BASKETBALL',
      description: 'The legendary Gemini ball, sized for the next generation. Premium composite leather provides the same elite feel and control for younger players.',
      image: 'assets/products/gemini-basketball-junior.png',
      size: 'child',
      tags: ['indoor', 'ball', 'gemini', 'junior']
    },
    {
      id: 'google-portable-hoop',
      name: 'Google Portable Basketball Hoop',
      price: 249.99,
      category: 'BASKETBALL',
      description: 'Professional grade Google portable hoop with 54-inch acrylic backboard and adjustable height.',
      image: 'assets/products/google-portable-hoop.png',
      size: 'adult',
      tags: ['equipment', 'hoop', 'outdoor', 'google']
    },
    {
      id: 'nano-banana-socks',
      name: 'Nano Banana Elite Crew Socks (3pk)',
      price: 18.00,
      category: 'BASKETBALL',
      description: 'Zonal cushioning from Nano Banana helps absorb impact while you run the court.',
      image: 'assets/products/nano-banana-socks.png',
      size: 'adult',
      tags: ['apparel', 'socks', 'nano banana']
    },
    {
      id: 'nano-banana-socks-youth',
      name: 'Nano Banana Elite Crew Socks Youth (3pk)',
      price: 12.00,
      category: 'BASKETBALL',
      description: 'Nano Banana Elite technology in a youth-optimized fit. Zonal cushioning absorbs impact, while the arch band provides a secure, locked-in feel.',
      image: 'assets/products/nano-banana-socks-youth.png',
      size: 'child',
      tags: ['apparel', 'socks', 'nano banana', 'youth']
    },
    // SOCCER
    {
      id: 'google-mls-pro-ball',
      name: 'Google Pro Match Ball',
      price: 165.00,
      category: 'SOCCER',
      description: 'Google Pro Match certified. Seamless, thermally bonded surface for a more predictable trajectory.',
      image: 'assets/products/google-mls-pro-ball.png',
      size: 'adult',
      tags: ['professional', 'ball', 'google']
    },
    {
      id: 'gemini-ultimate-boots',
      name: 'Gemini Future Ultimate Soccer Boots',
      price: 220.00,
      category: 'SOCCER',
      description: 'The future of playmaking by Gemini. Advanced compression band for ultimate fit and lockdown.',
      image: 'assets/products/gemini-ultimate-boots.png',
      size: 'adult',
      tags: ['shoes', 'cleats', 'gemini']
    },
    {
      id: 'gemini-ultimate-boots-youth',
      name: 'Gemini Future Ultimate Youth Soccer Boots',
      price: 85.00,
      category: 'SOCCER',
      description: 'Future-focused performance for rising stars. Gemini tech ensures a adaptive fit that lets young playmakers move with absolute freedom.',
      image: 'assets/products/gemini-ultimate-boots-youth.png',
      size: 'child',
      tags: ['shoes', 'cleats', 'gemini', 'youth']
    },
    {
      id: 'nano-banana-soccer-trainer',
      name: 'Nano Banana Solo Soccer Trainer',
      price: 14.99,
      category: 'SOCCER',
      description: 'Master your ball control without the chase. Nano Banana hands-free trainer allows for maximum repetitions on touches, passing, and receiving.',
      image: 'assets/products/gemini-ultimate-boots.png',
      size: 'child',
      tags: ['training', 'solo', 'equipment', 'nano banana']
    },
    // RUNNING
    {
      id: 'google-ghost-shoes',
      name: 'Google Ghost Hyper Shoes',
      price: 140.00,
      category: 'RUNNING',
      description: 'Experience a smooth, worry-free run. The Google Ghost features advanced cushioning for an ultra-soft feel that doesn\'t compromise on responsiveness.',
      image: 'assets/products/google-ghost-shoes.png',
      size: 'adult',
      tags: ['shoes', 'neutral', 'running', 'google']
    },
    {
      id: 'google-ghost-shoes-youth',
      name: 'Google Ghost Hyper Shoes Youth',
      price: 65.00,
      category: 'RUNNING',
      description: 'Google performance for youth athletes. Advanced cushioning provides a balanced, soft ride for school, sports, and everything in between.',
      image: 'assets/products/google-ghost-shoes-youth.png',
      size: 'child',
      tags: ['shoes', 'neutral', 'running', 'youth', 'google']
    },
    {
      id: 'gemini-forerunner-watch',
      name: 'Gemini Forerunner Smartwatch',
      price: 349.99,
      category: 'RUNNING',
      description: 'GPS running smartwatch by Gemini with advanced training metrics and recovery insights.',
      image: 'assets/products/gemini-forerunner-watch.png',
      size: 'adult',
      tags: ['watch', 'gps', 'tech', 'gemini']
    },
    {
      id: 'nano-banana-hydration-bottle',
      name: 'Nano Banana Hydration Bottle 21oz',
      price: 34.95,
      category: 'RUNNING',
      description: 'Stay hydrated with the ultimate adventure bottle by Nano Banana. Insulation keeps beverages at the perfect temperature for hours.',
      image: 'assets/products/nano-banana-hydration-bottle.png',
      size: 'adult',
      tags: ['hydration', 'bottle', 'outdoor', 'nano banana']
    },
    // ADDITIONAL BASEBALL
    {
      id: 'google-heart-hide-glove',
      name: 'Google Heart of the Field Glove',
      price: 299.95,
      category: 'BASEBALL',
      description: 'Constructed from world-renowned leather by Google for exceptional performance.',
      image: 'assets/products/google-heart-hide-glove.png',
      size: 'adult',
      tags: ['professional', 'glove', 'leather', 'google']
    },
    {
      id: 'gemini-massive-pop-bat',
      name: 'Gemini Massive Pop Alloy Bat',
      price: 449.95,
      category: 'BASEBALL',
      description: 'Built for the game\'s most powerful hitters with Gemini X14 Alloy Barrel for massive pop.',
      image: 'assets/products/gemini-massive-pop-bat.png',
      size: 'adult',
      tags: ['bbcor', 'bat', 'power', 'gemini']
    },
    {
      id: 'nano-banana-youth-helmet',
      name: 'Nano Banana Youth Helmet',
      price: 249.99,
      category: 'BASEBALL',
      description: 'Durable ABS shell for youth protection with the Nano Banana signature style.',
      image: 'assets/products/nano-banana-youth-helmet.png',
      size: 'child',
      tags: ['protection', 'helmet', 'youth', 'nano banana']
    }
  ];

  getProducts(): Product[] {
    return this.products;
  }

  getProductById(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
  }

  searchProducts(query: string, category?: string, minPrice?: number, maxPrice?: number, size?: string): Product[] {
    const keywords = query.toLowerCase().split(' ').filter(k => k.length > 2);

    return this.products.filter(p => {
      // Text Match
      const searchStr = `${p.name} ${p.category} ${p.description} ${p.tags ? p.tags.join(' ') : ''}`.toLowerCase();
      const matchesQuery = keywords.length === 0 || keywords.some(keyword => searchStr.includes(keyword));

      // Category Match
      const matchesCategory = !category || p.category === category || category === 'ALL';

      // Price Match
      const matchesPrice = (!minPrice || p.price >= minPrice) && (!maxPrice || p.price <= maxPrice);

      // Size Match
      const matchesSize = !size || p.size === size || size === 'ALL';

      return matchesQuery && matchesCategory && matchesPrice && matchesSize;
    });
  }
}
