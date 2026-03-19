const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const CATEGORY_MAP = {
  food: 'Food',
  fashion: 'Fashion',
  electronics: 'Electronics',
  beauty: 'Beauty',
  travel: 'Travel',
  local: 'Local',
};
const ALLOWED_CATEGORIES = Object.values(CATEGORY_MAP);
const normalizeCategory = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || value;
};

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [60, 'Name cannot exceed 60 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false,
  },
  city: { type: String, trim: true },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  preferences: {
    categories: {
      type: [String],
      enum: ALLOWED_CATEGORIES,
      set: (values) => {
        if (!Array.isArray(values)) return values;
        return values.map(normalizeCategory);
      },
    },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    notifications: { type: Boolean, default: true },
  },
  savedDeals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Deal' }],
  clickHistory: [{
    deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
    clickedAt: { type: Date, default: Date.now },
  }],
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  refreshToken: { type: String, select: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ── Virtual: saved deals count ──
userSchema.virtual('savedDealsCount').get(function () {
  return this.savedDeals ? this.savedDeals.length : 0;
});

// ── Hash password before save ──
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Compare password ──
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Remove sensitive fields on JSON output ──
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
