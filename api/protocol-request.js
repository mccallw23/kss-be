require('dotenv').config({ path: '.env.local' });
const Stripe = require('stripe');

// Simple per-IP rate limit. In-memory only; resets when the function cold-starts.
// Good enough to deter casual scripted abuse; real protection would need Redis/KV.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const RATE = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = RATE.get(ip) || { hits: [], };
  entry.hits = entry.hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (entry.hits.length >= RATE_MAX) return true;
  entry.hits.push(now);
  RATE.set(ip, entry);
  return false;
}

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  corsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();

  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  try {
    const { email, honeypot, source } = req.body || {};

    // Bot trap: any value in the honeypot field means it's a bot. Return 200 so
    // they don't know they were caught.
    if (honeypot) return res.status(200).json({ ok: true });

    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Persist as a Stripe Customer so the data lives in the tool the founder
    // already uses. Filter the Stripe Customers list by `metadata.source =
    // protocol_request` to see this list. When a request-er later checks out,
    // Stripe will attach the subscription to this same customer record, giving
    // a clean funnel view: requested → subscribed.
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const metadata = {
        source: 'protocol_request',
        captured_at: new Date().toISOString(),
        batch: '001',
        // Where on the page the request came from — useful if we later add a
        // second capture point (e.g. footer, FAQ).
        capture_point: (source || 'landing').toString().slice(0, 64),
      };
      try {
        const existing = await stripe.customers.list({ email: cleanEmail, limit: 1 });
        if (existing.data.length > 0) {
          // Update only if not already tagged, so re-submits don't churn the
          // captured_at timestamp on a customer who already requested.
          const customer = existing.data[0];
          if (customer.metadata?.source !== 'protocol_request') {
            await stripe.customers.update(customer.id, {
              metadata: { ...customer.metadata, ...metadata },
            });
          }
        } else {
          await stripe.customers.create({ email: cleanEmail, metadata });
        }
      } catch (stripeErr) {
        // Swallow — we still log the request below so we don't lose it.
        console.error('Stripe customer write failed:', stripeErr.message);
      }
    }

    // TODO: when a list provider is chosen (Loops / Resend / Mailchimp / Beehiiv),
    // forward the email here and tag with `protocol-request`. For now the source
    // of truth is Stripe customers + Vercel logs.
    console.log('protocol_request', { email: cleanEmail, source: source || 'landing', ip });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('protocol-request error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
