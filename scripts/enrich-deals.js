// ── enrich-deals.js ──────────────────────────────────────────
// Enriches all deals in DB with:
//   1. Real product images (5 sources with fallback)
//   2. Real product/search URLs
//
// IMAGE SOURCE PRIORITY:
//   1. Direct store scrape     — real product photo
//   2. Unsplash API search     — 50 req/hour free
//   3. Pexels API search       — 200 req/hour free
//   4. Pixabay API search      — 100 req/hour free
//   5. DuckDuckGo image search — unlimited, no key
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI        = process.env.MONGODB_URI;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_API_KEY     = process.env.PEXELS_API_KEY;
const PIXABAY_API_KEY    = process.env.PIXABAY_API_KEY;

// ── Schemas ───────────────────────────────────────────────────
const dealSchema = new mongoose.Schema({
  title: String, description: String,
  store: mongoose.Schema.Types.ObjectId,
  category: String, imageUrl: String, affiliateUrl: String,
  aiScore: Number, isActive: Boolean, isFeatured: Boolean,
}, { timestamps: true, strict: false });

const storeSchema = new mongoose.Schema({
  name: String, website: String, category: String,
}, { strict: false });

// ── Store scraping configs ────────────────────────────────────
const SCRAPE_CONFIGS = {
  'jumia.ma': {
    searchUrl: (q) => `https://www.jumia.ma/catalog/?q=${q}`,
    imageSelector: '.img-responsive',
    linkSelector: 'a.core',
    baseUrl: 'https://www.jumia.ma',
  },
  'jumia.com.eg': {
    searchUrl: (q) => `https://www.jumia.com.eg/catalog/?q=${q}`,
    imageSelector: '.img-responsive',
    linkSelector: 'a.core',
    baseUrl: 'https://www.jumia.com.eg',
  },
  'noon.com': {
    searchUrl: (q) => `https://www.noon.com/search/?q=${q}`,
    imageSelector: 'img.image',
    linkSelector: 'a[data-qa="product-link"]',
    baseUrl: 'https://www.noon.com',
  },
  'fnac.com': {
    searchUrl: (q) => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${q}`,
    imageSelector: '.Article-imgContainer img',
    linkSelector: '.Article-title a',
    baseUrl: 'https://www.fnac.com',
  },
  'decathlon.ma': {
    searchUrl: (q) => `https://www.decathlon.ma/search?Ntt=${q}`,
    imageSelector: '.product-card img',
    linkSelector: '.product-card a',
    baseUrl: 'https://www.decathlon.ma',
  },
  'marjane.ma': {
    searchUrl: (q) => `https://www.marjane.ma/search?q=${q}`,
    imageSelector: '.product-image img',
    linkSelector: '.product-item a',
    baseUrl: 'https://www.marjane.ma',
  },
};

// ── Stores that block scraping → use image search instead ─────
const BLOCKED_STORES = [
  'amazon', 'zara', 'hm.com', 'h&m', 'asos', 'nike', 'adidas',
  'sephora', 'booking', 'expedia', 'emirates', 'airfrance',
  'bestbuy', 'walmart', 'target', 'apple',
];

function isBlocked(website) {
  if (!website) return true;
  return BLOCKED_STORES.some(b => website.toLowerCase().includes(b));
}

// ── Build keywords from deal title ────────────────────────────
function buildKeywords(title) {
  return title
    .replace(/[%\-–—]/g, ' ')
    .replace(/\b(off|sale|deal|discount|promo|maroc|morocco)\b/gi, '')
    .replace(/\s+/g, ' ').trim()
    .split(' ').filter(w => w.length > 2).slice(0, 5).join(' ');
}

// ── SOURCE 1: Direct store scrape ─────────────────────────────
async function scrapeStoreImage(website, title) {
  if (!website || isBlocked(website)) return null;

  const domain = Object.keys(SCRAPE_CONFIGS).find(d => website.includes(d));
  if (!domain) return null;

  const config = SCRAPE_CONFIGS[domain];
  const keywords = encodeURIComponent(buildKeywords(title));
  const url = config.searchUrl(keywords);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Extract first product image using regex (no cheerio needed)
    const imgMatch = html.match(/data-src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"|src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    const linkMatch = html.match(/href="(\/[^"]*(?:mlp|product|item|p\/)[^"]*?)"/i);

    let imageUrl = null;
    let productUrl = null;

    if (imgMatch) {
      imageUrl = imgMatch[1] || imgMatch[2];
      // Fix relative URLs
      if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
      if (imageUrl && imageUrl.startsWith('/')) imageUrl = config.baseUrl + imageUrl;
      // Filter out tiny images and icons
      if (imageUrl && (imageUrl.includes('icon') || imageUrl.includes('logo') || imageUrl.includes('pixel'))) {
        imageUrl = null;
      }
    }

    if (linkMatch) {
      productUrl = config.baseUrl + linkMatch[1];
    }

    return { imageUrl, productUrl };
  } catch (e) {
    return null;
  }
}

