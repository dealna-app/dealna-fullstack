// ── multi-agent-pipeline.js ──────────────────────────────────
// 10-Agent deal generation + consensus scoring
//
// GENERATION AGENTS (3 — run in parallel):
//   1. Groq         — llama-3.3-70b-versatile
//   2. Gemini       — gemini-1.5-flash'
//   3. OpenRouter   — nvidia/nemotron-3-super-120b-a12b:free
//
// SCORING AGENTS (10 — all score every deal):
//   1. Groq         — llama-3.3-70b-versatile
//   2. Gemini       — gemini-1.5-flash'
//   3. Gemini       — gemini-2.0-flash-exp'
//   4. OpenRouter   — nvidia/nemotron-3-super-120b-a12b:free
//   5. OpenRouter   — nousresearch/hermes-3-llama-3.1-405b:free
//   6. OpenRouter   — meta-llama/llama-3.3-70b-instruct:free
//   7. OpenRouter   — meta-llama/llama-3.2-3b-instruct:free
//   8. OpenRouter   — google/gemma-2-9b-it
//   9. OpenRouter   — mistralai/mistral-7b-instruct-v0.1
//  10. OpenRouter   — microsoft/phi-4
//
// Final aiScore = average of ALL scores received
// Deals below 55 are rejected before saving.
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const mongoose = require('mongoose');

const GROQ_API_KEY       = process.env.GROQ_API_KEY;
const GEMINI_API_KEY     = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MONGODB_URI        = process.env.MONGODB_URI;

