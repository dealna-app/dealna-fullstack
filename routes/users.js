const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');

// ── GET /api/users/me/saved ── Get saved deals
router.get('/me/saved', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'savedDeals',
        populate: { path: 'store', select: 'name icon' },
        match: { isActive: true },
      });
    res.json({ success: true, savedDeals: user.savedDeals });
  } catch (err) { next(err); }
});

// ── PATCH /api/users/me ── Update profile
router.patch('/me', protect, [
  body('name').optional().trim().isLength({ max: 60 }),
  body('city').optional().trim(),
  body('preferences.categories').optional().isArray(),
  body('preferences.language').optional().isIn(['en', 'ar']),
  body('preferences.notifications').optional().isBoolean(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const allowed = ['name', 'city', 'preferences'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

// ── PATCH /api/users/me/password ──
router.patch('/me/password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(req.body.currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    user.password = req.body.newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) { next(err); }
});

// ── Admin: GET /api/users ──
router.get('/', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter).sort('-createdAt').skip(skip).limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, total, users });
  } catch (err) { next(err); }
});

// ── Admin: PATCH /api/users/:id/status ──
router.patch('/:id/status', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

module.exports = router;
