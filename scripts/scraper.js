require('dotenv').config();
const mongoose = require('mongoose');
const Deal = require('../models/Deal');
const Store = require('../models/Store');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

// ── Fetch page HTML — keep links intact ──
async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-MA,fr;q=0.9,ar;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();

    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (href && text && href.startsWith('http') && text.length > 3) {
        links.push({ href, text });
      }
    }

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 6000);

    const linksSummary = links
      .filter(l =>
        l.href.includes('/catalog/') ||
        l.href.includes('/product/') ||
        l.href.includes('.html') ||
        l.href.includes('-p-') ||
        l.href.includes('/p/') ||
        l.href.includes('/offre/') ||
        l.href.includes('/promo/')
      )
      .slice(0, 20)
      .map(l => `${l.text} => ${l.href}`)
      .join('\n');

    return { text, links: linksSummary };
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e.message);
    return null;
  }
}

// ── Ask Groq to extract deals ──
async function extractDealsWithAI(pageData, storeName, storeCategory) {
  const prompt = `You are a deals extraction AI. Extract all current deals, discounts, and promo codes from this webpage content from ${storeName}.

Page text:
${pageData.text}

Product links found on page:
${pageData.links || 'None found'}

Return ONLY valid JSON array (no markdown, no explanation):
[
  {
    "title": "Deal title",
    "description": "Short description of the deal",
    "promoCode": "CODE123 or null if no code",
    "discountDisplay": "50% OFF or Free Delivery etc",
    "discountType": "percentage or fixed or bogo or gift",
    "discountValue": 50,
    "originalPrice": "500 MAD or null",
    "tag": "hot or new or verified",
    "icon": "relevant emoji",
    "productUrl": "direct product or deal URL from the links above, must start with https://, or null"
  }
]

Rules:
- Only include real, specific deals with clear discounts
- If no deals found, return empty array []
- Maximum 5 deals
- Keep titles under 60 characters
- Keep descriptions under 120 characters
- productUrl must be a full URL starting with https:// taken from the product links above`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (!data.choices) throw new Error('Groq error: ' + JSON.stringify(data));

    const raw = data.choices[0].message.content;
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('AI extraction error:', e.message);
    return [];
  }
}

// ── Save deals to database ──
async function saveDeals(deals, store, sourceUrl) {
  let saved = 0;

  // Detect category from URL context
  function categoryFromUrl(url, storeCategory) {
    if (/mode-femme|mode-homme|fashion|clothing|vetement|robe|chemise/.test(url)) return 'Fashion';
    if (/beaute|sante|parfum|cosmetique|health/.test(url)) return 'Beauty';
    if (/food|restaurant|pizza|burger|grocery|supermarche/.test(url)) return 'Food';
    if (/voyage|travel|flight|hotel|bus/.test(url)) return 'Travel';
    if (/artisan|local|moroccan|hammam/.test(url)) return 'Local';
    return storeCategory; // fallback to store default
  }

  const urlCategory = categoryFromUrl(sourceUrl.toLowerCase(),
    (['Food','Fashion','Electronics','Beauty','Travel','Local'].includes(store.category) ? store.category : 'Other')
  );

  for (const d of deals) {
    try {
      const exists = await Deal.findOne({ title: d.title, store: store._id });
      if (exists) continue;

      const affiliateUrl = (d.productUrl && d.productUrl.startsWith('https://'))
        ? d.productUrl
        : (store.affiliateBaseUrl || store.website || sourceUrl);

      // Smart category: prefer URL context over store default
      let category = urlCategory;
      // Also check title/description keywords
      const text = ((d.title||'') + ' ' + (d.description||'')).toLowerCase();
      if (/shirt|robe|tunique|veste|pantalon|jean|hoodie|capuche|defacto|chaussure/.test(text)) category = 'Fashion';
      else if (/cream|serum|parfum|perfume|makeup|cosmetic|skincare|nivea|lip|baume|shampoo/.test(text)) category = 'Beauty';
      else if (/pizza|burger|food|restaurant|livraison|repas|meal|coffee/.test(text)) category = 'Food';
      else if (/flight|vol|hotel|travel|voyage|avion|bus|train|ticket/.test(text)) category = 'Travel';
      else if (/hammam|artisan|moroccan|handcraft|souk|babouche|tapis|argan/.test(text)) category = 'Local';

      if (!['Food','Fashion','Electronics','Beauty','Travel','Local','Other'].includes(category)) category = 'Other';

      await Deal.create({
        title: d.title,
        description: d.description || 'Great deal from ' + store.name,
        store: store._id,
        category,
        promoCode: d.promoCode || null,
        discountDisplay: d.discountDisplay || 'Deal',
        discountType: d.discountType || 'percentage',
        discountValue: d.discountValue || 0,
        originalPrice: d.originalPrice || null,
        tag: d.tag || 'new',
        icon: d.icon || store.icon || '🏷️',
        affiliateUrl: affiliateUrl,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        aiScore: Math.floor(Math.random() * 20) + 70,
        isActive: true,
        isFeatured: false,
      });

      console.log(`  Saved: ${d.title} [${category}]`);
      saved++;
    } catch (e) {
      console.error(`  Error saving deal:`, e.message);
    }
  }
  return saved;
}