// ── Stores ────────────────────────────────────────────────────
const STORES = [
  // MOROCCO
  { name: 'Jumia Maroc',       category: 'Electronics', count: 3, country: 'MA', currency: 'MAD', website: 'https://jumia.ma' },
  { name: 'Glovo Morocco',     category: 'Food',        count: 3, country: 'MA', currency: 'MAD', website: 'https://glovoapp.com/ma' },
  { name: 'Pizza Hut Maroc',   category: 'Food',        count: 3, country: 'MA', currency: 'MAD', website: 'https://pizzahut.ma' },
  { name: 'Marjane',           category: 'Electronics', count: 3, country: 'MA', currency: 'MAD', website: 'https://marjane.ma' },
  { name: 'Zara Morocco',      category: 'Fashion',     count: 3, country: 'MA', currency: 'MAD', website: 'https://zara.com/ma' },
  { name: 'H&M Morocco',       category: 'Fashion',     count: 3, country: 'MA', currency: 'MAD', website: 'https://hm.com/ma' },
  { name: 'Nocibe Maroc',      category: 'Beauty',      count: 3, country: 'MA', currency: 'MAD', website: 'https://nocibe.ma' },
  { name: 'Royal Air Maroc',   category: 'Travel',      count: 3, country: 'MA', currency: 'MAD', website: 'https://royalairmaroc.com' },
  { name: 'Lbricole',          category: 'Local',       count: 3, country: 'MA', currency: 'MAD', website: 'https://lbricole.ma' },
  { name: 'Carrefour Maroc',   category: 'Food',        count: 3, country: 'MA', currency: 'MAD', website: 'https://carrefour.ma' },
  { name: 'Electroplanet',     category: 'Electronics', count: 3, country: 'MA', currency: 'MAD', website: 'https://electroplanet.ma' },
  { name: 'Decathlon Maroc',   category: 'Fashion',     count: 3, country: 'MA', currency: 'MAD', website: 'https://decathlon.ma' },
  { name: 'IKEA Maroc',        category: 'Local',       count: 3, country: 'MA', currency: 'MAD', website: 'https://ikea.com/ma' },
  { name: 'Yves Rocher Maroc', category: 'Beauty',      count: 3, country: 'MA', currency: 'MAD', website: 'https://yves-rocher.ma' },
  { name: 'Inwi',              category: 'Electronics', count: 3, country: 'MA', currency: 'MAD', website: 'https://inwi.ma' },
  { name: 'Burger King Maroc', category: 'Food',        count: 3, country: 'MA', currency: 'MAD', website: 'https://burgerking.ma' },
  { name: 'Atlas Voyages',     category: 'Travel',      count: 3, country: 'MA', currency: 'MAD', website: 'https://atlasvoyages.com' },
  { name: 'Hammam Zwin',       category: 'Local',       count: 3, country: 'MA', currency: 'MAD', website: 'https://hammamzwin.ma' },
  { name: 'Acima Maroc',       category: 'Food',        count: 3, country: 'MA', currency: 'MAD', website: 'https://acima.ma' },
  { name: 'McDonalds Maroc',   category: 'Food',        count: 3, country: 'MA', currency: 'MAD', website: 'https://mcdonalds.ma' },
  // UAE
  { name: 'Noon UAE',          category: 'Electronics', count: 3, country: 'AE', currency: 'AED', website: 'https://noon.com' },
  { name: 'Amazon UAE',        category: 'Electronics', count: 3, country: 'AE', currency: 'AED', website: 'https://amazon.ae' },
  { name: 'Namshi',            category: 'Fashion',     count: 3, country: 'AE', currency: 'AED', website: 'https://namshi.com' },
  { name: 'Emirates Airlines', category: 'Travel',      count: 3, country: 'AE', currency: 'AED', website: 'https://emirates.com' },
  { name: 'Faces UAE',         category: 'Beauty',      count: 3, country: 'AE', currency: 'AED', website: 'https://faces.com' },
  // USA
  { name: 'Amazon',            category: 'Electronics', count: 3, country: 'US', currency: 'USD', website: 'https://amazon.com' },
  { name: 'Nike',              category: 'Fashion',     count: 3, country: 'US', currency: 'USD', website: 'https://nike.com' },
  { name: 'Sephora',           category: 'Beauty',      count: 3, country: 'US', currency: 'USD', website: 'https://sephora.com' },
  { name: 'Expedia',           category: 'Travel',      count: 3, country: 'US', currency: 'USD', website: 'https://expedia.com' },
  { name: 'Best Buy',          category: 'Electronics', count: 3, country: 'US', currency: 'USD', website: 'https://bestbuy.com' },
  { name: 'Adidas',            category: 'Fashion',     count: 3, country: 'US', currency: 'USD', website: 'https://adidas.com' },
  // FRANCE
  { name: 'Fnac',              category: 'Electronics', count: 3, country: 'FR', currency: 'EUR', website: 'https://fnac.com' },
  { name: 'ASOS',              category: 'Fashion',     count: 3, country: 'FR', currency: 'EUR', website: 'https://asos.com' },
  { name: 'Booking.com',       category: 'Travel',      count: 3, country: 'FR', currency: 'EUR', website: 'https://booking.com' },
  { name: 'Cdiscount',         category: 'Electronics', count: 3, country: 'FR', currency: 'EUR', website: 'https://cdiscount.com' },
  { name: 'Darty',             category: 'Electronics', count: 3, country: 'FR', currency: 'EUR', website: 'https://darty.com' },
  // EGYPT
  { name: 'Jumia Egypt',       category: 'Electronics', count: 3, country: 'EG', currency: 'EGP', website: 'https://jumia.com.eg' },
  { name: 'Noon Egypt',        category: 'Electronics', count: 3, country: 'EG', currency: 'EGP', website: 'https://noon.com/egypt-en' },
  { name: 'EgyptAir',          category: 'Travel',      count: 3, country: 'EG', currency: 'EGP', website: 'https://egyptair.com' },
];

// ── Mongoose Schemas ──────────────────────────────────────────
const dealSchema = new mongoose.Schema({
  title: String, description: String, store: mongoose.Schema.Types.ObjectId,
  category: String, promoCode: String, discountDisplay: String,
  discountType: String, discountValue: Number,
  originalPrice: mongoose.Schema.Types.Mixed,
  discountedPrice: mongoose.Schema.Types.Mixed,
  imageUrl: String, currency: String, country: String,
  tag: String, icon: String, affiliateUrl: String,
  expiresAt: Date, aiScore: Number,
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  agentScores: {
    groq: Number, gemini15: Number, gemini20: Number,
    nemotron: Number, deepseek: Number, qwen: Number,
    llama70b: Number, gemma27b: Number, mistral: Number, phi3: Number,
  },
}, { timestamps: true });

const storeSchema = new mongoose.Schema({
  name: String, slug: String, category: String, country: String,
  website: String, affiliateBaseUrl: String,
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false }, icon: String,
}, { timestamps: true });

