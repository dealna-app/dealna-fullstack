// v3
const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');
const Store = require('../models/Store');
const User = require('../models/User');
const Click = require('../models/Click');
const { protect, restrictTo } = require('../middleware/auth');
const { fetchOgImage } = require('../utils/imageScrape');

const admin = [protect, restrictTo('admin')];
const adminJobKey = process.env.ADMIN_JOB_KEY;

const requireAdminOrJobKey = (req, res, next) => {
  if (adminJobKey && req.query.key === adminJobKey) return next();
  return protect(req, res, () => restrictTo('admin')(req, res, next));
};

// ── GET /api/admin/summary ──
router.get('/summary', ...admin, async (req, res, next) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const [
      activeDeals, expiredDeals,
      totalUsers, newUsers,
      totalStores,
      weekClicks,
      totalRevenue,
      pendingDeals,
    ] = await Promise.all([
      Deal.countDocuments({ isActive: true, expiresAt: { $gt: now } }),
      Deal.countDocuments({ expiresAt: { $lte: now } }),
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', createdAt: { $gte: weekAgo } }),
      Store.countDocuments({ isActive: true }),
      Click.countDocuments({ createdAt: { $gte: weekAgo }, action: 'click' }),
      Deal.aggregate([{ $group: { _id: null, total: { $sum: '$analytics.revenue' } } }]),
      Deal.countDocuments({ isActive: false, expiresAt: { $gt: now } }),
    ]);
    res.json({
      success: true,
      summary: {
        activeDeals, expiredDeals, pendingDeals,
        totalUsers, newUsers,
        totalStores, weekClicks,
        totalRevenue: totalRevenue[0]?.total?.toFixed(2) || '0.00',
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/expiring-soon ──
router.get('/expiring-soon', ...admin, async (req, res, next) => {
  try {
    const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const deals = await Deal.find({
      isActive: true,
      expiresAt: { $gt: new Date(), $lte: threeDays },
    }).populate('store', 'name').sort('expiresAt');
    res.json({ success: true, deals });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/deals/bulk ──
router.patch('/deals/bulk', ...admin, async (req, res, next) => {
  try {
    const { ids, update } = req.body;
    if (!ids?.length) return res.status(400).json({ success: false, message: 'IDs required.' });
    const result = await Deal.updateMany({ _id: { $in: ids } }, update);
    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/expired-deals ──
router.delete('/expired-deals', ...admin, async (req, res, next) => {
  try {
    const result = await Deal.updateMany(
      { expiresAt: { $lte: new Date() } },
      { isActive: false }
    );
    res.json({ success: true, deactivated: result.modifiedCount });
  } catch (err) { next(err); }
});

// ── POST /api/admin/deals/fill-images ──
router.post('/deals/fill-images', requireAdminOrJobKey, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '10', 10), 50));
    const dryRun = String(req.query.dry || '').toLowerCase() === 'true';
    const deals = await Deal.find({
      isActive: true,
      affiliateUrl: { $exists: true, $ne: '' },
      $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }],
    }).limit(limit);

    let updated = 0;
    let skipped = 0;
    for (const deal of deals) {
      const img = await fetchOgImage(deal.affiliateUrl);
      if (img) {
        updated += 1;
        if (!dryRun) {
          deal.imageUrl = img;
          await deal.save({ validateBeforeSave: false });
        }
      } else {
        skipped += 1;
      }
    }
    res.json({ success: true, checked: deals.length, updated, skipped, dryRun });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ── POST /api/admin/scrape ──
router.post('/scrape', ...admin, async (req, res) => {
  try {
    const { scrapeOne } = require('../scripts/scraper');
    const store = req.body.store || 'Jumia Maroc';
    const saved = await scrapeOne(store);
    res.json({ success: true, saved, store });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ── GET /api/admin/scrape-now ──
router.get('/scrape-now', requireAdminOrJobKey, async (req, res) => {
  const storeName = req.query.store || 'Jumia Maroc';
  try {
    const { scrapeOne } = require('../scripts/scraper');
    const saved = await scrapeOne(storeName);
    res.json({ success: true, store: storeName, newDeals: saved });
  } catch(e) {
    res.json({ success: false, store: storeName, error: e.message });
  }
});

// ── GET /api/admin/pipeline ──
router.get('/pipeline', requireAdminOrJobKey, async (req, res) => {
  res.json({ success: true, message: 'Pipeline started', status: 'running' });
  try {
    const { runPipeline } = require('../scripts/pipeline');
    const report = await runPipeline(Deal, Store);
    console.log('[Pipeline] Done:', JSON.stringify(report));
  } catch(e) {
    console.error('[Pipeline] Error:', e.message);
  }
});

// ── GET /api/admin/seed-deals ──
router.get('/seed-deals', requireAdminOrJobKey, async (req, res) => {
  const exp = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  try {
    const stores = await Store.find({});
    const S = {};
    stores.forEach(s => { S[s.name] = s._id; });
    const NEW_DEALS = [
      { title: 'Samsung Galaxy A15 — 45% OFF', description: 'Écran AMOLED 6.5", 4GB RAM, 128GB stockage.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-SAM15', discountType: 'percentage', discountValue: 45, discountDisplay: '45% OFF', originalPrice: '1,799 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(25), aiScore: 91 },
      { title: 'Xiaomi Redmi Buds 4 — 38% OFF', description: 'Écouteurs sans fil avec réduction de bruit active.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-BUDS4', discountType: 'percentage', discountValue: 38, discountDisplay: '38% OFF', originalPrice: '349 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'new', expiresAt: exp(20), aiScore: 84 },
      { title: 'Livraison gratuite ce weekend', description: 'Livraison offerte sur commandes +80 MAD.', store: S['Glovo Morocco'], category: 'Food', promoCode: 'GLOVOFREE', discountType: 'free_shipping', discountDisplay: 'Livraison Gratuite', affiliateUrl: 'https://glovoapp.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(7), aiScore: 92 },
      { title: 'Maxi Deal — 2 Pizzas + Dessert', description: '2 grandes pizzas + 1 dessert pour 149 MAD.', store: S['Pizza Hut Maroc'], category: 'Food', promoCode: 'MAXI149', discountType: 'fixed', discountValue: 149, discountDisplay: '149 MAD', affiliateUrl: 'https://pizzahut.ma/?ref=dealna', tag: 'hot', expiresAt: exp(14), aiScore: 90 },
      { title: "Robes d'été — jusqu'à 50% OFF", description: 'Collection printemps-été en promotion.', store: S['Zara Morocco'], category: 'Fashion', promoCode: null, discountType: 'percentage', discountValue: 50, discountDisplay: '50% OFF', affiliateUrl: 'https://zara.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(20), aiScore: 88 },
      { title: 'Vêtements enfants H&M — 25% OFF', description: 'Collection kids printemps. Tailles 2-14 ans.', store: S['H&M Morocco'], category: 'Fashion', promoCode: 'HMKIDS25', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', affiliateUrl: 'https://hm.com/ma/?ref=dealna', tag: 'new', expiresAt: exp(25), aiScore: 76 },
      { title: "Parfum Lancôme La Vie est Belle — 25% OFF", description: 'Eau de parfum 75ml.', store: S['Nocibé Maroc'], category: 'Beauty', promoCode: 'NOCIBE-LVB', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', originalPrice: '899 MAD', affiliateUrl: 'https://nocibe.ma/?ref=dealna', tag: 'hot', expiresAt: exp(15), aiScore: 90 },
      { title: 'Casa → Paris dès 1,299 MAD', description: 'Vols directs Casablanca-Paris.', store: S['Royal Air Maroc'], category: 'Travel', promoCode: 'RAM-CDG', discountType: 'fixed', discountValue: 1299, discountDisplay: 'dès 1,299 MAD', affiliateUrl: 'https://royalairmaroc.com/?ref=dealna', tag: 'hot', expiresAt: exp(18), aiScore: 93 },
      { title: 'Casa → Marrakech dès 45 MAD', description: 'Bus climatisé depuis Casablanca.', store: S['Ouibus Maroc'], category: 'Travel', promoCode: 'OUIBUS-CMK', discountType: 'fixed', discountValue: 45, discountDisplay: 'dès 45 MAD', affiliateUrl: 'https://ouibus.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 82 },
      { title: 'Forfait gommage + massage — 199 MAD', description: 'Gommage beldi + massage 90 minutes.', store: S['Hammam Zwin'], category: 'Local', promoCode: 'ZWIN-GM', discountType: 'fixed', discountValue: 199, discountDisplay: '199 MAD', affiliateUrl: 'https://hammamzwin.ma/?ref=dealna', tag: 'hot', expiresAt: exp(14), aiScore: 88 },
    ];
    let added = 0, skipped = 0;
    for (const d of NEW_DEALS) {
      if (!d.store) { skipped++; continue; }
      const exists = await Deal.findOne({ title: d.title, store: d.store });
      if (exists) { skipped++; continue; }
      await Deal.create({ ...d, isActive: true, isFeatured: d.aiScore >= 90, icon: '🏷️', analytics: { clicks: Math.floor(Math.random()*500)+50, saves: Math.floor(Math.random()*40)+5 } });
      added++;
    }
    res.json({ success: true, added, skipped });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ── GET /api/admin/trim-store ──
router.get('/trim-store', requireAdminOrJobKey, async (req, res) => {
  try {
    const storeName = req.query.store || 'Jumia Maroc';
    const max = parseInt(req.query.max || '20');
    const store = await Store.findOne({ name: { $regex: '^' + storeName + '$', $options: 'i' } });
    if (!store) return res.json({ success: false, error: 'Store not found' });
    const keep = await Deal.find({ store: store._id, isActive: true })
      .sort({ aiScore: -1 }).limit(max).select('_id');
    const keepIds = keep.map(d => d._id);
    const result = await Deal.deleteMany({
      store: store._id,
      _id: { $nin: keepIds },
      isFeatured: false,
    });
    const remaining = await Deal.countDocuments({ store: store._id, isActive: true });
    res.json({ success: true, deleted: result.deletedCount, remaining });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ── GET /api/admin/fill-empty-stores ──
router.get('/fill-empty-stores', requireAdminOrJobKey, async (req, res) => {
  try {
    const { generateDealsWithAI } = require('../scripts/pipeline');
    const batch = parseInt(req.query.batch || '0');
    const allTargets = [
      { name: 'Amazon UAE', category: 'Electronics', count: 4, country: 'AE', currency: 'AED' },
      { name: 'Booking.com', category: 'Travel', count: 4, country: 'FR', currency: 'EUR' },
      { name: 'Fnac', category: 'Electronics', count: 4, country: 'FR', currency: 'EUR' },
      { name: 'Jumia Egypt', category: 'Electronics', count: 4, country: 'EG', currency: 'EGP' },
      { name: 'Marjane', category: 'Food', count: 4, country: 'MA', currency: 'MAD' },
      { name: 'Noon Egypt', category: 'Electronics', count: 4, country: 'EG', currency: 'EGP' },
      { name: 'Noon UAE', category: 'Electronics', count: 4, country: 'AE', currency: 'AED' },
      { name: 'Souq.com', category: 'Electronics', count: 4, country: 'MA', currency: 'MAD' },
      { name: 'Mac Morocco', category: 'Beauty', count: 4, country: 'MA', currency: 'MAD' },
      { name: 'Ouibus Maroc', category: 'Travel', count: 4, country: 'MA', currency: 'MAD' },
    ];
    const targets = allTargets.slice(batch * 2, batch * 2 + 2);
    if (!targets.length) return res.json({ success: true, message: 'All batches done', added: 0 });
    const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let added = 0;
    for (const gen of targets) {
      const store = await Store.findOne({ name: { $regex: '^' + gen.name + '$', $options: 'i' } });
      if (!store) continue;
      const existing = await Deal.countDocuments({ store: store._id, isActive: true });
      if (existing >= 4) continue;
      const aiDeals = await generateDealsWithAI(gen.name, gen.category, gen.count, gen.country, gen.currency);
      for (const d of aiDeals) {
        const exists = await Deal.findOne({ title: d.title, store: store._id });
        if (exists) continue;
        await Deal.create({
          title: d.title,
          description: d.description || 'Great deal from ' + gen.name,
          store: store._id,
          category: gen.category,
          promoCode: d.promoCode || null,
          discountDisplay: d.discountDisplay || 'Deal',
          discountType: d.discountType || 'percentage',
          discountValue: d.discountValue || 0,
          originalPrice: d.originalPrice ? String(d.originalPrice) : null,
          imageUrl: d.imageUrl || null,
          currency: gen.currency,
          country: gen.country,
          tag: ['hot','new','verified'].includes(d.tag) ? d.tag : 'new',
          icon: '🏷️',
          affiliateUrl: store.affiliateBaseUrl || store.website || 'https://dealna.surge.sh',
          expiresAt: exp,
          aiScore: 75,
          isActive: true,
          isFeatured: false,
        });
        added++;
      }
    }
    res.json({ success: true, batch, stores: targets.map(t => t.name), added });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;