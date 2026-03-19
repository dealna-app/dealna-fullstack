const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Deal = require('../models/Deal');
const Click = require('../models/Click');
const { protect, optionalAuth, restrictTo } = require('../middleware/auth');
const { fetchOgImage } = require('../utils/imageScrape');

// ── GET /api/deals ── List deals with filtering, sorting, pagination
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      category, tag, search, sort = '-aiScore',
      page = 1, limit = 20, featured, store,
    } = req.query;

    const filter = { isActive: true, expiresAt: { $gt: new Date() } };
    if (category) filter.category = category;
    if (tag)      filter.tag = tag;
    if (featured) filter.isFeatured = true;
    if (store)    filter.store = store;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { promoCode: { $regex: search, $options: 'i' } },
        { aiTags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [deals, total] = await Promise.all([
      Deal.find(filter)
        .populate('store', 'name icon logoUrl slug category website affiliateBaseUrl isVerified')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Deal.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      deals,
    });
  } catch (err) { next(err); }
});

// ── GET /api/deals/featured ── Top AI-scored deals
router.get('/featured', async (req, res, next) => {
  try {
    const deals = await Deal.find({ isActive: true, isFeatured: true, expiresAt: { $gt: new Date() } })
      .populate('store', 'name icon logoUrl slug category website affiliateBaseUrl isVerified')
      .sort('-aiScore')
      .limit(8)
      .lean();
    res.json({ success: true, deals });
  } catch (err) { next(err); }
});


// ── GET /api/deals/popular ── Most clicked deals
router.get('/popular', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const deals = await Deal.find({ isActive: true, expiresAt: { $gt: new Date() } })
      .populate('store', 'name icon logoUrl slug category website affiliateBaseUrl')
      .sort({ 'analytics.clicks': -1, aiScore: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, deals });
  } catch (err) { next(err); }
});

// ── GET /api/deals/:id ──
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.id).populate('store');
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });
    res.json({ success: true, deal });
  } catch (err) { next(err); }
});

// ── POST /api/deals ── Admin: create deal
router.post('/', protect, restrictTo('admin'), [
  body('title').trim().notEmpty().isLength({ max: 120 }),
  body('description').trim().notEmpty().isLength({ max: 500 }),
  body('store').notEmpty().withMessage('Store ID required'),
  body('category').isIn(['Food', 'Fashion', 'Electronics', 'Beauty', 'Travel', 'Local', 'Other']),
  body('promoCode').optional({ checkFalsy: true }).trim(),
  body('discountType').isIn(['percentage', 'fixed', 'bogo', 'gift', 'free_shipping']),
  body('affiliateUrl').isURL().withMessage('Valid affiliate URL required'),
  body('imageUrl').optional({ checkFalsy: true }).isURL().withMessage('Valid image URL required'),
  body('expiresAt').isISO8601().withMessage('Valid expiry date required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const payload = { ...req.body };
    if (!payload.imageUrl && payload.affiliateUrl) {
      const scraped = await fetchOgImage(payload.affiliateUrl);
      if (scraped) payload.imageUrl = scraped;
    }
    const deal = await Deal.create(payload);
    await deal.populate('store', 'name icon');
    res.status(201).json({ success: true, deal });
  } catch (err) { next(err); }
});

// ── PATCH /api/deals/:id ── Admin: update deal
router.patch('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const update = { ...req.body };
    if (!update.imageUrl && update.affiliateUrl) {
      const scraped = await fetchOgImage(update.affiliateUrl);
      if (scraped) update.imageUrl = scraped;
    }
    const deal = await Deal.findByIdAndUpdate(req.params.id, update, {
      new: true, runValidators: true,
    }).populate('store', 'name icon');
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });
    res.json({ success: true, deal });
  } catch (err) { next(err); }
});

// ── DELETE /api/deals/:id ── Admin: soft delete
router.delete('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const deal = await Deal.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });
    res.json({ success: true, message: 'Deal deactivated.' });
  } catch (err) { next(err); }
});

// ── POST /api/deals/:id/save ── Toggle save for logged-in user
router.post('/:id/save', protect, async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });

    const user = req.user;
    const alreadySaved = user.savedDeals.includes(deal._id);

    if (alreadySaved) {
      user.savedDeals.pull(deal._id);
      deal.analytics.saves = Math.max(0, deal.analytics.saves - 1);
    } else {
      user.savedDeals.push(deal._id);
      deal.analytics.saves += 1;
      // Log save action
      await Click.create({ deal: deal._id, store: deal.store, user: user._id, action: 'save', source: req.body.source || 'home' });
    }

    await Promise.all([user.save({ validateBeforeSave: false }), deal.save()]);
    res.json({ success: true, saved: !alreadySaved, savedCount: user.savedDeals.length });
  } catch (err) { next(err); }
});

module.exports = router;
