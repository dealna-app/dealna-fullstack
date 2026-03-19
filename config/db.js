const mongoose = require('mongoose');

const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI;
  const fallbackUri = process.env.MONGODB_FALLBACK_URI;
  try {
    if (!primaryUri && !fallbackUri) {
      throw new Error('No MongoDB URI provided');
    }
    try {
      if (primaryUri) {
        const conn = await mongoose.connect(primaryUri);
        console.log(`✅ MongoDB connected (primary): ${conn.connection.host}`);
        return;
      }
    } catch (err) {
      await mongoose.disconnect().catch(() => {});
      if (!fallbackUri) throw err;
    }

    if (fallbackUri && fallbackUri !== primaryUri) {
      const conn = await mongoose.connect(fallbackUri);
      console.log(`✅ MongoDB connected (fallback): ${conn.connection.host}`);
      return;
    }

    throw new Error('MongoDB connection failed');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

module.exports = connectDB;
