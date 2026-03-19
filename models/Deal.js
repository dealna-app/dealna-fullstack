const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [120, 'Title cannot exceed 120 characters'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters'],
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: [true, 'Store is required'],
  },
 category: {
    type: String,
    required: true,
    enum: ['Food', 'Fashion', 'Electronics', 'Beauty', 'Travel', 'Local', 'Other'],
  },
 promoCode: {
    type: String,
    required: false,
    default: null,
    uppercase: true,
    trim: true,
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed', 'bogo', 'gift', 'free_shipping'],
    required: true,
  },
  discountValue: { type: Number },           // e.g. 30 for 30%
  discountDisplay: { type: String },          // e.g. "30% OFF" or "Free item"
  originalPrice: { type: String },            // Display string e.g. "2,400 MAD"
  affiliateUrl: {
    type: String,
    required: [true, 'Affiliate URL is required'],
  },
  imageUrl: {
    type: String,
    default: null,
    trim: true,
    set: (v) => (v ? v : null),
    validate: {
      validator: function (v) {
        if (!v) return true;
        try {
          new URL(v);
          return true;
        } catch (err) {
          return false;
        }
      },
      message: 'Image URL must be valid',
    },
  },
  tag: {
    type: String,
    enum: ['hot', 'new', 'verified', 'exclusive'],
    default: 'new',
  },
  icon: { type: String, default: '🏷️' },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry date is required'],
  },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },

  // ── AI fields ──
  aiScore: { type: Number, default: 70, min: 0, max: 100 },
  aiTags: [String],           // e.g. ['budget-friendly', 'popular', 'new-arrival']
  aiSummary: { type: String },

  // ── Analytics ──
  analytics: {
    clicks: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    copies: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },     // Affiliate revenue in MAD
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// ── Virtual: is expired ──
dealSchema.virtual('isExpired').get(function () {
  return new Date() > this.expiresAt;
});

// ── Virtual: CTR ──
dealSchema.virtual('ctr').get(function () {
  if (!this.analytics.clicks) return 0;
  return ((this.analytics.conversions / this.analytics.clicks) * 100).toFixed(1);
});

// ── Index for fast queries ──
dealSchema.index({ category: 1, isActive: 1 });
dealSchema.index({ expiresAt: 1 });
dealSchema.index({ 'analytics.clicks': -1 });
dealSchema.index({ aiScore: -1 });
dealSchema.index({ store: 1 });

module.exports = mongoose.model('Deal', dealSchema);
