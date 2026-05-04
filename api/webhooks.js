const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Disable body parsing — we need the raw body for signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Helper to get raw body
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('Missing signature or webhook secret');
    return res.status(400).json({ error: 'Missing signature' });
  }

  let event;
  let rawBody;

  try {
    rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  console.log(`Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Checkout completed:', {
          sessionId: session.id,
          customerEmail: session.customer_details?.email,
          amountTotal: session.amount_total,
          currency: session.currency,
          mode: session.mode,
          metadata: session.metadata,
          shippingAddress: session.shipping_details?.address,
        });

        // TODO: Send order confirmation email
        // await sendOrderConfirmation(session);

        // TODO: Notify yourself (Slack, email, etc.)
        // await notifySlack(`New order from ${session.customer_details?.email}`);

        // TODO: Create order in your fulfillment system
        // await createShipment(session);

        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log('Invoice paid:', {
          invoiceId: invoice.id,
          customerEmail: invoice.customer_email,
          amountPaid: invoice.amount_paid,
          subscriptionId: invoice.subscription,
        });

        // This fires for subscription renewals
        // TODO: Send renewal confirmation
        // TODO: Trigger fulfillment for subscription shipment

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log('Payment failed:', {
          invoiceId: invoice.id,
          customerEmail: invoice.customer_email,
          subscriptionId: invoice.subscription,
        });

        // TODO: Send payment failure email
        // TODO: Notify yourself to follow up

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log('Subscription canceled:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          canceledAt: subscription.canceled_at,
        });

        // TODO: Send cancellation confirmation
        // TODO: Update your records

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log('Subscription updated:', {
          subscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
        });

        // Useful for tracking upgrades/downgrades, pauses, etc.

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// ============================================================
// STUB FUNCTIONS — implement these based on your stack
// ============================================================

/*
async function sendOrderConfirmation(session) {
  // Using Resend, SendGrid, or similar:
  //
  // await resend.emails.send({
  //   from: 'Kitchen Sink Sender <orders@kitchensinksender.com>',
  //   to: session.customer_details.email,
  //   subject: 'Your KSS order is confirmed',
  //   html: `<p>Thanks for your order! ...</p>`,
  // });
}

async function notifySlack(message) {
  // await fetch(process.env.SLACK_WEBHOOK_URL, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ text: message }),
  // });
}

async function createShipment(session) {
  // Integrate with your fulfillment provider
  // ShipStation, ShipBob, EasyPost, etc.
}
*/
