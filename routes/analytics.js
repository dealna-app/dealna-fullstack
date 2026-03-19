const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');
const Store = require('../models/Store');
const User = require('../models/User');
const Click = require('../models/Click');
const { protect, restrictTo } = require('../middleware/auth');

const adminOnly = [protect, restrictTo('admin')];

// ── GET /api/analytics/dashboard ── Admin overview
router.get('/dashboard', ...adminOnly, async (req, res, next) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalDeals, activeDeals,
      totalUsers, newUsersThisWeek,
      totalStores,
      totalClicksAgg,
      revenueAgg,
    ] = await Promise.all([
      Deal.countDocuments(),
      Deal.countDocuments({ isActive: true, expiresAt: { $gt: now } }),
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', createdAt: { $gte: weekAgo } }),
      Store.countDocuments({ isActive: true }),
      Click.aggregate([{ $group: { _id: null, total: { $sum: 1 } } }]),
      Deal.aggregate([{ $group: { _id: null, revenue: { $sum: '$analytics.revenue' } } }]),
    ]);

    const totalClicks = totalClicksAgg[0]?.total || 0;
    const totalRevenue = revenueAgg[0]?.revenue || 0;

    res.json({
      success: true,
      stats: { totalDeals, activeDeals, totalUsers, newUsersThisWeek, totalStores, totalClicks, totalRevenue },
    });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/clicks-by-category ──
router.get('/clicks-by-category', ...adminOnly, async (req, res, next) => {
  try {
    const data = await Deal.aggregate([
      { $group: { _id: '$category', clicks: { $sum: '$analytics.clicks' }, deals: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/daily-clicks ── Last 30 days
router.get('/daily-clicks', ...adminOnly, async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const data = await Click.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, action: 'click' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          clicks: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/top-deals ──
router.get('/top-deals', ...adminOnly, async (req, res, next) => {
  try {
    const deals = await Deal.find()
      .populate('store', 'name')
      .sort('-analytics.clicks')
      .limit(10)
      .select('title store analytics category tag');
    res.json({ success: true, deals });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/top-stores ──
router.get('/top-stores', ...adminOnly, async (req, res, next) => {
  try {
    const stores = await Store.find({ isActive: true })
      .sort('-analytics.totalClicks')
      .limit(10)
      .select('name icon analytics category');
    res.json({ success: true, stores });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/devices ──
router.get('/devices', ...adminOnly, async (req, res, next) => {
  try {
    const data = await Click.aggregate([
      { $group: { _id: '$device', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/revenue ── Affiliate revenue summary
router.get('/revenue', ...adminOnly, async (req, res, next) => {
  try {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalRev, monthlyRev, byStore] = await Promise.all([
      Deal.aggregate([{ $group: { _id: null, total: { $sum: '$analytics.revenue' } } }]),
      Click.aggregate([
        { $match: { converted: true, createdAt: { $gte: monthAgo } } },
        { $group: { _id: null, total: { $sum: '$commissionEarned' } } },
      ]),
      Click.aggregate([
        { $match: { converted: true } },
        { $group: { _id: '$store', total: { $sum: '$commissionEarned' } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
        { $unwind: '$store' },
        { $project: { storeName: '$store.name', storeIcon: '$store.icon', total: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      totalRevenue: totalRev[0]?.total || 0,
      monthlyRevenue: monthlyRev[0]?.total || 0,
      byStore,
    });
  } catch (err) { next(err); }
});

module.exports = router;