// ── Search URL builder ────────────────────────────────────────
function buildSearchUrl(website, title) {
  const keywords = title
    .toLowerCase()
    .replace(/[%\-–—]/g, ' ')
    .replace(/\b(off|sale|deal|discount|promo|free|get|buy|new)\b/g, '')
    .replace(/\s+/g, ' ').trim()
    .split(' ').filter(w => w.length > 2).slice(0, 4).join('+');
  const site = website.replace(/\/$/, '');
  if (site.includes('jumia.ma'))      return `${site}/catalog/?q=${keywords}`;
  if (site.includes('jumia.com.eg'))  return `${site}/catalog/?q=${keywords}`;
  if (site.includes('noon.com'))      return `${site}/search/?q=${keywords}`;
  if (site.includes('amazon'))        return `${site}/s?k=${keywords}`;
  if (site.includes('fnac.com'))      return `${site}/SearchResult/ResultList.aspx?Search=${keywords}`;
  if (site.includes('cdiscount.com')) return `${site}/search/10/${keywords}.html`;
  if (site.includes('darty.com'))     return `${site}/nav/recherche?text=${keywords}`;
  if (site.includes('hm.com'))        return `${site}/search?q=${keywords}`;
  if (site.includes('zara.com'))      return `${site}/search?term=${keywords}`;
  if (site.includes('asos.com'))      return `${site}/search?q=${keywords}`;
  if (site.includes('namshi.com'))    return `${site}/search/${keywords}/`;
  if (site.includes('booking.com'))   return `${site}/searchresults.html?ss=${keywords}`;
  if (site.includes('expedia.com'))   return `${site}/Hotel-Search?destination=${keywords}`;
  if (site.includes('sephora'))       return `${site}/search?keyword=${keywords}`;
  if (site.includes('nike.com'))      return `${site}/w?q=${keywords}`;
  if (site.includes('adidas.com'))    return `${site}/search?q=${keywords}`;
  if (site.includes('bestbuy.com'))   return `${site}/site/searchpage.jsp?st=${keywords}`;
  if (site.includes('decathlon'))     return `${site}/search?Ntt=${keywords}`;
  if (site.includes('carrefour'))     return `${site}/search?query=${keywords}`;
  if (site.includes('marjane.ma'))    return `${site}/search?q=${keywords}`;
  if (site.includes('electroplanet')) return `${site}/recherche?s=${keywords}`;
  if (site.includes('emirates.com'))  return `${site}/english/search/?q=${keywords}`;
  if (site.includes('egyptair.com'))  return `${site}/en/offers?q=${keywords}`;
  return `${site}/search?q=${keywords}`;
}

// ── Prompt builders ───────────────────────────────────────────
function buildGenerationPrompt(storeName, category, count, country, currency, website) {
  return `Generate ${count} realistic promotional deals for "${storeName}", a ${category} store. Country: ${country}. Currency: ${currency}. Website: ${website}.

Return ONLY a valid JSON array with exactly ${count} items:
[
  {
    "title": "Specific product name max 60 chars",
    "description": "2-sentence deal description",
    "promoCode": "CODE123 or null",
    "discountDisplay": "30% OFF",
    "discountType": "percentage",
    "discountValue": 30,
    "originalPrice": 500,
    "discountedPrice": 350,
    "currency": "${currency}",
    "country": "${country}",
    "imageUrl": "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&q=80",
    "tag": "hot"
  }
]

Rules:
- title must name a real specific product (e.g. "Samsung Galaxy A55 128GB" not "Great Phone Deal")
- imageUrl must use one of these Unsplash IDs with format https://images.unsplash.com/photo-ID?w=400&q=80:
  electronics: 1498049794561-7780e7231661, 1519389950473-47ba0277781c, 1517336714731-489689fd1ca8
  fashion: 1542291026-7eec264c27ff, 1483985988355-763728e1935b, 1490481651871-ab68de25d43d
  food: 1504674900247-0877df9cc836, 1565299624946-b28f40a0ae38
  beauty: 1596462502278-27bfdc403348, 1522335789203-aabd1fc54bc9
  travel: 1436491865332-7a61a109cc05, 1507525428034-b723cf961d3e
  local: 1555041469-a586c61ea9bc, 1441986300917-64674bd600d8
- discountValue between 10 and 70
- originalPrice and discountedPrice must be realistic numbers for ${country} market
- tag must be: hot, new, or verified
- Return pure JSON only, no markdown, no explanation`;
}

