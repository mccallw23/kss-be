const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin;
  const allowedOrigin = process.env.LANDING_PAGE_URL;

  if (origin === allowedOrigin || origin?.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    return res.status(200).json({
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email,
      tier: session.metadata?.tier,
    });
  } catch (error) {
    console.error('Session status error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve session',
      message: error.message
    });
  }
};
