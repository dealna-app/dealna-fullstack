const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Store name is required'],
    unique: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
  },
  description: { type: String, maxlength: 400 },
  icon: { type: String, default: '🏪' },
  logoUrl: { type: String },
  website: { type: String, default: '' },
  category: {
    type: String,
    enum: ['Food', 'Fashion', 'Electronics', 'Beauty', 'Travel', 'Local', 'Mixed'],
    required: true,
  },
  affiliateBaseUrl: { type: String },  // Base URL for affiliate links
  commissionRate: { type: Number, default: 5 }, // percentage

  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },

  analytics: {
    totalClicks: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
  },

  tags: [String],  // e.g. ['moroccan', 'delivery', 'premium']
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// ── Auto-generate slug ──
storeSchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
  next();
});

// ── Virtual: active deal count ──
storeSchema.virtual('dealCount', {
  ref: 'Deal',
  localField: '_id',
  foreignField: 'store',
  count: true,
});

module.exports = mongoose.model('Store', storeSchema);