function buildScoringPrompt(deals) {
  const list = deals.map((d, i) =>
    `${i + 1}. "${d.title}" | ${d.category} | ${d.discountDisplay} | Store: ${d.storeName}`
  ).join('\n');
  return `You are a deal quality evaluator. Score each deal from 0 to 100.
Criteria: discount value (30%), product specificity (25%), market appeal (25%), clarity (20%).

${list}

Return ONLY a JSON array of integers in the same order as the input.
Example for 3 deals: [85, 72, 90]
No explanation, no markdown, just the array.`;
}

// ── API callers ───────────────────────────────────────────────
async function callGroq(prompt, maxTokens = 2000, temp = 0.8) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      temperature: temp,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error('Groq: ' + data.error.message);
  return data.choices[0].message.content.trim();
}

async function callGemini(prompt, model = 'gemini-1.5-flash', maxTokens = 2000, temp = 0.8) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: temp, maxOutputTokens: maxTokens },
      }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(`Gemini ${model}: ` + data.error.message);
  return data.candidates[0].content.parts[0].text.trim();
}

async function callOpenRouter(prompt, model, maxTokens = 2000, temp = 0.8) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
      'HTTP-Referer': 'https://dealna.ma',
      'X-Title': 'Dealna Multi-Agent Pipeline',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      temperature: temp,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`OpenRouter ${model}: ` + data.error.message);
  return data.choices[0].message.content.trim();
}

function parseJSON(raw) {
  const clean = raw.replace(/```json|```/g, '').trim();
  const match = clean.match(/(\[[\s\S]*\])/);
  if (!match) throw new Error('No JSON array found in response');
  return JSON.parse(match[1]);
}

// ── Generation agents ─────────────────────────────────────────
async function generateWithGroq(s, cat, count, country, cur, web) {
  return parseJSON(await callGroq(buildGenerationPrompt(s, cat, count, country, cur, web), 2000, 0.8));
}
async function generateWithGemini(s, cat, count, country, cur, web) {
  return parseJSON(await callGemini(buildGenerationPrompt(s, cat, count, country, cur, web), 'gemini-1.5-flash', 2000, 0.8));
}
async function generateWithNemotron(s, cat, count, country, cur, web) {
  return parseJSON(await callOpenRouter(buildGenerationPrompt(s, cat, count, country, cur, web), 'nvidia/nemotron-3-super-120b-a12b:free', 2000, 0.8));
}

// ── 10 Scoring agents ─────────────────────────────────────────
const SCORING_AGENTS = [
  { name: 'groq',     call: (p) => callGroq(p, 300, 0.1) },
  { name: 'gemini15', call: (p) => callGemini(p, 'gemini-1.5-flash', 300, 0.1) },
  { name: 'gemini20', call: (p) => callGemini(p, 'gemini-2.0-flash-exp', 300, 0.1) },
  { name: 'nemotron', call: (p) => callOpenRouter(p, 'nvidia/nemotron-3-super-120b-a12b:free', 300, 0.1) },
  { name: 'hermes405b', call: (p) => callOpenRouter(p, 'nousresearch/hermes-3-llama-3.1-405b:free', 300, 0.1) },
  { name: 'llama33', call: (p) => callOpenRouter(p, 'meta-llama/llama-3.3-70b-instruct:free', 300, 0.1) },
  { name: 'llama32', call: (p) => callOpenRouter(p, 'meta-llama/llama-3.2-3b-instruct:free', 300, 0.1) },
  { name: 'gemma27b', call: (p) => callOpenRouter(p, 'google/gemma-2-9b-it', 300, 0.1) },
  { name: 'mistral', call: (p) => callOpenRouter(p, 'mistralai/mistral-7b-instruct-v0.1', 300, 0.1) },
  { name: 'phi3', call: (p) => callOpenRouter(p, 'microsoft/phi-4', 300, 0.1) },
];

