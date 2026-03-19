const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');
const { protect, optionalAuth } = require('../middleware/auth');

function resolveAiProvider() {
  const fromEnv = (process.env.AI_PROVIDER || '').toLowerCase();
  if (fromEnv) return fromEnv;
  if (process.env.GROQ_API_KEY) return 'groq';
  return 'anthropic';
}

function resolveAiModel(provider) {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  return provider === 'anthropic' ? 'claude-3-5-sonnet-20240620' : 'llama-3.3-70b-versatile';
}

async function callGroq(systemPrompt, userMessage, maxTokens) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set');
  }
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: resolveAiModel('groq'),
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Groq API error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(systemPrompt, userMessage, maxTokens) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
    },
    body: JSON.stringify({
      model: resolveAiModel('anthropic'),
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Anthropic API error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ── Helper: call Groq API ──
async function callClaude(systemPrompt, userMessage, maxTokens = 800) {
  const provider = resolveAiProvider();
  if (provider === 'anthropic') {
    return callAnthropic(systemPrompt, userMessage, maxTokens);
  }
  return callGroq(systemPrompt, userMessage, maxTokens);
}

// ── GET deal summaries for AI context (lightweight) ──
async function getDealContext() {
  const deals = await Deal.find({ isActive: true, expiresAt: { $gt: new Date() } })
    .populate('store', 'name')
    .select('title description category promoCode discountDisplay discountValue aiScore store')
    .sort('-aiScore')
    .limit(50)
    .lean();
  return deals.map(d => ({
    id: d._id,
    title: d.title,
    cat: d.category,
    store: d.store?.name,
    discount: d.discountDisplay,
    code: d.promoCode,
    score: d.aiScore,
  }));
}

// ── POST /api/ai/search ── AI-powered semantic deal search
router.post('/search', optionalAuth, async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: 'Query required.' });

    const dealContext = await getDealContext();
    const userPrefs = req.user?.preferences?.categories?.join(', ') || 'not specified';

    const system = `You are Dealna's AI deal-finder for Morocco. 
Available deals: ${JSON.stringify(dealContext)}.
User preferences: ${userPrefs}.
Find the most relevant deals for the user's query and return ONLY valid JSON (no markdown):
{"dealIds":["id1","id2"],"summary":"1-sentence explanation","tip":"1 practical shopping tip for Morocco"}
Pick 2-8 most relevant deal IDs. Prioritize by relevance then aiScore.`;

    const raw = await callClaude(system, query, 600);
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

    const deals = await Deal.find({ _id: { $in: parsed.dealIds }, isActive: true })
      .populate('store', 'name icon slug');

    res.json({ success: true, deals, summary: parsed.summary, tip: parsed.tip, query });
  } catch (err) {
    // Fallback: text search
    try {
      const deals = await Deal.find({
        isActive: true,
        expiresAt: { $gt: new Date() },
        $or: [
          { title: { $regex: req.body.query, $options: 'i' } },
          { description: { $regex: req.body.query, $options: 'i' } },
        ],
      }).populate('store', 'name icon slug').limit(8).sort('-aiScore');
      res.json({ success: true, deals, summary: `Results for "${req.body.query}"`, tip: null, fallback: true });
    } catch (e) { next(e); }
  }
});

// ── POST /api/ai/recommend ── Personalized deal recommendations
router.post('/recommend', protect, async (req, res, next) => {
  try {
    const user = req.user;
    const prefs = user.preferences?.categories || [];

    if (!prefs.length) {
      const deals = await Deal.find({ isActive: true, expiresAt: { $gt: new Date() } })
        .sort('-aiScore').limit(8).populate('store', 'name icon');
      return res.json({ success: true, deals, message: 'Top deals for you', personalized: false });
    }

    const dealContext = await getDealContext();

    const system = `You are Dealna's personalization AI for Morocco.
User interests: ${prefs.join(', ')}.
User city: ${user.city || 'Morocco'}.
Available deals: ${JSON.stringify(dealContext)}.
Return ONLY JSON: {"dealIds":["id1","id2"],"message":"Personalized greeting under 20 words mentioning their interests","reasons":{"id1":"why this matches","id2":"why"}}
Pick 4-8 deals best matching user interests.`;

    const raw = await callClaude(system, 'Give me my personalized deals', 700);
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

    const deals = await Deal.find({ _id: { $in: parsed.dealIds }, isActive: true })
      .populate('store', 'name icon slug');

    // Attach AI reasons to each deal
    const dealsWithReasons = deals.map(d => ({
      ...d.toObject(),
      aiReason: parsed.reasons?.[d._id.toString()] || 'Matches your preferences',
    }));

    res.json({ success: true, deals: dealsWithReasons, message: parsed.message, personalized: true });
  } catch (err) {
    // Fallback: category filter
    try {
      const prefs = req.user.preferences?.categories || [];
      const filter = prefs.length ? { category: { $in: prefs } } : {};
      const deals = await Deal.find({ ...filter, isActive: true, expiresAt: { $gt: new Date() } })
        .sort('-aiScore').limit(8).populate('store', 'name icon');
      res.json({ success: true, deals, message: `Deals picked for you`, personalized: false, fallback: true });
    } catch (e) { next(e); }
  }
});

// ── POST /api/ai/chat ── AI shopping assistant
router.post('/chat', optionalAuth, async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message required.' });

    const dealContext = await getDealContext();
    const userName = req.user?.name || 'there';
    const userPrefs = req.user?.preferences?.categories?.join(', ') || '';

    const system = `You are Dealna's friendly AI shopping assistant for Morocco, powered by AI.
Help users find deals, compare products, explain promo codes, and save money in Morocco.
Available deals right now: ${JSON.stringify(dealContext)}.
User: ${userName}${userPrefs ? '. Interests: ' + userPrefs : ''}.
Rules:
- Be concise (under 150 words)
- Be friendly and use natural emojis
- Mention specific deal titles and promo codes when relevant
- Format recommended deals as: **[Deal Title]** — Code: XXXXXX (X% off at StoreName)
- If no relevant deals, suggest browsing categories
- Respond in the same language the user wrote in (Arabic or English)`;

    // Build conversation messages
    const messages = [
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

   const reply = await callClaude(system, message, 600);
    res.json({ success: true, reply });
  } catch (err) { next(err); }
});

// ── POST /api/ai/score-deals ── Admin: re-score all deals with AI
router.post('/score-deals', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only.' });
    }

    const deals = await Deal.find({ isActive: true }).populate('store', 'name');
    const results = [];

    for (const deal of deals) {
      try {
        const system = `You are a deal quality scorer. Score this deal 0-100 based on value, popularity, and relevance for Moroccan shoppers.
Return ONLY JSON: {"score": 85, "tags": ["budget-friendly","popular"], "summary": "One sentence"}`;
        const raw = await callClaude(system,
          `Deal: ${deal.title}. Store: ${deal.store?.name}. Category: ${deal.category}. Discount: ${deal.discountDisplay}. Description: ${deal.description}`,
          200);
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        await Deal.findByIdAndUpdate(deal._id, {
          aiScore: parsed.score,
          aiTags: parsed.tags,
          aiSummary: parsed.summary,
        });
        results.push({ id: deal._id, score: parsed.score });
      } catch (e) { results.push({ id: deal._id, error: e.message }); }
    }

    res.json({ success: true, message: `Scored ${results.length} deals`, results });
  } catch (err) { next(err); }
});

module.exports = router;
