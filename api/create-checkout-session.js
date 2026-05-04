const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map tier names to Price IDs (set in Vercel environment variables)
const PRICE_MAP = {
  single: process.env.PRICE_SINGLE,
  monthly: process.env.PRICE_MONTHLY,
  quarterly: process.env.PRICE_QUARTERLY,
  biannual: process.env.PRICE_BIANNUAL,
  kit: process.env.PRICE_KIT,
};

// Which tiers are subscriptions vs one-time
const SUBSCRIPTION_TIERS = ['monthly', 'quarterly', 'biannual'];

module.exports = async (req, res) => {
  // CORS - allow both www and non-www, plus localhost
  const origin = req.headers.origin;
  const allowedOrigins = [
    process.env.LANDING_PAGE_URL,
    process.env.LANDING_PAGE_URL?.replace('https://', 'https://www.'),
    'http://localhost:8000',
    'http://localhost:3000',
  ];

  if (origin && (allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tier, quantity = 1, email, utm_source, utm_campaign } = req.body;

    // Validate tier
    if (!tier || !PRICE_MAP[tier]) {
      return res.status(400).json({
        error: 'Invalid tier',
        validTiers: Object.keys(PRICE_MAP)
      });
    }

    const priceId = PRICE_MAP[tier];
    const isSubscription = SUBSCRIPTION_TIERS.includes(tier);
    const landingPageUrl = process.env.LANDING_PAGE_URL || 'https://kitchensinksender.com';

    // Build metadata for tracking
    const metadata = {
      tier,
      ...(utm_source && { utm_source }),
      ...(utm_campaign && { utm_campaign }),
    };

    // Session configuration for redirect checkout
    const sessionConfig = {
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [
        {
          price: priceId,
          quantity: isSubscription ? 1 : quantity,
        },
      ],
      // Collect shipping address for physical product
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK', 'FI', 'IE', 'NZ'],
      },
      // Collect phone for shipping notifications
      phone_number_collection: {
        enabled: true,
      },
      // Require agreement to terms
      consent_collection: {
        terms_of_service: 'required',
      },
      // Custom text on checkout page
      custom_text: {
        submit: {
          message: 'Your order ships within 2-3 business days. You\'ll receive a confirmation email with tracking within 24 hours.',
        },
      },
      // Redirect URLs
      success_url: `${landingPageUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${landingPageUrl}/#buy`,
      // Metadata for webhooks
      metadata,
      // Prefill email if provided
      ...(email && { customer_email: email }),
      // Allow promotion codes
      allow_promotion_codes: true,
      // Billing address required for fraud prevention
      billing_address_collection: 'required',
    };

    // For subscriptions, add subscription-specific metadata
    if (isSubscription) {
      sessionConfig.subscription_data = {
        metadata,
      };
    } else {
      sessionConfig.payment_intent_data = {
        metadata,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    return res.status(500).json({
      error: 'Failed to create checkout session',
      message: error.message
    });
  }
};
