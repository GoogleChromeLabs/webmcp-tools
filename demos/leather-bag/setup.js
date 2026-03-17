const fs = require('fs');
const https = require('https');
const path = require('path');

const images = {
  'hero.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuDqOlGGAmrbTa2cyaUlwCZzumRfnD6628lGXlUml9WykUfyYT5aKOLgYSasd6nk3QELzPeUautuW7vA7b_gLTCm9kHTzu3E-trakRpTt6HkpSCzdbTh6zFS6Ej3OIIkIpNZRJrQkha3rEzaZbIWIF9_kPqIutYGsdy_PlVBEGi5ceWF4oOd28W5MhJCqUffyLb0xXuvR_UauCjGRLinNxm0YY3MTc98aIyXbwPDJYNNcGmDbJI32YAA7E2pVv5PZ9rtmZCEvKeygbo',
  'signature_satchel.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuApQipo3u-gAgsykz8pk3pQ-xmfB4oH222UimsZFZ6Zo5-9dPY4CdNCYckj_rrR4VxIBEXqdXHzuLEYQdMxgUpxsUmxrsowK4aP6W2wOvbmBjDMORbINBB7EPxNJ6gYmlKW9Tw9Cze-roAUCIOxx9SdPCdbDEBUI9LfFYLPTpTYmUwk_i08d_iWkmIfiYcf6SgOnVhk0R7gNJayI-D3r1x2hP3GwKWHRE4rP9BPgAbtUkilHL_logQeYp5GVAvQ7uzYPMGLXxfHSTY',
  'bags_cat.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuASy_d436F9IjLpu-cHmzjJXcxZNCRbxSydK3CVmEpHouVGQOdc_bIzYui5KxgIPAbA05ylrSHkZLTjNLsgFzKjkLl8gsv_QQHTggnbjAt5wF1CSKpWR-7sMhASlMFEDlyHm8rK6CA7liZ1ld2A30Tt3P--WT-LvbwNTsscyUv1GJO32GZuq8eQrw_FyxByWx-xuT-ZGK7cF6C1hDF_ogvfles58ELO7B4Epwc0IywTtlovEY2UQRS3NV3oZpAvALr1Qe4CODVQQXc',
  'accessories_cat.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAIKPJqxOEcP6ZSMvx_SDWcJMJgXcCJKC280Bmt7vTGxLDNcIR-Qw5ZRuCwlxGcAuF_JtTHTDUTOvYwJh0emrRng8HRvHjveOhAiilqYKGq5I-v0Q_f7sbiV0hjmgSc2mRorzfcZcdgdRvfaSOr1hgK5xSY-HXNV3rgRVJOYi00XE0bFDhlMyISKSyDUQkVacrQJZ1L3LacTJEEYNscdmnIQMPd5HnW05QY9K_D16a-uJ0wtwSZRT0gfxfkGpHsyKTmgLpfNL9C5yY',
  'apparel_cat.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuD7k1t-C_QxAARqVhmmqDudzI4p6jfUUsLkVuDXtJH695awOyZ4bV_oPlUcbDq7oqni-efD5I9iZIC-vP1arm6PVfBfDKdZmwONJxW1vjJ3r---7L3cUa-MKFfn-6vwOM0eJpGUY4wOFLFhEikkx1-X5zw2QS56aELGXvD-Z9NnkT_JEqtaaYcw5xrzccncICwBTdpgFXWwWsd4_BPym8VlopKmrrGcjPLp53Dvhji3LJRP0pTiwKzB8T8MrXYrjDTlLYqCwEpqGy4',
  'details_cat.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuBYvndhXbS77cOdG93zOisDtiNuJ7IeiCw4XPQ4bkqDtk0FMPbG8wr7o6RuWn7bsv5N4bTWEZJi0xHwzUoEjCYzvvsEBVUpczfr_DobwXxA9xbFnmH6spHhgik_1T0nisTLl2Ye6jrylgCOmF3jqq5jb5d7YaMEtLMmmWV7BUUwQZ4Z0ImPttObZNf-WwP8Tsuu1MzoUiEpv6E9qM_X9z_ZRPtCKsy9WATVPfi6_z2fy2xBlYU8LQxPUqeX-mS8ikODHPazBhgpT3M',
  'weekender_tote.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuCaEoI_rXLgVjz9OzXfzOND_Ks3EsAd0fzLt4SjbdsKQlTqh18uooP22Hv0UEP-RTynyJMeHo60ZBoin2cjuf1QLiqKVh1vKceGcAPC5CNIL7Dg0H3whsvs6ZG2EwdZKadIWJYdmHmVMz2NujzuFTauzk4WrPbY1wCbBA_22c-sk032Od6ZUHb6pQ3mfTNC-P4EaduJIRbcAw-Ahh3QGRfeJkorzsxCIM_RL-fflatNeSHkiGIHIRmeSVivOrJbdZNg34gZIgYQ6UY',
  'classic_satchel.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuD2CW2H6rECkptd4OBMOcSLc-W7CAH8aHqtwJRF2TxMX-5sgeSTT1D1aePe3SOxzcuHLG404rYceXnWFMDAjI9mnRrWGyHYuEIvWD-jk2tCwTM_qr_58nkhB1pQ4ulsRbIvPKBQEPBn9SgqDzr7OQyMjsoaYcpPasdsSxfpbv6fOMudEcXq6-GkBRYQvxRPJM_X1GL-yXmh1oiXf0eNjeFSjYAcacw3vmE534-6MtdlrIzwWHYMUB50hVdWpVkiVGcztzyzkK_WPf0',
  'artisan_tote.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuBVCT7L8g6mHCna8ZqCpO3G2_gNlvl2LCx3oOf5I9ffkfJjbCB0yvrpKfhEZAlZFLDiwIVLYr6CRpcwQ39Su34ZO1vD9-WGaaPMGAMw7QL8jvKXY34NFJDxJXC5AEA9J7EZb4ergXj9Yz85R087bNSiK9Nwm8gkUfo475Djd2mKzjw078NqCZDPofCjVdVa0avjrC6by96cv1DcdaWhx7VDcCzpzCAv6lcSFzFqQZDkhDHmf2l4qof2zLXPzPMP4qRdxapjOs6ReeI',
  'travel_duffel.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuBp9ROUcePQehLPLWaKLexaqT4yvBj5PHOiFbJ33NvM4UKdqZKUw9NoKP18JttrMq8i_MGgkJNDtm0jIv0MzDMpD9YnJZ4gvh5TvOj2_92796j4oE_8w5B-SI9fQPL7cz9S9iAXQWKNYAxFN66SuqW18vRKNBiA3Rrovx63doZcFoV4Kvbwb7osTtl_HityPnD_rx-18ZGcgDBAWnjz3BU_JVeiNqk3urZ_UTbNk6BM4jV1hrHf-l__rAJWDDFOdjDX-pgZ03k8bok',
  'craftsmanship_reserve.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuD18x3WBszvmAb-EeAX4jGqnWDoIx8essA0SFavqEW5nIIrL-IO9a3DUXKmi0vMGKNIiad-waRe07nuLYLzsa00xWNLs94w-bwaMSnr2RLxVpui4VXeA0AftgFGXqU1Dl6Zf4-1jMG6SKOLss3bi3Bibd2nORWFMIHG_nubDix29x1zEgvD4GjNxX9sWHAbIWCMjaLez3JQZ1L5u0A4fGV0WKxfI50ILgyam9iArS6uYsZVjuRJlpG1uuYKD3m9Oox1DgJUeSSSh64',
  'urban_rucksack.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuBxin9TjrMym7sbIJuATGaCZ0BGiMeiL1k_Isb6aCwbP3SQwIUlZYAQrzTdYJ1AGXilVt8_ApapYkgxee9kokuA8pg6uv1m_NlypQPO4iA1iTYjJr6ek5K71mrPX03aohgAe4v5Cz5sg3E1iUtPRy-bfs6MuFPqYHtbNs8MZjYj5lSF95LTMCpY8b-7-7V0tU5jxMecvBArWaBvh2wwXWnAFvaHAS3tcgsVH_Ww2Wpyh-5Tsrod6aNnWRAzoFXLYW2uQ_yUqnkkEuM',
  'pdp_main.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuD6da2L8x05CvZf6SQPZ_UFOu2uiCSB3q7JFitrps1CB2apItJRHPMStYjgWHvYX8rYdu8k4jRuim12gdAX50tyG5Dj8piVRQvqdTfnZum_Ao4okoGzQw0W7oYHHL1Uu5EXjjMz6bBLPv3BAqKqeLTM2rFZfEqvYa_-cF2Addc1R_48AiOgfxGgptV-t3igmujiQDJ5dAeqSMx3XEDNkAD4hmYRokONQcFeB5mH2rFhc1oPpi_-KzbI7UHaUXdirEgRHUJvkQLxX9U',
  'pdp_thumb1.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuDEsJtkV-oxPdml4r2nGdL1XLIYocmNGZzSUz9s3jVMly9rZIthdlJri-YjNBbBrWvFjxP0k9wSGEVHg39Vf8fW4PMVLNirhdW9l4mTV-AVi6zb0taUf1x5PIo7GXdy83c9yIvUZE8EKv_iuH1RYtTx0RRUOGjmm9Hr7vC2gEk0YGR3NsJ-4tTOjqroUGbrdFPwiNKOcF-59X9LwQhUBgZMm0tfj-AySNYdwDm8A4k6I7oaFpcvSDbOl0ycstfqObAuPi7OdthfXHw',
  'pdp_thumb2.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuD7h0akbdHODyP23Uo7aVSv2E8QUtQEnYhLoRvSpCb6Fb9JM2-Pe0G2TcvIeFP_lpIsQlhqwcU7fPJR3VkuNZ4vCSaDGTIxBQW8KbVU5k30GRzfcl7BnVbEnaPbCUteK8_B0DsQkWD_3dOK8T87-62l0Z9WuqKwrKjhfjYqdGYiS8TRvPiFiAD-XQi11WO09usvxJ3yjjZcWH2yfSYCo7kliIAQVwJ5ibYXpEEzgqwqUkCtvkjbzyM_0E4ZoSeDLXlMekDrBHr96eU',
  'pdp_thumb3.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuC5jzeXOkRKe917zsmOMItwoRCOccBhIuWAl3WETKAP3tgEgV1eT_W03-TuWZwq70aEz2pMY1fiKOOqs2otrZEhJlsq0uN-mOHS1RmtnsQSPg1f_PslsOWaepz9HGn-CVcnQf1TvQ9rmd5g1YTKmHA2hyD31kGTm7EeiGk6-PACZwXTzBvoV2LWrY1MM6TOdqY8vU30xkLki9qziFNuxb4b_JZjyzJAuAaB24ApInJGCJTbSVAX2LdyT3UNY8n3_13u4o5ccMRfTq4',
  'pdp_thumb4.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuBYUY2j9SxlCNcYiRjky571qTVbkuCWWm9P5lD2LIq1P9N5hfxcxTPvWtW-Y5v5ZD4M8Z25bCbY4GNs8VdQtn4fVNVbojbYDnN84oXbWvqL-XRMdiE__s1Yh2S3prMYyzdBJXen4PQh6EdTFr_qwZwydoX0-MCOmzoNbSncHiTuYZg4uhxlZM21Pl3_XcKI73UlBaqYeT_Mk8GKYKXIbs9FoCmQWRbmbuESMdepcP9uoUOS5MWfvFqtEWXdpeI8RG_I3IppH5hLP80',
  'pdp_thumb5.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAcB_4g6VFnU-fjt6LBkprtn7y1VS95MIcQeedk0ERXCB4SckVLAXEP7f7H3rnsfDtHkxdbgVtR70UHZPYyOqyUQOcSU8BMZBXz9O7v29LkwGuLAttGG3rxYqDhE80RjU0puIURZBmpPd6JUC7TWouv6W36yIQG0Dsoi4jdTFCQNyC-bg1a1rto7zKi-nFL76pCId-jAbVTcRgRBVrnguORZBcoV-S52uaReHhV0sFeZEPry00yEIwAYAZ5IFYzctGub-KsHiFlSIE',
  'pdp_workshop.jpg': 'https://lh3.googleusercontent.com/aida-public/AB6AXuByYsquz3W7KbCKRlu4Q9qJp4-FrHzIERYlHXL0lc4sLt37NlDmAQoBsD5eYiF83QF9btW5gBq6Ok5Urouyh1IiGZG0ObLBhF4KOt3cNvmUogRZdmlUd95jF3koy7IXIAcP0JnWzZddf8tcMzs-fA297rxHgCQxjVvHul0fLJu3UULu9yjIdX2NvyVrNDFlq-krjXV9oaJP14YMr5ehJZ378rRzNiZtVzw1e70z3VmCGY4bZU8G0dVzZD6Ueb0gUGiEX2H-K7GQyk0'
};

