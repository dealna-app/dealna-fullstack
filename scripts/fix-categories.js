require('dotenv').config();
const mongoose = require('mongoose');
const Deal = require('../models/Deal');

// Keywords to detect correct category from title/description
function detectCategory(title, description) {
  const text = (title + ' ' + description).toLowerCase();

  if (/pizza|burger|food|restaurant|livraison|repas|meal|sandwich|coffee|café|glovo|cuisine/.test(text)) return 'Food';
  if (/shirt|robe|tunique|veste|pantalon|jean|fashion|clothing|clothes|wear|dress|jacket|hoodie|capuche|defacto|zara|h&m|lcw/.test(text)) return 'Fashion';
  if (/phone|laptop|tablet|tv|ecran|ordinateur|electronic|xiaomi|samsung|apple|iphone|powerbank|power bank|réchaud|aspirateur|vacuum/.test(text)) return 'Electronics';
  if (/cream|serum|parfum|perfume|makeup|cosmetic|beauty|skincare|nivea|lip|baume|loreal|nocibe|mac /.test(text)) return 'Beauty';
  if (/flight|vol|hotel|travel|voyage|avion|ram|royal air|bus|train|ticket/.test(text)) return 'Travel';
  if (/hammam|artisan|local|moroccan|handcraft|maroc|souk/.test(text)) return 'Local';

  return null; // keep existing if no match
}

async function fixCategories() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find all Jumia deals with category Electronics
  const deals = await Deal.find({ category: 'Electronics' }).populate('store');

  console.log(`Found ${deals.length} Electronics deals to check...\n`);

  let fixed = 0;
  for (const deal of deals) {
    const newCategory = detectCategory(deal.title, deal.description || '');
    if (newCategory && newCategory !== 'Electronics') {
      console.log(`  Fixing: "${deal.title}" → ${newCategory}`);
      deal.category = newCategory;
      await deal.save();
      fixed++;
    }
  }

  console.log(`\nDone! Fixed ${fixed} deals.`);
  await mongoose.disconnect();
  process.exit(0);
}

fixCategories().catch(err => {
  console.error(err);
  process.exit(1);
});