// ── SOURCE 2: Unsplash API ────────────────────────────────────
async function searchUnsplash(query) {
  if (!UNSPLASH_ACCESS_KEY) return null;
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape`,
      {
        headers: { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].urls.regular;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ── SOURCE 3: Pexels API ──────────────────────────────────────
async function searchPexels(query) {
  if (!PEXELS_API_KEY) return null;
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${q}&per_page=1&orientation=landscape`,
      {
        headers: { 'Authorization': PEXELS_API_KEY },
        signal: AbortSignal.timeout(5000),
      }
    );
    const data = await res.json();
    if (data.photos && data.photos.length > 0) {
      return data.photos[0].src.large;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ── SOURCE 4: Pixabay API ─────────────────────────────────────
async function searchPixabay(query) {
  if (!PIXABAY_API_KEY) return null;
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${q}&image_type=photo&per_page=3&min_width=400`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    if (data.hits && data.hits.length > 0) {
      return data.hits[0].webformatURL;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ── SOURCE 5: DuckDuckGo image search ────────────────────────
async function searchDuckDuckGo(query) {
  try {
    const q = encodeURIComponent(query);
    // Get token first
    const tokenRes = await fetch(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000),
    });
    const tokenHtml = await tokenRes.text();
    const tokenMatch = tokenHtml.match(/vqd=([\d-]+)/);
    if (!tokenMatch) return null;

    const vqd = tokenMatch[1];
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${q}&vqd=${vqd}&f=,,,,,&p=1`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://duckduckgo.com/',
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    const imgData = await imgRes.json();
    if (imgData.results && imgData.results.length > 0) {
      return imgData.results[0].image;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ── Main image finder — tries all 5 sources ───────────────────
async function findBestImage(title, category, website) {
  const keywords = buildKeywords(title);

  // SOURCE 1: Direct scrape (only for non-blocked stores)
  if (!isBlocked(website)) {
    const scraped = await scrapeStoreImage(website, title);
    if (scraped && scraped.imageUrl) {
      return { imageUrl: scraped.imageUrl, productUrl: scraped.productUrl, source: 'scrape' };
    }
  }

  // SOURCE 2: Unsplash (product-specific search)
  const unsplash = await searchUnsplash(keywords);
  if (unsplash) return { imageUrl: unsplash, productUrl: null, source: 'unsplash' };

  // SOURCE 3: Pexels
  const pexels = await searchPexels(keywords);
  if (pexels) return { imageUrl: pexels, productUrl: null, source: 'pexels' };

  // SOURCE 4: Pixabay
  const pixabay = await searchPixabay(keywords);
  if (pixabay) return { imageUrl: pixabay, productUrl: null, source: 'pixabay' };

  // SOURCE 5: DuckDuckGo
  const ddg = await searchDuckDuckGo(keywords + ' product');
  if (ddg) return { imageUrl: ddg, productUrl: null, source: 'duckduckgo' };

  return null;
}

// ── Sleep helper ──────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         Dealna Deal Enrichment               ║');
  console.log('║  Images: Scrape → Unsplash → Pexels →        ║');
  console.log('║          Pixabay → DuckDuckGo                ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ MongoDB connected\n');

  const Deal  = mongoose.models.Deal  || mongoose.model('Deal',  dealSchema);
  const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);

  // Get all active deals
  const deals = await Deal.find({ isActive: true }).populate('store', 'name website category');
  console.log(`📦 Found ${deals.length} deals to enrich\n`);

  const report = {
    total: deals.length,
    enriched: 0,
    scrape: 0,
    unsplash: 0,
    pexels: 0,
    pixabay: 0,
    duckduckgo: 0,
    failed: 0,
  };

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    const storeName = deal.store?.name || 'Unknown';
    const website = deal.store?.website || '';
    const category = deal.store?.category || deal.category || '';

    process.stdout.write(`  [${i + 1}/${deals.length}] "${deal.title.slice(0, 45)}"... `);

    try {
      const result = await findBestImage(deal.title, category, website);

      if (result) {
        const update = { imageUrl: result.imageUrl };
        // Only update affiliateUrl if we got a real product URL from scraping
        if (result.productUrl) {
          update.affiliateUrl = result.productUrl;
        }
        await Deal.findByIdAndUpdate(deal._id, update);
        report.enriched++;
        report[result.source]++;
        console.log(`✅ ${result.source}`);
      } else {
        console.log(`⚠️  no image found`);
        report.failed++;
      }
    } catch (e) {
      console.log(`❌ error: ${e.message.slice(0, 50)}`);
      report.failed++;
    }

    // Rate limit pause every 10 deals
    if ((i + 1) % 10 === 0 && i + 1 < deals.length) {
      process.stdout.write('  ⏳ Pausing 3s for rate limits...\n');
      await sleep(3000);
    }

    // Small delay between each deal
    await sleep(300);
  }

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║           Enrichment Complete                ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Total deals:          ${String(report.total).padEnd(22)}║`);
  console.log(`║  Enriched:             ${String(report.enriched).padEnd(22)}║`);
  console.log(`║  From scraping:        ${String(report.scrape).padEnd(22)}║`);
  console.log(`║  From Unsplash:        ${String(report.unsplash).padEnd(22)}║`);
  console.log(`║  From Pexels:          ${String(report.pexels).padEnd(22)}║`);
  console.log(`║  From Pixabay:         ${String(report.pixabay).padEnd(22)}║`);
  console.log(`║  From DuckDuckGo:      ${String(report.duckduckgo).padEnd(22)}║`);
  console.log(`║  Failed:               ${String(report.failed).padEnd(22)}║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});