const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');
const Store = require('../models/Store');
const Click = require('../models/Click');
const { optionalAuth } = require('../middleware/auth');

// ── Helper: detect device ──
function detectDevice(ua = '') {
  if (/mobile/i.test(ua)) return 'mobile';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  return 'desktop';
}

// ── POST /api/track/click ── Record a deal click
router.post('/click', optionalAuth, async (req, res, next) => {
  try {
    const { dealId, action = 'click', source = 'home' } = req.body;
    const allowedActions = ['click', 'copy_code', 'visit_store', 'save', 'unsave'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }

    const deal = await Deal.findById(dealId);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });

    // Record click
    await Click.create({
      deal: deal._id,
      store: deal.store,
      user: req.user?._id || null,
      action,
      source,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      device: detectDevice(req.headers['user-agent']),
      country: 'MA',
    });

    // Increment analytics
    const update = {};
    if (action === 'click')       update['analytics.clicks'] = 1;
    if (action === 'copy_code')   update['analytics.copies'] = 1;
    if (action === 'visit_store') update['analytics.uniqueVisitors'] = 1;

    if (Object.keys(update).length) {
      await Deal.findByIdAndUpdate(deal._id, { $inc: update });
    }
    await Store.findByIdAndUpdate(deal.store, { $inc: { 'analytics.totalClicks': 1 } });

    // Add to user click history
    if (req.user && action === 'click') {
      await require('../models/User').findByIdAndUpdate(req.user._id, {
        $push: { clickHistory: { deal: deal._id, clickedAt: new Date() } },
      });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /api/track/redirect/:dealId ── Affiliate redirect with tracking
router.get('/redirect/:dealId', optionalAuth, async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.dealId).populate('store');
    if (!deal || !deal.isActive) {
      return res.status(404).json({ success: false, message: 'Deal not found or expired.' });
    }

    // Log visit
    await Click.create({
      deal: deal._id,
      store: deal.store._id,
      user: req.user?._id || null,
      action: 'visit_store',
      source: req.query.source || 'direct',
      ip: req.ip,
      device: detectDevice(req.headers['user-agent']),
    });

    await Deal.findByIdAndUpdate(deal._id, { $inc: { 'analytics.uniqueVisitors': 1 } });
    await Store.findByIdAndUpdate(deal.store._id, { $inc: { 'analytics.totalClicks': 1 } });

    // Build affiliate URL (append tracking params)
    let url = deal.affiliateUrl;
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}ref=dealna&dealId=${deal._id}`;

    res.redirect(302, url);
  } catch (err) { next(err); }
});

// ── POST /api/track/conversion ── Webhook: mark conversion
router.post('/conversion', async (req, res, next) => {
  try {
    const { dealId, orderId, amount } = req.body;
    const deal = await Deal.findById(dealId);
    if (!deal) return res.status(404).json({ success: false });

    const store = await require('../models/Store').findById(deal.store);
    const commission = (amount || 0) * ((store?.commissionRate || 5) / 100);

    await Deal.findByIdAndUpdate(dealId, {
      $inc: { 'analytics.conversions': 1, 'analytics.revenue': commission },
    });

    // Mark latest click as converted
    await Click.findOneAndUpdate(
      { deal: dealId, action: 'visit_store', converted: false },
      { converted: true, commissionEarned: commission },
      { sort: { createdAt: -1 } }
    );

    res.json({ success: true, commission });
  } catch (err) { next(err); }
});


// ── GET /api/track/popular ── Trending deals by click count
router.get('/popular', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const deals = await Deal.find({ isActive: true, expiresAt: { $gt: new Date() } })
      .populate('store', 'name slug category website affiliateBaseUrl')
      .sort({ 'analytics.clicks': -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, deals });
  } catch (err) { next(err); }
});

module.exports = router;
