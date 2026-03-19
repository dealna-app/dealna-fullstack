// ── pipeline.js ─────────────────────────────────────────────
// AI-powered autonomous deal pipeline.
// Called daily by cron-job.org hitting:
//   GET /api/admin/pipeline?key=dealna2025
//
// What it does every run:
//  1. DELETE expired deals (expiresAt < now)
//  2. DELETE deals with aiScore < 60 (low quality)
//  3. DELETE deals older than 45 days (stale)
//  4. SCRAPE Jumia Maroc fresh deals
//  5. AI-SCORE all unscored / recently added deals via Groq
//  6. FEATURE top 6 deals by aiScore
//  7. Return full report
// ────────────────────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── AI scorer: scores a batch of deals via Groq ──────────────
async function scoreDealsWithAI(deals) {
  if (!deals.length) return [];

  const list = deals.map((d, i) =>
    `${i + 1}. Title: "${d.title}" | Category: ${d.category} | Discount: ${d.discountDisplay} | Store: ${d.storeName}`
  ).join('\n');

  const prompt = `You are a deal quality scorer for a Moroccan deals platform.
Score each deal from 0-100 based on:
- Value for money (discount size and relevance)
- Appeal to Moroccan shoppers
- Clarity and specificity of the offer
- Category popularity in Morocco

Deals to score:
${list}

Return ONLY a JSON array of numbers, one score per deal, in the same order.
Example: [85, 72, 90, 45]
No explanation, no markdown, just the array.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });
    const data = await res.json();
    const raw = data.choices[0].message.content.trim();
    const scores = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return Array.isArray(scores) ? scores : [];
  } catch (e) {
    console.error('AI scoring error:', e.message);
    return [];
  }
}

// ── AI deal generator: generates fresh deals for a store ─────
async function generateDealsWithAI(storeName, category, count = 3) {
  const prompt = `Generate ${count} realistic current deals for "${storeName}", a Moroccan ${category} store/brand.
These should be believable deals that Moroccan shoppers would actually find.
Use French or English (mix is fine, as used in Morocco).

Return ONLY a JSON array:
[
  {
    "title": "Deal title (max 60 chars)",
    "description": "Short description (max 120 chars)",
    "promoCode": "CODE123 or null",
    "discountDisplay": "30% OFF or Free Delivery etc",
    "discountType": "percentage or fixed or bogo or gift or free_shipping",
    "discountValue": 30,
    "originalPrice": "500 MAD or null",
    "tag": "hot or new or verified"
  }
]

Rules:
- Make discounts realistic (10-70%)
- Use MAD currency for prices
- Keep titles specific and catchy
- Return exactly ${count} deals
- No markdown, no explanation`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
      }),
    });
    const data = await res.json();
    const raw = data.choices[0].message.content.trim();
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('AI generation error:', e.message);
    return [];
  }
}

// ── Main pipeline function ───────────────────────────────────
async function runPipeline(Deal, Store) {
  const report = {
    deleted_expired: 0,
    deleted_low_score: 0,
    deleted_stale: 0,
    scraped_new: 0,
    ai_generated: 0,
    ai_scored: 0,
    featured_updated: 0,
    errors: [],
  };

  const now = new Date();
  const staleDate = new Date(now - 45 * 24 * 60 * 60 * 1000);

  // ── STEP 1: Delete expired deals ────────────────────────────
  try {
    const res = await Deal.deleteMany({ expiresAt: { $lt: now } });
    report.deleted_expired = res.deletedCount;
    console.log(`[Pipeline] Deleted ${res.deletedCount} expired deals`);
  } catch (e) {
    report.errors.push('delete_expired: ' + e.message);
  }

  // ── STEP 2: Delete low quality deals (aiScore < 60) ─────────
  try {
    const res = await Deal.deleteMany({ aiScore: { $lt: 60 }, isFeatured: false });
    report.deleted_low_score = res.deletedCount;
    console.log(`[Pipeline] Deleted ${res.deletedCount} low-score deals`);
  } catch (e) {
    report.errors.push('delete_low_score: ' + e.message);
  }

  // ── STEP 3: Delete stale deals (>45 days old, not featured) ─
  try {
    const res = await Deal.deleteMany({
      createdAt: { $lt: staleDate },
      isFeatured: false,
      'analytics.clicks': { $lt: 100 },
    });
    report.deleted_stale = res.deletedCount;
    console.log(`[Pipeline] Deleted ${res.deletedCount} stale deals`);
  } catch (e) {
    report.errors.push('delete_stale: ' + e.message);
  }

  // ── STEP 4: Scrape fresh Jumia deals ────────────────────────
  try {
    const { scrapeOne } = require('./scraper');
    const saved = await scrapeOne('Jumia Maroc');
    report.scraped_new += saved;
    console.log(`[Pipeline] Scraped ${saved} new Jumia deals`);
  } catch (e) {
    report.errors.push('scrape: ' + e.message);
    console.error('[Pipeline] Scrape error:', e.message);
  }

  // ── STEP 5: AI-generate deals for non-scrapable stores ──────
  const GENERATE_FOR = [
    { name: 'Glovo Morocco',    category: 'Food',        count: 2 },
    { name: 'Pizza Hut Maroc',  category: 'Food',        count: 1 },
    { name: 'Zara Morocco',     category: 'Fashion',     count: 2 },
    { name: 'H&M Morocco',      category: 'Fashion',     count: 1 },
    { name: 'Nocibé Maroc',     category: 'Beauty',      count: 2 },
    { name: 'Royal Air Maroc',  category: 'Travel',      count: 2 },
    { name: "L'bricole",        category: 'Local',       count: 1 },
    { name: 'Hammam Zwin',      category: 'Local',       count: 1 },
  ];

  for (const gen of GENERATE_FOR) {
    try {
      const store = await Store.findOne({ name: { $regex: gen.name, $options: 'i' } });
      if (!store) continue;

      // Only generate if store has fewer than 3 active deals
      const activeCount = await Deal.countDocuments({ store: store._id, isActive: true });
      if (activeCount >= 4) continue;

      const aiDeals = await generateDealsWithAI(gen.name, gen.category, gen.count);
      const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      for (const d of aiDeals) {
        const exists = await Deal.findOne({ title: d.title, store: store._id });
        if (exists) continue;

        await Deal.create({
          title: d.title,
          description: d.description || 'Great deal from ' + gen.name,
          store: store._id,
          category: gen.category,
          promoCode: d.promoCode || null,
          discountDisplay: d.discountDisplay || 'Deal',
          discountType: d.discountType || 'percentage',
          discountValue: d.discountValue || 0,
          originalPrice: d.originalPrice || null,
          tag: d.tag || 'new',
          icon: '🏷️',
          affiliateUrl: store.affiliateBaseUrl || store.website || 'https://dealna.surge.sh',
          expiresAt: exp,
          aiScore: 70, // will be re-scored in step 6
          isActive: true,
          isFeatured: false,
        });
        report.ai_generated++;
      }
      console.log(`[Pipeline] Generated ${aiDeals.length} deals for ${gen.name}`);
    } catch (e) {
      report.errors.push('generate_' + gen.name + ': ' + e.message);
    }
  }

  // ── STEP 6: AI-score all recent unscored deals ───────────────
  try {
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const unscored = await Deal.find({
      $or: [
        { aiScore: { $lte: 70 }, createdAt: { $gte: twoDaysAgo } },
        { aiScore: null },
      ]
    }).populate('store', 'name').limit(20);

    if (unscored.length > 0) {
      const toScore = unscored.map(d => ({
        _id: d._id,
        title: d.title,
        category: d.category,
        discountDisplay: d.discountDisplay,
        storeName: d.store?.name || '',
      }));

      const scores = await scoreDealsWithAI(toScore);

      for (let i = 0; i < toScore.length; i++) {
        if (scores[i] !== undefined) {
          await Deal.findByIdAndUpdate(toScore[i]._id, { aiScore: scores[i] });
          report.ai_scored++;
        }
      }
      console.log(`[Pipeline] AI-scored ${report.ai_scored} deals`);
    }
  } catch (e) {
    report.errors.push('ai_score: ' + e.message);
  }

  // ── STEP 7: Delete anything AI scored below 55 ──────────────
  try {
    const res = await Deal.deleteMany({ aiScore: { $lt: 55 }, isFeatured: false });
    if (res.deletedCount > 0) {
      console.log(`[Pipeline] Deleted ${res.deletedCount} more low-score deals after AI scoring`);
      report.deleted_low_score += res.deletedCount;
    }
  } catch (e) {
    report.errors.push('delete_after_score: ' + e.message);
  }

  // ── STEP 8: Update featured deals (top 6 by aiScore) ────────
  try {
    await Deal.updateMany({}, { isFeatured: false });
    const topDeals = await Deal.find({ isActive: true })
      .sort({ aiScore: -1 })
      .limit(6);
    for (const d of topDeals) {
      await Deal.findByIdAndUpdate(d._id, { isFeatured: true });
    }
    report.featured_updated = topDeals.length;
    console.log(`[Pipeline] Updated ${topDeals.length} featured deals`);
  } catch (e) {
    report.errors.push('feature: ' + e.message);
  }

  return report;
}

module.exports = { runPipeline };