async function scoreWithAllAgents(deals) {
  const prompt = buildScoringPrompt(deals);
  const dealCount = deals.length;

  const results = await Promise.allSettled(
    SCORING_AGENTS.map(agent =>
      agent.call(prompt).then(raw => ({ name: agent.name, scores: parseJSON(raw) }))
    )
  );

  // Collect scores per deal
  const scoresByDeal  = Array.from({ length: dealCount }, () => []);
  const agentScoreMap = Array.from({ length: dealCount }, () => ({}));

  results.forEach((result, idx) => {
    const agentName = SCORING_AGENTS[idx].name;
    if (result.status === 'fulfilled') {
      const { scores } = result.value;
      if (Array.isArray(scores)) {
        scores.forEach((score, dealIdx) => {
          const s = Number(score);
          if (!isNaN(s) && dealIdx < dealCount) {
            scoresByDeal[dealIdx].push(s);
            agentScoreMap[dealIdx][agentName] = s;
          }
        });
      }
    } else {
      console.log(`    ⚠️  ${agentName} scoring failed: ${result.reason?.message?.slice(0, 80)}`);
    }
  });

  return scoresByDeal.map((scores, i) => ({
    finalScore: scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 70,
    agentScores: agentScoreMap[i],
    agentsResponded: scores.length,
  }));
}