// ── Store metadata ──
const STORE_META = {
  'Jumia Maroc':      { category: 'Electronics', icon: '📦', website: 'https://www.jumia.ma' },
  'Marjane':          { category: 'Food',         icon: '🛒', website: 'https://www.marjane.ma' },
  'Carrefour Maroc':  { category: 'Food',         icon: '🛒', website: 'https://www.carrefour.ma' },
  'LCWAIKIKI Maroc':  { category: 'Fashion',      icon: '👗', website: 'https://www.lcwaikiki.com/fr-MA' },
  'Zara Maroc':       { category: 'Fashion',      icon: '👔', website: 'https://www.zara.com/ma' },
  'Pizza Hut Maroc':  { category: 'Food',         icon: '🍕', website: 'https://www.pizzahut.ma' },
  'Hmall':            { category: 'Electronics',  icon: '📱', website: 'https://www.hmall.ma' },
  'Royal Air Maroc':  { category: 'Travel',       icon: '✈️', website: 'https://www.royalairmaroc.com' },
};

// ── Stores to scrape ──
const STORES_TO_SCRAPE = [
  { name: 'Jumia Maroc', urls: [
    'https://www.jumia.ma/promotions/',
    'https://www.jumia.ma/flash-sales/',
    'https://www.jumia.ma/smartphones/',
    'https://www.jumia.ma/televisions/',
    'https://www.jumia.ma/ordinateurs-portables/',
    'https://www.jumia.ma/mode-femme/',
    'https://www.jumia.ma/mode-homme/',
    'https://www.jumia.ma/beaute-sante/',
    'https://www.jumia.ma/electromenager/',
  ]},
  { name: 'Marjane', urls: ['https://www.marjane.ma/promotions'] },
  { name: 'Carrefour Maroc', urls: ['https://www.carrefour.ma/fr/promotions'] },
  { name: 'LCWAIKIKI Maroc', urls: ['https://www.lcwaikiki.com/fr-MA/MA/campaign'] },
  { name: 'Pizza Hut Maroc', urls: ['https://www.pizzahut.ma/offres'] },
  { name: 'Hmall', urls: ['https://www.hmall.ma/promotions'] },
  { name: 'Royal Air Maroc', urls: ['https://www.royalairmaroc.com/ma-fr/offres-speciales'] },
  { name: 'Zara Maroc', urls: ['https://www.zara.com/ma/fr/woman-special-prices-l1353.html'] },
];

// ── Scrape a single store (no connect/disconnect — uses existing connection) ──
async function scrapeStore(storeName, urls) {
  console.log(`\nScraping ${storeName}...`);

  let store = await Store.findOne({ name: { $regex: storeName, $options: 'i' } });
  if (!store) {
    const meta = STORE_META[storeName] || {};
    store = await Store.create({
      name: storeName,
      category: meta.category || 'Other',
      icon: meta.icon || '🏪',
      website: meta.website || '',
      affiliateBaseUrl: meta.website || '',
      isActive: true,
    });
    console.log(`  Created store: ${storeName}`);
  }

  let totalSaved = 0;
  for (const url of urls) {
    console.log(`  Fetching: ${url}`);
    const pageData = await fetchPage(url);
    if (!pageData) continue;

    const deals = await extractDealsWithAI(pageData, storeName, store.category);
    console.log(`  Extracted ${deals.length} deals`);

    const saved = await saveDeals(deals, store, url);
    totalSaved += saved;
  }

  return totalSaved;
}

// ── scrapeOne: called from admin route (connection already open via server.js) ──
async function scrapeOne(storeName) {
  const storeConfig = STORES_TO_SCRAPE.find(s => s.name.toLowerCase() === storeName.toLowerCase());
  if (!storeConfig) throw new Error('Store not found: ' + storeName);
  // NO connect/disconnect here — Vercel connection is managed by server.js
  const saved = await scrapeStore(storeConfig.name, storeConfig.urls);
  return saved;
}

// ── runScraper: for local/cron use only ──
async function runScraper() {
  console.log('\nDealna Auto Scraper Starting...');
  console.log('Date: ' + new Date().toLocaleString());
  console.log('─────────────────────────────────');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  let totalSaved = 0;
  for (const store of STORES_TO_SCRAPE) {
    try {
      const saved = await scrapeStore(store.name, store.urls);
      totalSaved += saved;
    } catch(e) {
      console.error(`Failed scraping ${store.name}:`, e.message);
    }
  }

  console.log('\n─────────────────────────────────');
  console.log(`Done! ${totalSaved} new deals added`);
  console.log('─────────────────────────────────\n');

  await mongoose.disconnect();
  process.exit(0);
}

module.exports = { runScraper, scrapeOne };