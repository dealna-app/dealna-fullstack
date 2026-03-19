const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const Deal = require('../models/Deal');
const { protect, restrictTo } = require('../middleware/auth');

// ── GET /api/stores ──
router.get('/', async (req, res, next) => {
  try {
    const { category, featured } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (featured) filter.isFeatured = true;

    const stores = await Store.find(filter)
      .sort({ isFeatured: -1, 'analytics.totalClicks': -1, name: 1 })
      .lean();

    // Count active non-expired deals per store in one query
    const counts = await Deal.aggregate([
      { $match: { isActive: true, expiresAt: { $gt: new Date() } } },
      { $group: { _id: '$store', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[String(c._id)] = c.count; });

    const result = stores.map(s => ({ ...s, dealCount: countMap[String(s._id)] || 0 }));

    res.json({ success: true, stores: result });
  } catch (err) { next(err); }
});

// ── GET /api/stores/:slug ──
router.get('/:slug', async (req, res, next) => {
  try {
    const store = await Store.findOne({ slug: req.params.slug, isActive: true });
    if (!store) return res.status(404).json({ success: false, message: 'Store not found.' });

    const deals = await Deal.find({ store: store._id, isActive: true, expiresAt: { $gt: new Date() } })
      .sort('-aiScore').lean();

    res.json({ success: true, store, deals });
  } catch (err) { next(err); }
});

// ── POST /api/stores ── Admin only
router.post('/', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const store = await Store.create(req.body);
    res.status(201).json({ success: true, store });
  } catch (err) { next(err); }
});

// ── PATCH /api/stores/:id ── Admin only
router.patch('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const store = await Store.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!store) return res.status(404).json({ success: false, message: 'Store not found.' });
    res.json({ success: true, store });
  } catch (err) { next(err); }
});

// ── DELETE /api/stores/:id ── Admin: soft delete
router.delete('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const store = await Store.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!store) return res.status(404).json({ success: false, message: 'Store not found.' });
    res.json({ success: true, message: 'Store deactivated.' });
  } catch (err) { next(err); }
});

module.exports = router;