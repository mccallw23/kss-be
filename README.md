# KSS Stripe Backend

Two Vercel serverless functions for Stripe Checkout and webhooks.

## Quick Start

```bash
npm install
vercel dev        # local development
vercel --prod     # deploy to production
```

## Setup

### 1. Create Stripe Products

Go to [dashboard.stripe.com/products](https://dashboard.stripe.com/products) and create:

| Product | Price | Type |
|---------|-------|------|
| Single Bottle | $84.00 | One-time |
| The Protocol (Monthly) | $68.00 | Recurring / month |
| The Protocol (Quarterly) | $186.00 | Recurring / 3 months |
| The Protocol (6-Month) | $324.00 | Recurring / 6 months |
| Six-Month Kit | $326.00 | One-time |

Copy each Price ID (`price_...`).

### 2. Configure Stripe Branding

- [Branding settings](https://dashboard.stripe.com/settings/branding): Upload logo, set colors (`#E2A04A` accent, `#0E100E` background)
- [Checkout settings](https://dashboard.stripe.com/settings/checkout): Enable contact info, legal policies, ToS consent
- [Public details](https://dashboard.stripe.com/settings/public): Business name, support email

### 3. Environment Variables

Set these in [Vercel dashboard](https://vercel.com) → Project → Settings → Environment Variables:

```
STRIPE_SECRET_KEY=sk_test_...      # or sk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_...    # get this after registering webhook
LANDING_PAGE_URL=https://kitchensinksender.com
PRICE_SINGLE=price_...
PRICE_MONTHLY=price_...
PRICE_QUARTERLY=price_...
PRICE_BIANNUAL=price_...
PRICE_KIT=price_...
```

### 4. Register Webhook

Go to [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) → Add endpoint:

- **URL:** `https://your-vercel-url.vercel.app/api/webhooks`
- **Events:**
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`

Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

### 5. Wire Up Frontend

See `landing-page-snippet.js` for integration code. Add `data-checkout="tier"` attributes to your buy buttons.

## API Endpoints

### POST `/api/create-checkout-session`

Creates a Stripe Checkout session.

**Request:**
```json
{
  "tier": "monthly",
  "quantity": 1,
  "email": "customer@example.com",
  "utm_source": "google",
  "utm_campaign": "spring2026"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

### POST `/api/webhooks`

Receives Stripe webhook events. Do not call directly.

## Testing

1. Use test API keys (`sk_test_...`)
2. Test card: `4242 4242 4242 4242`, any future date, any CVC
3. Check Vercel logs: `vercel logs`

## Going Live

1. Create products in Stripe Live mode
2. Update environment variables with live keys and Price IDs
3. Create new webhook endpoint in Live mode
4. Redeploy: `vercel --prod`
