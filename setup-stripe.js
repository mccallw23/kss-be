// Run from be/ directory: node setup-stripe.js
// Requires STRIPE_SECRET_KEY as an env var or passed inline:
//   STRIPE_SECRET_KEY=sk_test_xxx node setup-stripe.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = [
  {
    label: 'PRICE_SINGLE',
    name: 'Kitchen Sink Sender, Single Bottle',
    description: 'One 30 mL bottle. Six studied ingredients for scalp and follicle health. Approximately a 30-day supply.',
    price: 8400, // cents
    recurring: null,
  },
  {
    label: 'PRICE_MONTHLY',
    name: 'Kitchen Sink Sender, The Protocol',
    description: '30 mL bottle shipped every 30 days. Free 0.5mm derma roller with your first order. Skip or cancel anytime.',
    price: 6800,
    recurring: { interval: 'month', interval_count: 1 },
  },
  {
    label: 'PRICE_QUARTERLY',
    name: 'Kitchen Sink Sender, The Protocol (3-Month)',
    description: '30 mL bottle shipped every 30 days, billed quarterly. Free derma roller with first order. Save 9%.',
    price: 18600,
    recurring: { interval: 'month', interval_count: 3 },
  },
  {
    label: 'PRICE_BIANNUAL',
    name: 'Kitchen Sink Sender, The Protocol (6-Month)',
    description: '30 mL bottle shipped every 30 days, billed every 6 months. Free derma roller with first order. Save 20%.',
    price: 32400,
    recurring: { interval: 'month', interval_count: 6 },
  },
  {
    label: 'PRICE_KIT',
    name: 'Kitchen Sink Sender, Six-Month Kit',
    description: 'Six 30 mL bottles, derma roller (0.5mm), dropper kit, and printed protocol card. Ships immediately. Not auto-renewing.',
    price: 32600,
    recurring: null,
  },
];

async function main() {
  console.log('Creating products and prices in Stripe...\n');

  const results = [];

  for (const item of PRODUCTS) {
    const product = await stripe.products.create({
      name: item.name,
      description: item.description,
      // If you want to add an image, uncomment and add your hosted image URL:
      // images: ['https://kitchensinksender.com/bottle.png'],
    });

    const priceParams = {
      product: product.id,
      unit_amount: item.price,
      currency: 'usd',
    };

    if (item.recurring) {
      priceParams.recurring = item.recurring;
    }

    const price = await stripe.prices.create(priceParams);

    results.push({ label: item.label, priceId: price.id, productId: product.id });

    console.log(`${item.label}=${price.id}`);
    console.log(`  Product: ${product.id} (${item.name})\n`);
  }

  console.log('\n--- Copy these into your Vercel env vars ---\n');
  for (const r of results) {
    console.log(`${r.label}=${r.priceId}`);
  }

  console.log('\n--- Also register the webhook ---\n');

  const webhook = await stripe.webhookEndpoints.create({
    url: process.env.WEBHOOK_URL || 'https://kss-be.vercel.app/api/webhooks',
    enabled_events: [
      'checkout.session.completed',
      'invoice.paid',
      'invoice.payment_failed',
      'customer.subscription.deleted',
    ],
  });

  console.log(`STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
  console.log(`  Endpoint: ${webhook.url}`);
  console.log(`  ID: ${webhook.id}\n`);

  console.log('\n--- Full env block (copy/paste into Vercel) ---\n');
  for (const r of results) {
    console.log(`${r.label}=${r.priceId}`);
  }
  console.log(`STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
  console.log(`LANDING_PAGE_URL=https://kitchensinksender.com`);
  console.log(`STRIPE_SECRET_KEY=${process.env.STRIPE_SECRET_KEY}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
