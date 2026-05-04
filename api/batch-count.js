require('dotenv').config({ path: '.env.local' });
const Stripe = require('stripe');

// Off Script Batch 001 size and pre-launch units (friends & family).
const BATCH_TOTAL = 500;
const PRELAUNCH_UNITS = 7;
const SIX_MONTHS_SECONDS = 180 * 24 * 60 * 60;

// 8-minute in-memory cache. Vercel keeps the function warm across invocations
// long enough that this meaningfully reduces Stripe API load.
let CACHE = { ts: 0, value: null };
const CACHE_TTL_MS = 8 * 60 * 1000;

function corsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowed = [
    process.env.LANDING_PAGE_URL,
    process.env.LANDING_PAGE_URL?.replace('https://', 'https://www.'),
    'http://localhost:8000',
    'http://localhost:3000',
  ];
  if (origin && (allowed.includes(origin) || origin.includes('localhost') || origin.includes('vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// Build the set of price IDs that count as "Off Script" subscriptions.
// We deliberately filter by price ID rather than product ID so the count is
// scoped exactly to the SKUs sold from this site (not e.g. test products).
function offScriptPriceIds() {
  return [
    process.env.PRICE_MONTHLY,
    process.env.PRICE_QUARTERLY,
    process.env.PRICE_BIANNUAL,
  ].filter(Boolean);
}

async function listAllSubscriptions(stripe, status) {
  const items = [];
  let starting_after;
  // Cap pagination at 50 pages (5000 subs) to avoid runaway loops.
  for (let page = 0; page < 50; page++) {
    const subs = await stripe.subscriptions.list({
      status,
      limit: 100,
      ...(starting_after && { starting_after }),
    });
    items.push(...subs.data);
    if (!subs.has_more || subs.data.length === 0) break;
    starting_after = subs.data[subs.data.length - 1].id;
  }
  return items;
}

async function countSubscriptions(stripe) {
  const priceIds = new Set(offScriptPriceIds());
  if (priceIds.size === 0) {
    throw new Error('No Off Script price IDs configured');
  }

  const subs = [
    ...(await listAllSubscriptions(stripe, 'active')),
    ...(await listAllSubscriptions(stripe, 'past_due')),
  ];

  const sixMonthsAgo = Math.floor(Date.now() / 1000) - SIX_MONTHS_SECONDS;
  let claimed = 0;
  let sixMonthUsers = 0;

  for (const sub of subs) {
    const matches = sub.items?.data?.some((item) => priceIds.has(item.price?.id));
    if (!matches) continue;
    claimed++;
    if (sub.created && sub.created < sixMonthsAgo) sixMonthUsers++;
  }

  // Also include single-bottle one-time purchases. These aren't subscriptions
  // but they did "claim a bottle" from Batch 001, so they belong in the count.
  if (process.env.PRICE_SINGLE) {
    let starting_after;
    for (let page = 0; page < 50; page++) {
      const sessions = await stripe.checkout.sessions.list({
        limit: 100,
        status: 'complete',
        ...(starting_after && { starting_after }),
      });
      for (const s of sessions.data) {
        if (s.metadata?.tier === 'single') claimed++;
      }
      if (!sessions.has_more || sessions.data.length === 0) break;
      starting_after = sessions.data[sessions.data.length - 1].id;
    }
  }

  return {
    claimed: claimed + PRELAUNCH_UNITS,
    sixMonthUsers,
    total: BATCH_TOTAL,
  };
}

module.exports = async (req, res) => {
  corsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Serve from cache when fresh.
  if (CACHE.value && Date.now() - CACHE.ts < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ ...CACHE.value, cached: true });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const value = await countSubscriptions(stripe);
    CACHE = { ts: Date.now(), value };
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json(value);
  } catch (error) {
    console.error('batch-count error:', error);
    // Graceful fallback so the frontend can still render the section.
    return res.status(200).json({
      claimed: null,
      sixMonthUsers: null,
      total: BATCH_TOTAL,
      error: 'unavailable',
    });
  }
};
