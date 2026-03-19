const mongoose = require('mongoose');

const clickSchema = new mongoose.Schema({
  deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null = anonymous
  action: {
    type: String,
    enum: ['click', 'copy_code', 'visit_store', 'save', 'unsave'],
    required: true,
  },
  // Attribution
 source: { type: String, enum: ['home', 'deals', 'search', 'ai_recommendation', 'chat', 'profile', 'modal', 'featured', 'saved'], default: 'home' },
  referrer: { type: String },
  // Geo
  ip: { type: String },
  city: { type: String },
  country: { type: String, default: 'MA' },
  // Device
  userAgent: { type: String },
  device: { type: String, enum: ['mobile', 'desktop', 'tablet'], default: 'desktop' },
  // Revenue tracking
  converted: { type: Boolean, default: false },
  commissionEarned: { type: Number, default: 0 },
}, {
  timestamps: true,
});

// ── Indexes for analytics queries ──
clickSchema.index({ deal: 1, createdAt: -1 });
clickSchema.index({ store: 1, createdAt: -1 });
clickSchema.index({ action: 1 });
clickSchema.index({ user: 1 });
clickSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Click', clickSchema);
