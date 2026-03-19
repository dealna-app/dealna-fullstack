require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const app = express();
app.set('trust proxy', 1);

// ── MongoDB connection caching for Vercel serverless ──
let isConnected = false;
let activeDbLabel = null;
const primaryUri = process.env.MONGODB_URI;
const fallbackUri = process.env.MONGODB_FALLBACK_URI;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) {
    const label = activeDbLabel ? ` (${activeDbLabel})` : '';
    console.log(`✅ Using cached MongoDB connection${label}`);
    return;
  }
  try {
    const options = {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      bufferCommands: false,
    };

    if (!primaryUri && !fallbackUri) {
      throw new Error('No MongoDB URI provided');
    }

    try {
      if (primaryUri) {
        await mongoose.connect(primaryUri, options);
        isConnected = true;
        activeDbLabel = 'primary';
        console.log('✅ MongoDB connected (primary)');
        return;
      }
    } catch (err) {
      await mongoose.disconnect().catch(() => {});
      if (!fallbackUri) throw err;
    }

    if (fallbackUri && fallbackUri !== primaryUri) {
      await mongoose.connect(fallbackUri, options);
      isConnected = true;
      activeDbLabel = 'fallback';
      console.log('✅ MongoDB connected (fallback)');
      return;
    }

    throw new Error('MongoDB connection failed');
  } catch (err) {
    isConnected = false;
    console.error('❌ MongoDB error:', err);
    throw err;
  }
}

// ── Connect before every request ──
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/deals', require('./routes/deals'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/users', require('./routes/users'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/track', require('./routes/tracking'));
app.use('/api/tracking', require('./routes/tracking')); // alias for frontend
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Dealna API is running!' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

module.exports = app;