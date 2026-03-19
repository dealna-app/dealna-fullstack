require('dotenv').config();

// Simple cron scheduler - runs scraper every 24 hours
const INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in ms

async function runScraper() {
  console.log('⏰ Cron: Running scraper at', new Date().toLocaleString());
  try {
    const { execSync } = require('child_process');
    execSync('node scripts/scraper.js', { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Cron scraper error:', e.message);
  }
}

// Run immediately on start
runScraper();

// Then run every 24 hours
setInterval(runScraper, INTERVAL);

console.log('✅ Cron scheduler started — scraper runs every 24 hours');