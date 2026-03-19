// ── seed-deals.js ──────────────────────────────────────────
// Adds 50+ realistic Morocco deals WITHOUT wiping the database.
// Run ONCE: node scripts/seed-deals.js
// ───────────────────────────────────────────────────────────
require('dotenv').config();
const mongoose = require('mongoose');
const Deal  = require('../models/Deal');
const Store = require('../models/Store');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Get store IDs
  const stores = await Store.find({});
  const S = {};
  stores.forEach(s => { S[s.name] = s._id; });
  console.log('Stores found:', Object.keys(S).join(', '));

  const exp = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const NEW_DEALS = [
    // ── JUMIA MAROC ──────────────────────────────────────────
    { title: 'Samsung Galaxy A15 — 45% OFF', description: 'Écran AMOLED 6.5", 4GB RAM, 128GB stockage. Idéal pour le quotidien.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-SAM15', discountType: 'percentage', discountValue: 45, discountDisplay: '45% OFF', originalPrice: '1,799 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(25), aiScore: 91 },
    { title: 'Xiaomi Redmi Buds 4 — 38% OFF', description: 'Écouteurs sans fil avec réduction de bruit active. Autonomie 28h.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-BUDS4', discountType: 'percentage', discountValue: 38, discountDisplay: '38% OFF', originalPrice: '349 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'new', expiresAt: exp(20), aiScore: 84 },
    { title: 'Hisense Smart TV 43" — 30% OFF', description: 'TV LED 4K UHD, Android TV, WiFi intégré. Livraison gratuite Casablanca.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-TV43', discountType: 'percentage', discountValue: 30, discountDisplay: '30% OFF', originalPrice: '3,499 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(15), aiScore: 89 },
    { title: 'Blender Tefal — 55% OFF', description: 'Blender puissant 800W, 1.5L, idéal smoothies et soupes.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-BLEND', discountType: 'percentage', discountValue: 55, discountDisplay: '55% OFF', originalPrice: '399 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(10), aiScore: 80 },
    { title: 'Adidas Running Shoes — 40% OFF', description: 'Chaussures de course légères, semelle amortissante. Tailles 38-46.', store: S['Jumia Maroc'], category: 'Fashion', promoCode: 'JUMIA-ADIDAS', discountType: 'percentage', discountValue: 40, discountDisplay: '40% OFF', originalPrice: '799 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 86 },
    { title: 'L\'Oréal Elvive Shampoo Pack — 35% OFF', description: 'Pack 3 shampoings réparateurs pour cheveux abîmés.', store: S['Jumia Maroc'], category: 'Beauty', promoCode: 'JUMIA-LOREAL', discountType: 'percentage', discountValue: 35, discountDisplay: '35% OFF', originalPrice: '189 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'new', expiresAt: exp(18), aiScore: 78 },
    { title: 'Matelas Simmons 140x190 — 50% OFF', description: 'Matelas à ressorts ensachés, fermeté moyenne. Livraison incluse.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-MAT', discountType: 'percentage', discountValue: 50, discountDisplay: '50% OFF', originalPrice: '2,800 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(12), aiScore: 83 },
    { title: 'Friteuse sans huile Philips — 42% OFF', description: 'Air Fryer 4.1L, 7 programmes automatiques, facile à nettoyer.', store: S['Jumia Maroc'], category: 'Electronics', promoCode: 'JUMIA-AIRFRY', discountType: 'percentage', discountValue: 42, discountDisplay: '42% OFF', originalPrice: '1,299 MAD', affiliateUrl: 'https://jumia.ma/?ref=dealna', tag: 'hot', expiresAt: exp(22), aiScore: 87 },

    // ── GLOVO ────────────────────────────────────────────────
    { title: 'Livraison gratuite ce weekend', description: 'Livraison offerte sur toutes les commandes supérieures à 80 MAD. Casablanca & Rabat uniquement.', store: S['Glovo Morocco'], category: 'Food', promoCode: 'GLOVOFREE', discountType: 'free_shipping', discountDisplay: 'Livraison Gratuite', affiliateUrl: 'https://glovoapp.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(3), aiScore: 92 },
    { title: '15 MAD de réduction sur votre commande', description: 'Valable sur toutes les commandes de plus de 120 MAD via l\'app Glovo.', store: S['Glovo Morocco'], category: 'Food', promoCode: 'GLOVO15', discountType: 'fixed', discountValue: 15, discountDisplay: '15 MAD OFF', originalPrice: '120 MAD min', affiliateUrl: 'https://glovoapp.com/ma/?ref=dealna', tag: 'new', expiresAt: exp(7), aiScore: 85 },

    // ── PIZZA HUT ────────────────────────────────────────────
    { title: 'Maxi Deal — 2 Pizzas + Dessert', description: '2 grandes pizzas au choix + 1 dessert pour seulement 149 MAD. Valable en ligne.', store: S['Pizza Hut Maroc'], category: 'Food', promoCode: 'MAXI149', discountType: 'fixed', discountValue: 149, discountDisplay: '149 MAD', affiliateUrl: 'https://pizzahut.ma/?ref=dealna', tag: 'hot', expiresAt: exp(14), aiScore: 90 },
    { title: 'Family Box — 20% OFF', description: 'La Family Box inclut 2 pizzas L, 4 boissons et 1 dessert. Réduction exclusive Dealna.', store: S['Pizza Hut Maroc'], category: 'Food', promoCode: 'FAMILY20', discountType: 'percentage', discountValue: 20, discountDisplay: '20% OFF', affiliateUrl: 'https://pizzahut.ma/?ref=dealna', tag: 'verified', expiresAt: exp(21), aiScore: 82 },

    // ── ZARA ─────────────────────────────────────────────────
    { title: 'Robes d\'été — jusqu\'à 50% OFF', description: 'Collection printemps-été. Robes légères, tops et jeans en promotion.', store: S['Zara Morocco'], category: 'Fashion', promoCode: null, discountType: 'percentage', discountValue: 50, discountDisplay: '50% OFF', affiliateUrl: 'https://zara.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(20), aiScore: 88 },
    { title: 'Vestes homme -30%', description: 'Vestes casual et formelles de la nouvelle collection. Livraison en 48h.', store: S['Zara Morocco'], category: 'Fashion', promoCode: 'ZARAJKT', discountType: 'percentage', discountValue: 30, discountDisplay: '30% OFF', affiliateUrl: 'https://zara.com/ma/?ref=dealna', tag: 'new', expiresAt: exp(28), aiScore: 79 },

    // ── H&M ─────────────────────────────────────────────────
    { title: 'Vêtements enfants — 25% OFF', description: 'Collection kids printemps : t-shirts, pantalons, robes. Tailles 2-14 ans.', store: S['H&M Morocco'], category: 'Fashion', promoCode: 'HMKIDS25', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', affiliateUrl: 'https://hm.com/ma/?ref=dealna', tag: 'new', expiresAt: exp(25), aiScore: 76 },
    { title: 'Basiques été — 3 pour 2', description: 'Achetez 3 articles de la collection basiques, payez en 2. T-shirts, shorts, robes.', store: S['H&M Morocco'], category: 'Fashion', promoCode: 'HM3POUR2', discountType: 'bogo', discountDisplay: '3 pour 2', affiliateUrl: 'https://hm.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(18), aiScore: 83 },
    { title: 'Livraison gratuite dès 300 MAD', description: 'Commandez pour 300 MAD ou plus et profitez de la livraison à domicile offerte.', store: S['H&M Morocco'], category: 'Fashion', promoCode: 'HMSHIP', discountType: 'free_shipping', discountDisplay: 'Livraison Gratuite', affiliateUrl: 'https://hm.com/ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 72 },

    // ── NOCIBÉ ──────────────────────────────────────────────
    { title: 'Parfum Lancôme La Vie est Belle — 25% OFF', description: 'Eau de parfum 75ml. Best-seller mondial maintenant disponible au Maroc.', store: S['Nocibé Maroc'], category: 'Beauty', promoCode: 'NOCIBE-LVB', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', originalPrice: '899 MAD', affiliateUrl: 'https://nocibe.ma/?ref=dealna', tag: 'hot', expiresAt: exp(15), aiScore: 90 },
    { title: 'Routine soin visage — Kit complet -40%', description: 'Nettoyant + sérum + hydratant. Routine complète pour peau mixte.', store: S['Nocibé Maroc'], category: 'Beauty', promoCode: 'NOCIBE-KIT', discountType: 'percentage', discountValue: 40, discountDisplay: '40% OFF', originalPrice: '650 MAD', affiliateUrl: 'https://nocibe.ma/?ref=dealna', tag: 'new', expiresAt: exp(20), aiScore: 86 },
    { title: 'Mascara Maybelline — 2+1 gratuit', description: 'Achetez 2 mascaras Maybelline, le 3ème est offert. Large choix de teintes.', store: S['Nocibé Maroc'], category: 'Beauty', promoCode: 'NOCIBE-MASC', discountType: 'bogo', discountDisplay: '2+1 Gratuit', affiliateUrl: 'https://nocibe.ma/?ref=dealna', tag: 'verified', expiresAt: exp(12), aiScore: 81 },

    // ── MAC MOROCCO ──────────────────────────────────────────
    { title: 'Rouge à lèvres MAC — 20% OFF', description: 'Collection complète des rouges à lèvres MAC. Plus de 100 teintes disponibles.', store: S['Mac Morocco'], category: 'Beauty', promoCode: 'MACLIP20', discountType: 'percentage', discountValue: 20, discountDisplay: '20% OFF', affiliateUrl: 'https://maccosmetics.ma/?ref=dealna', tag: 'new', expiresAt: exp(22), aiScore: 80 },
    { title: 'Foundation Studio Fix — 15% OFF', description: 'Fond de teint longue tenue SPF15. 40 teintes pour toutes les carnations.', store: S['Mac Morocco'], category: 'Beauty', promoCode: 'MACFIX15', discountType: 'percentage', discountValue: 15, discountDisplay: '15% OFF', affiliateUrl: 'https://maccosmetics.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 77 },

    // ── ROYAL AIR MAROC ──────────────────────────────────────
    { title: 'Casa → Paris dès 1,299 MAD', description: 'Vols directs Casablanca-Paris. Réservez avant le 31 mars pour voyager en avril-mai.', store: S['Royal Air Maroc'], category: 'Travel', promoCode: 'RAM-CDG', discountType: 'fixed', discountValue: 1299, discountDisplay: 'dès 1,299 MAD', affiliateUrl: 'https://royalairmaroc.com/?ref=dealna', tag: 'hot', expiresAt: exp(18), aiScore: 93 },
    { title: 'Casa → Madrid dès 899 MAD', description: 'Vol aller-retour Casablanca-Madrid. Bagages inclus. Départ flexible.', store: S['Royal Air Maroc'], category: 'Travel', promoCode: 'RAM-MAD', discountType: 'fixed', discountValue: 899, discountDisplay: 'dès 899 MAD', affiliateUrl: 'https://royalairmaroc.com/?ref=dealna', tag: 'verified', expiresAt: exp(25), aiScore: 89 },
    { title: 'Vol intérieur Maroc — 30% OFF', description: 'Toutes destinations intérieures : Marrakech, Fès, Agadir, Oujda. Offre limitée.', store: S['Royal Air Maroc'], category: 'Travel', promoCode: 'RAM-DOM30', discountType: 'percentage', discountValue: 30, discountDisplay: '30% OFF', affiliateUrl: 'https://royalairmaroc.com/?ref=dealna', tag: 'hot', expiresAt: exp(10), aiScore: 91 },

    // ── OUIBUS ───────────────────────────────────────────────
    { title: 'Casa → Marrakech dès 45 MAD', description: 'Trajet confortable en bus climatisé. Départs toutes les heures depuis Casablanca.', store: S['Ouibus Maroc'], category: 'Travel', promoCode: 'OUIBUS-CMK', discountType: 'fixed', discountValue: 45, discountDisplay: 'dès 45 MAD', affiliateUrl: 'https://ouibus.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 82 },
    { title: 'Pass weekend illimité — 99 MAD', description: 'Voyagez autant que vous voulez en bus ce weekend. Valable vendredi-dimanche.', store: S['Ouibus Maroc'], category: 'Travel', promoCode: 'OUIBUS-WE', discountType: 'fixed', discountValue: 99, discountDisplay: '99 MAD', affiliateUrl: 'https://ouibus.ma/?ref=dealna', tag: 'hot', expiresAt: exp(5), aiScore: 85 },

    // ── SOUQ.COM ─────────────────────────────────────────────
    { title: 'iPhone 13 reconditionné — 25% OFF', description: 'iPhone 13 128GB reconditionné certifié. Garantie 1 an incluse.', store: S['Souq.com'], category: 'Electronics', promoCode: 'SOUQ-IP13', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', originalPrice: '5,200 MAD', affiliateUrl: 'https://souq.com/ma/?ref=dealna', tag: 'hot', expiresAt: exp(20), aiScore: 88 },
    { title: 'Laptop HP 15" — 20% OFF', description: 'Intel Core i5, 8GB RAM, 512GB SSD. Idéal études et travail.', store: S['Souq.com'], category: 'Electronics', promoCode: 'SOUQ-HP15', discountType: 'percentage', discountValue: 20, discountDisplay: '20% OFF', originalPrice: '6,499 MAD', affiliateUrl: 'https://souq.com/ma/?ref=dealna', tag: 'verified', expiresAt: exp(28), aiScore: 84 },
    { title: 'Tablette Samsung Galaxy Tab A8 — 35% OFF', description: 'Écran 10.5", WiFi, 64GB. Parfait pour famille et enfants.', store: S['Souq.com'], category: 'Electronics', promoCode: 'SOUQ-TABA8', discountType: 'percentage', discountValue: 35, discountDisplay: '35% OFF', originalPrice: '2,999 MAD', affiliateUrl: 'https://souq.com/ma/?ref=dealna', tag: 'new', expiresAt: exp(15), aiScore: 81 },

    // ── L'BRICOLE ────────────────────────────────────────────
    { title: 'Tapis berbère fait main — 20% OFF', description: 'Tapis traditionnel du Haut-Atlas, 100% laine naturelle. Dimensions 120x180cm.', store: S["L'bricole"], category: 'Local', promoCode: 'LBRI-TAPIS', discountType: 'percentage', discountValue: 20, discountDisplay: '20% OFF', originalPrice: '1,200 MAD', affiliateUrl: 'https://lbricole.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 79 },
    { title: 'Set céramique de Fès — 30% OFF', description: 'Service à thé en céramique bleue de Fès. 12 pièces, peint à la main.', store: S["L'bricole"], category: 'Local', promoCode: 'LBRI-FES', discountType: 'percentage', discountValue: 30, discountDisplay: '30% OFF', originalPrice: '650 MAD', affiliateUrl: 'https://lbricole.ma/?ref=dealna', tag: 'hot', expiresAt: exp(25), aiScore: 75 },
    { title: 'Argan Oil Bio 100ml — 25% OFF', description: 'Huile d\'argan pure biologique du Souss. Idéale peau, cheveux et ongles.', store: S["L'bricole"], category: 'Local', promoCode: 'LBRI-ARGAN', discountType: 'percentage', discountValue: 25, discountDisplay: '25% OFF', originalPrice: '220 MAD', affiliateUrl: 'https://lbricole.ma/?ref=dealna', tag: 'new', expiresAt: exp(20), aiScore: 77 },
    { title: 'Babouches cuir artisanales — 2 paires -40%', description: 'Babouches traditionnelles en cuir véritable. Couleurs: beige, rouge, noir.', store: S["L'bricole"], category: 'Local', promoCode: 'LBRI-BAB2', discountType: 'percentage', discountValue: 40, discountDisplay: '40% OFF', affiliateUrl: 'https://lbricole.ma/?ref=dealna', tag: 'hot', expiresAt: exp(15), aiScore: 80 },

    // ── HAMMAM ZWIN ──────────────────────────────────────────
    { title: 'Forfait gommage + massage — 199 MAD', description: 'Gommage traditionnel au savon beldi + massage aux huiles essentielles. 90 minutes.', store: S['Hammam Zwin'], category: 'Local', promoCode: 'ZWIN-GM', discountType: 'fixed', discountValue: 199, discountDisplay: '199 MAD', affiliateUrl: 'https://hammamzwin.ma/?ref=dealna', tag: 'hot', expiresAt: exp(14), aiScore: 88 },
    { title: 'Séance hammam couple — 30% OFF', description: 'Expérience hammam privée pour 2 personnes. Idéal cadeau. Sur réservation.', store: S['Hammam Zwin'], category: 'Local', promoCode: 'ZWIN-CPL', discountType: 'percentage', discountValue: 30, discountDisplay: '30% OFF', originalPrice: '480 MAD', affiliateUrl: 'https://hammamzwin.ma/?ref=dealna', tag: 'new', expiresAt: exp(21), aiScore: 84 },
    { title: 'Abonnement mensuel hammam — 499 MAD', description: '4 séances par mois + 10% sur les soins. Le luxe du hammam à prix maîtrisé.', store: S['Hammam Zwin'], category: 'Local', promoCode: 'ZWIN-ABO', discountType: 'fixed', discountValue: 499, discountDisplay: '499 MAD/mois', affiliateUrl: 'https://hammamzwin.ma/?ref=dealna', tag: 'verified', expiresAt: exp(30), aiScore: 76 },
  ];

  let added = 0;
  let skipped = 0;

  for (const d of NEW_DEALS) {
    if (!d.store) {
      console.log(`  Skipping (store not found): ${d.title}`);
      skipped++;
      continue;
    }
    const exists = await Deal.findOne({ title: d.title, store: d.store });
    if (exists) {
      console.log(`  Already exists: ${d.title}`);
      skipped++;
      continue;
    }
    await Deal.create({
      ...d,
      isActive: true,
      isFeatured: d.aiScore >= 90,
      icon: '🏷️',
      analytics: { clicks: Math.floor(Math.random()*800)+50, saves: Math.floor(Math.random()*60)+5 }
    });
    console.log(`  Added: ${d.title}`);
    added++;
  }

  console.log(`\nDone! Added ${added} new deals, skipped ${skipped}.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });