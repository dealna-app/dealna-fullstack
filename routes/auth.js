const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const CATEGORY_MAP = {
  food: 'Food',
  fashion: 'Fashion',
  electronics: 'Electronics',
  beauty: 'Beauty',
  travel: 'Travel',
  local: 'Local',
};
const ALLOWED_CATEGORIES = Object.values(CATEGORY_MAP);

const normalizeCategories = (preferences) => {
  if (!preferences || !Array.isArray(preferences.categories)) return { preferences };
  const normalized = preferences.categories.map((c) => {
    const key = String(c || '').trim().toLowerCase();
    return CATEGORY_MAP[key] || c;
  });
  const invalid = normalized.filter((c) => !ALLOWED_CATEGORIES.includes(c));
  return { preferences: { ...preferences, categories: normalized }, invalid };
};

// ── Helper: sign tokens ──
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const signRefreshToken = (id) =>
  jwt.sign(
    { id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

const sendTokens = async (user, statusCode, res) => {
  const token = signToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  res.status(statusCode).json({
    success: true,
    token,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      city: user.city,
      role: user.role,
      preferences: user.preferences,
      savedDeals: user.savedDeals,
    },
  });
};

// ── POST /api/auth/register ──
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('city').optional().trim(),
  body('preferences.categories').optional().isArray(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, city, preferences } = req.body;
    const { preferences: normalizedPreferences, invalid } = normalizeCategories(preferences);
    if (invalid?.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid preferences categories.',
        invalidCategories: invalid,
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const user = await User.create({ name, email, password, city, preferences: normalizedPreferences });
    await sendTokens(user, 201, res);
  } catch (err) { next(err); }
});

// ── POST /api/auth/login ──
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    await sendTokens(user, 200, res);
  } catch (err) { next(err); }
});

// ── POST /api/auth/refresh ──
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || !user.isActive || !user.refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }
    if (user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    const newToken = signToken(user._id);
    const newRefreshToken = signRefreshToken(user._id);
    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, token: newToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
});

// ── GET /api/auth/me ──
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id).populate('savedDeals', 'title promoCode discountDisplay store');
  res.json({ success: true, user });
});

// ── POST /api/auth/logout ──
router.post('/logout', protect, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
  res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;
