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

// ── POST /api/admin/deals/fill-images?limit=10&dry=true ──
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

// ── POST /api/admin/scrape ── Authenticated
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

// ── GET /api/admin/scrape-now?store=Jumia+Maroc (admin auth or ADMIN_JOB_KEY) ──
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

// ── GET /api/admin/pipeline (admin auth or ADMIN_JOB_KEY) ──────────────────────
// Full AI pipeline: cleans bad deals, scrapes fresh ones,
// AI-generates for non-scrapable stores, AI-scores everything,
// updates featured. Run daily via cron-job.org
router.get('/pipeline', requireAdminOrJobKey, async (req, res) => {
  try {
    const { runPipeline } = require('../scripts/pipeline');
    const report = await runPipeline(Deal, Store);
    const totalDeals = await Deal.countDocuments({ isActive: true });
    res.json({ success: true, report, totalDeals });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ── GET /api/admin/seed-deals (admin auth or ADMIN_JOB_KEY) ── One-time seed ──
router.get('/seed-deals', requireAdminOrJobKey, async (req, res) => {
  const exp = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  try {
    const stores = await Store.find({});
    const S = {};
    stores.forEach(s => { S[s.name] = s._id; });
    const NEW_DEALS = [
      { title: 'Samsung Galaxy A15 — 45% OFF', description: 'Écran AMOLED 6.5", 4GB RAM, 128GB stockage. Idéal pour le quotidien.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-SAM15', discountType: 'percentage', discountValue: 45, discountDisplay: '45% OFF', originalPrice: '1,799 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(25), aiScore: 91 },
      { title: 'Xiaomi Redmi Buds 4 — 38% OFF', description: 'Écouteurs sans fil avec réduction de bruit active. Autonomie 28h.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-BUDS4', discountType: 'percentage', discountValue: 38, discountDisplay: '38% OFF', originalPrice: '349 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'new', expiresAt: exp(20), aiScore: 84 },
      { title: 'Hisense Smart TV 43" — 30% OFF', description: 'TV LED 4K UHD, Android TV, WiFi intégré. Livraison gratuite Casablanca.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-TV43', discountType: 'percentage', discountValue: 30, discountDisplay: '30% OFF', originalPrice: '3,499 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(15), aiScore: 89 },
      { title: 'Friteuse sans huile Philips — 42% OFF', description: 'Air Fryer 4.1L, 7 programmes. Facile à nettoyer.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-AIRFRY', discountType: 'percentage', discountValue: 42, discountDisplay: '42% OFF', originalPrice: '1,299 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(22), aiScore: 87 },
      { title: 'Adidas Running Shoes — 40% OFF', description: 'Chaussures de course légères, semelle amortissante. Tailles 38-46.', store: S['Jumia Maroc'], category: 'Fashion', promoCode: 'JUMIA-ADIDAS', discountType: 'percentage', discountValue: 40, discountDisplay: '40% OFF', originalPrice: '799 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 86 },
      { title: "L'Oréal Elvive Pack — 35% OFF", description: 'Pack 3 shampoings réparateurs pour cheveux abîmés.', store: S['Jumia Maroc'], category: 'Beauty', promoCode: 'JUMIA-LOREAL', discountType: 'percentage', discountValue: 35, discountDisplay: '35% OFF', originalPrice: '189 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'new', expiresAt: exp(18), aiScore: 78 },
      { title: 'Livraison gratuite ce weekend', description: 'Livraison offerte sur commandes +80 MAD. Casablanca & Rabat.', store: S['Glovo Morocco'], category: 'Food', promoCode: 'GLOVOFREE', discountType: 'free_shipping', discountDisplay: 'Livraison Gratuite', affiliateUrl: 'https://glovoapp.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(7), aiScore: 92 },
      { title: '15 MAD de réduction Glovo', description: 'Valable sur commandes de plus de 120 MAD via app Glovo.', store: S['Glovo Morocco'], category: 'Food', promoCode: 'GLOVO15', discountType: 'fixed', discountValue: 15, discountDisplay: '15 MAD OFF', affiliateUrl: 'https://glovoapp.com/ma/?ref=dealna', tag: 'new', expiresAt: exp(7), aiScore: 85 },
      { title: 'Maxi Deal — 2 Pizzas + Dessert', description: '2 grandes pizzas + 1 dessert pour 149 MAD. Valable en ligne.', store: S['Pizza Hut Maroc'], category: 'Food', promoCode: 'MAXI149', discountType: 'fixed', discountValue: 149, discountDisplay: '149 MAD', affiliateUrl: 'https://pizzahut.ma/?ref=dealna', tag: 'hot', expiresAt: exp(14), aiScore: 90 },
      { title: "Robes d'été — jusqu'à 50% OFF", description: 'Collection printemps-été. Robes, tops et jeans en promotion.', store: S['Zara Morocco'], category: 'Fashion', promoCode: null, discountType: 'percentage', discountValue: 50, discountDisplay: '50% OFF', affiliateUrl: 'https://zara.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(20), aiScore: 88 },
      { title: 'Vêtements enfants H&M — 25% OFF', description: 'Collection kids printemps. Tailles 2-14 ans.', store: S['H&M Morocco'], category: 'Fashion', promoCode: 'HMKIDS25', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', affiliateUrl: 'https://hm.com/ma/?ref=dealna', tag: 'new', expiresAt: exp(25), aiScore: 76 },
      { title: "Parfum Lancôme La Vie est Belle — 25% OFF", description: 'Eau de parfum 75ml. Best-seller mondial au Maroc.', store: S['Nocibé Maroc'], category: 'Beauty', promoCode: 'NOCIBE-LVB', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', originalPrice: '899 MAD', affiliateUrl: 'https://nocibe.ma/?ref=dealna', tag: 'hot', expiresAt: exp(15), aiScore: 90 },
      { title: 'Routine soin visage Kit -40%', description: 'Nettoyant + sérum + hydratant. Routine complète peau mixte.', store: S['Nocibé Maroc'], category: 'Beauty', promoCode: 'NOCIBE-KIT', discountType: 'percentage', discountValue: 40, discountDisplay: '40% OFF', originalPrice: '650 MAD', affiliateUrl: 'https://nocibe.ma/?ref=dealna', tag: 'new', expiresAt: exp(20), aiScore: 86 },
      { title: 'Rouge à lèvres MAC — 20% OFF', description: 'Collection complète MAC. Plus de 100 teintes disponibles.', store: S['Mac Morocco'], category: 'Beauty', promoCode: 'MACLIP20', discountType: 'percentage', discountValue: 20, discountDisplay: '20% OFF', affiliateUrl: 'https://maccosmetics.ma/?ref=dealna', tag: 'new', expiresAt: exp(22), aiScore: 80 },
      { title: 'Casa → Paris dès 1,299 MAD', description: 'Vols directs Casablanca-Paris. Réservez pour avril-mai.', store: S['Royal Air Maroc'], category: 'Travel', promoCode: 'RAM-CDG', discountType: 'fixed', discountValue: 1299, discountDisplay: 'dès 1,299 MAD', affiliateUrl: 'https://royalairmaroc.com/?ref=dealna', tag: 'hot', expiresAt: exp(18), aiScore: 93 },
      { title: 'Vol intérieur Maroc — 30% OFF', description: 'Marrakech, Fès, Agadir, Oujda. Offre limitée.', store: S['Royal Air Maroc'], category: 'Travel', promoCode: 'RAM-DOM30', discountType: 'percentage', discountValue: 30, discountDisplay: '30% OFF', affiliateUrl: 'https://royalairmaroc.com/?ref=dealna', tag: 'hot', expiresAt: exp(10), aiScore: 91 },
      { title: 'Casa → Marrakech dès 45 MAD', description: 'Bus climatisé. Départs toutes les heures depuis Casablanca.', store: S['Ouibus Maroc'], category: 'Travel', promoCode: 'OUIBUS-CMK', discountType: 'fixed', discountValue: 45, discountDisplay: 'dès 45 MAD', affiliateUrl: 'https://ouibus.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 82 },
      { title: 'iPhone 13 reconditionné — 25% OFF', description: 'iPhone 13 128GB reconditionné certifié. Garantie 1 an.', store: S['Souq.com'], category: 'Electronics', promoCode: 'SOUQ-IP13', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', originalPrice: '5,200 MAD', affiliateUrl: 'https://souq.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(20), aiScore: 88 },
      { title: 'Tapis berbère fait main — 20% OFF', description: 'Tapis 100% laine naturelle du Haut-Atlas. 120x180cm.', store: S["L'bricole"], category: 'Local', promoCode: 'LBRI-TAPIS', discountType: 'percentage', discountValue: 20, discountDisplay: '20% OFF', originalPrice: '1,200 MAD', affiliateUrl: 'https://lbricole.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 79 },
      { title: "Argan Oil Bio 100ml — 25% OFF", description: "Huile d'argan pure biologique du Souss. Peau, cheveux et ongles.", store: S["L'bricole"], category: 'Local', promoCode: 'LBRI-ARGAN', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', originalPrice: '220 MAD', affiliateUrl: 'https://lbricole.ma/?ref=dealna', tag: 'new', expiresAt: exp(20), aiScore: 77 },
      { title: 'Forfait gommage + massage — 199 MAD', description: 'Gommage beldi + massage huiles essentielles. 90 minutes.', store: S['Hammam Zwin'], category: 'Local', promoCode: 'ZWIN-GM', discountType: 'fixed', discountValue: 199, discountDisplay: '199 MAD', affiliateUrl: 'https://hammamzwin.ma/?ref=dealna', tag: 'hot', expiresAt: exp(14), aiScore: 88 },
      { title: 'Séance hammam couple — 30% OFF', description: 'Expérience hammam privée pour 2. Idéal cadeau. Sur réservation.', store: S['Hammam Zwin'], category: 'Local', promoCode: 'ZWIN-CPL', discountType: 'percentage', discountValue: 30, discountDisplay: '30% OFF', originalPrice: '480 MAD', affiliateUrl: 'https://hammamzwin.ma/?ref=dealna', tag: 'new', expiresAt: exp(21), aiScore: 84 },
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

module.exports = router;