// ── Deduplicate ───────────────────────────────────────────────
function deduplicateDeals(deals) {
  const seen = new Set();
  return deals.filter(d => {
    if (!d || !d.title) return false;
    const key = d.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 25);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║      Dealna 10-Agent Pipeline                ║');
  console.log('║  Generation : Groq + Gemini + Nemotron       ║');
  console.log('║  Scoring    : 10 agents, consensus average   ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n  Stores: ${STORES.length}  |  Scoring agents: ${SCORING_AGENTS.length}\n`);

  await mongoose.connect(MONGODB_URI);
  console.log('✅ MongoDB connected\n');

  const Deal  = mongoose.models.Deal  || mongoose.model('Deal',  dealSchema);
  const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);

  const report = {
    stores_processed: 0, stores_skipped: 0,
    deals_generated: 0,  deals_saved: 0,
    deals_rejected_score: 0, deals_rejected_duplicate: 0,
    errors: [],
  };

  const BATCH = 3;

  for (let i = 0; i < STORES.length; i += BATCH) {
    const batch = STORES.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(STORES.length / BATCH);
    console.log(`\n📦 Batch ${batchNum}/${totalBatches}: ${batch.map(s => s.name).join(' | ')}`);

    await Promise.allSettled(batch.map(async (gen) => {
      try {
        const escapedName = gen.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let store = await Store.findOne({ name: { $regex: '^' + escapedName + '$', $options: 'i' } });
        if (!store) {
         store = await Store.create({
          name: gen.name, category: gen.category,
          country: gen.country, website: gen.website, isActive: true,
          slug: gen.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now(),
        });
          console.log(`  ✨ Created store: ${gen.name}`);
        }

        const activeCount = await Deal.countDocuments({ store: store._id, isActive: true });
        if (activeCount >= 15) {
          console.log(`  ⏭️  ${gen.name}: ${activeCount} deals, skipping`);
          report.stores_skipped++;
          return;
        }

        const countPerAgent = Math.min(gen.count, Math.ceil((15 - activeCount) / 3));

        // Generation — 3 agents in parallel
        console.log(`  🔄 ${gen.name}: generating with 3 agents...`);
        const [r1, r2, r3] = await Promise.allSettled([
          generateWithGroq(gen.name, gen.category, countPerAgent, gen.country, gen.currency, gen.website),
          generateWithGemini(gen.name, gen.category, countPerAgent, gen.country, gen.currency, gen.website),
          generateWithNemotron(gen.name, gen.category, countPerAgent, gen.country, gen.currency, gen.website),
        ]);

        const d1 = r1.status === 'fulfilled' ? r1.value : [];
        const d2 = r2.status === 'fulfilled' ? r2.value : [];
        const d3 = r3.status === 'fulfilled' ? r3.value : [];

        if (r1.status === 'rejected') console.log(`    ⚠️  Groq gen failed: ${r1.reason?.message}`);
        if (r2.status === 'rejected') console.log(`    ⚠️  Gemini gen failed: ${r2.reason?.message}`);
        if (r3.status === 'rejected') console.log(`    ⚠️  Nemotron gen failed: ${r3.reason?.message}`);

        const merged = deduplicateDeals([...d1, ...d2, ...d3]);
        report.deals_generated += merged.length;

        if (merged.length === 0) {
          console.log(`    ❌ No deals generated for ${gen.name}`);
          report.errors.push(`${gen.name}: all generation agents failed`);
          return;
        }

        // Scoring — 10 agents
        console.log(`  📊 ${gen.name}: scoring ${merged.length} deals with 10 agents...`);
        const toScore = merged.map(d => ({
          title: d.title, category: gen.category,
          discountDisplay: d.discountDisplay || 'Deal', storeName: gen.name,
        }));
        const scoreResults = await scoreWithAllAgents(toScore);

        // Save
        const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        let saved = 0;

        for (let j = 0; j < merged.length; j++) {
          const d = merged[j];
          const { finalScore, agentScores, agentsResponded } = scoreResults[j];

          if (finalScore < 55) {
            console.log(`    🗑️  Rejected: "${d.title}" — score ${finalScore}/100`);
            report.deals_rejected_score++;
            continue;
          }

          const exists = await Deal.findOne({ title: d.title, store: store._id });
          if (exists) { report.deals_rejected_duplicate++; continue; }

          await Deal.create({
            title: d.title,
            description: d.description || `Great deal from ${gen.name}`,
            store: store._id,
            category: gen.category,
            promoCode: d.promoCode || null,
            discountDisplay: d.discountDisplay || 'Deal',
            discountType: d.discountType || 'percentage',
            discountValue: d.discountValue || 0,
            originalPrice: d.originalPrice || null,
            discountedPrice: d.discountedPrice || null,
            imageUrl: d.imageUrl || null,
            currency: d.currency || gen.currency,
            country: d.country || gen.country,
            tag: ['hot', 'new', 'verified'].includes(d.tag) ? d.tag : 'new',
            icon: '🏷️',
            affiliateUrl: buildSearchUrl(gen.website, d.title),
            expiresAt: exp,
            aiScore: finalScore,
            agentScores,
            isActive: true,
            isFeatured: false,
          });

          saved++;
          report.deals_saved++;
          console.log(`    ✅ "${d.title}" — ${finalScore}/100 (${agentsResponded}/10 agents)`);
        }

        report.stores_processed++;
        console.log(`  ✅ ${gen.name}: ${saved} saved`);

      } catch (e) {
        report.errors.push(`${gen.name}: ${e.message}`);
        console.error(`  ❌ ${gen.name}:`, e.message);
      }
    }));

    if (i + BATCH < STORES.length) {
      console.log('\n  ⏳ Pausing 4s...');
      await sleep(4000);
    }
  }

  // Update featured
  console.log('\n⭐ Updating featured deals...');
  await Deal.updateMany({}, { isFeatured: false });
  const topDeals = await Deal.find({ isActive: true }).sort({ aiScore: -1 }).limit(6);
  for (const d of topDeals) await Deal.findByIdAndUpdate(d._id, { isFeatured: true });

  // Final report
  const totalDeals = await Deal.countDocuments({ isActive: true });
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║           Pipeline Complete                  ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Stores processed:     ${String(report.stores_processed).padEnd(22)}║`);
  console.log(`║  Stores skipped:       ${String(report.stores_skipped).padEnd(22)}║`);
  console.log(`║  Deals generated:      ${String(report.deals_generated).padEnd(22)}║`);
  console.log(`║  Deals saved:          ${String(report.deals_saved).padEnd(22)}║`);
  console.log(`║  Rejected (score<55):  ${String(report.deals_rejected_score).padEnd(22)}║`);
  console.log(`║  Rejected (dupes):     ${String(report.deals_rejected_duplicate).padEnd(22)}║`);
  console.log(`║  Total deals in DB:    ${String(totalDeals).padEnd(22)}║`);
  console.log(`║  Errors:               ${String(report.errors.length).padEnd(22)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  if (report.errors.length) {
    console.log('\nErrors:');
    report.errors.forEach(e => console.log('  -', e));
  }
  console.log('');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