const imageDir = path.join(__dirname, 'src', 'assets', 'images');

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

async function run() {
  const promises = [];
  for (const [filename, url] of Object.entries(images)) {
    promises.push(download(url, path.join(imageDir, filename)));
  }
  await Promise.all(promises);
  console.log('All images downloaded successfully.');
}

const db = {
  products: [
    {
      id: "prod-1",
      name: "The Signature Satchel",
      slug: "signature-satchel",
      price: 1250.00,
      shortDescription: "Rich Mahogany Calfskin",
      description: "Hand-selected full-grain hides, vegetable tanned and meticulously stitched by master artisans in our historic workshop.",
      images: ["/assets/images/signature_satchel.jpg"],
      colors: [{id: "mahogany", name: "Mahogany", hex: "#4d3423"}],
      finish: "Full Grain",
      rating: 5,
      reviewsCount: 12,
      isNewArrival: false,
      isFeatured: true
    },
    {
      id: "prod-2",
      name: "The Artisan Weekender Tote",
      slug: "artisan-weekender-tote",
      price: 895.00,
      shortDescription: "Our most versatile piece yet",
      description: "Constructed from one continuous piece of water-resistant calfskin leather, designed to age with a unique patina.",
      images: ["/assets/images/weekender_tote.jpg"],
      colors: [{id: "tan", name: "Tan", hex: "#a67c52"}],
      finish: "Vegetable Tanned",
      rating: 4.5,
      reviewsCount: 34,
      isNewArrival: true,
      isFeatured: true
    },
    {
      id: "prod-3",
      name: "Handmade Leather Bag",
      slug: "handmade-leather-bag",
      price: 450.00,
      shortDescription: "Heritage Satchel",
      description: "Every stitch is a testament to our legacy. This bag is handcrafted by master artisans using techniques passed down through generations.",
      images: [
        "/assets/images/pdp_main.jpg",
        "/assets/images/pdp_thumb1.jpg",
        "/assets/images/pdp_thumb2.jpg",
        "/assets/images/pdp_thumb3.jpg",
        "/assets/images/pdp_thumb4.jpg",
        "/assets/images/pdp_thumb5.jpg"
      ],
      colors: [
        {id: "brown", name: "Brown", hex: "#4d3423"},
        {id: "tan", name: "Tan", hex: "#a67c52"},
        {id: "black", name: "Black", hex: "#1a1a1a"}
      ],
      finish: "Full Grain",
      rating: 4.8,
      reviewsCount: 42,
      dimensions: {
        height: "12\"",
        width: "16\"",
        depth: "4\"",
        strapDrop: "18-24\""
      },
      materials: "Premium 100% full-grain leather sourced from Italian tanneries. Solid brass hardware.",
      careInstructions: "Avoid direct sunlight for extended periods. Clean with a damp cloth.",
      isNewArrival: false,
      isFeatured: false
    },
    {
      id: "prod-4",
      name: "Classic Satchel",
      slug: "classic-satchel",
      price: 245.00,
      shortDescription: "Vegetable Tanned Leather",
      description: "A classic satchel perfect for daily use. Features brass hardware and a durable strap.",
      images: ["/assets/images/classic_satchel.jpg"],
      colors: [{id: "brown", name: "Brown", hex: "#5C4033"}, {id: "black", name: "Black", hex: "#1a1a1a"}],
      finish: "Full Grain",
      rating: 4.5,
      reviewsCount: 42,
      isNewArrival: false,
      isFeatured: false
    },
    {
      id: "prod-5",
      name: "Artisan Tote",
      slug: "artisan-tote",
      price: 310.00,
      shortDescription: "Hand-stitched Onyx Black",
      description: "Minimalist large black leather artisan tote bag.",
      images: ["/assets/images/artisan_tote.jpg"],
      colors: [{id: "black", name: "Black", hex: "#1a1a1a"}],
      finish: "Full Grain",
      rating: 5,
      reviewsCount: 18,
      isNewArrival: true,
      isFeatured: false
    },
    {
      id: "prod-6",
      name: "Travel Duffel",
      slug: "travel-duffel",
      price: 595.00,
      shortDescription: "Heirloom Grade Pebbled Leather",
      description: "Large travel duffel bag in aged cognac leather.",
      images: ["/assets/images/travel_duffel.jpg"],
      colors: [{id: "cognac", name: "Cognac", hex: "#8b4513"}],
      finish: "Pebbled",
      rating: 4.2,
      reviewsCount: 89,
      isNewArrival: false,
      isFeatured: false
    },
    {
      id: "prod-7",
      name: "Urban Rucksack",
      slug: "urban-rucksack",
      price: 285.00,
      shortDescription: "Burgundy Chrome-Free Leather",
      description: "Modern leather backpack in deep burgundy.",
      images: ["/assets/images/urban_rucksack.jpg"],
      colors: [{id: "burgundy", name: "Burgundy", hex: "#800020"}],
      finish: "Full Grain",
      rating: 5,
      reviewsCount: 31,
      isNewArrival: false,
      isFeatured: false
    }
  ]
};

fs.writeFileSync(path.join(__dirname, 'src', 'assets', 'data', 'products.json'), JSON.stringify(db, null, 2));
run().catch(console.error);
