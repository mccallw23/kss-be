/**
 * KSS Checkout Integration
 *
 * Paste this into your landing page (or include as a separate <script>).
 * Replace API_BASE with your actual Vercel deployment URL.
 *
 * This replaces the direct Stripe Payment Links with API calls
 * that go through your backend for better tracking and control.
 */

const API_BASE = 'https://kss-be.vercel.app'; // TODO: Replace with your actual URL

// Tier configuration (must match backend)
const TIERS = {
  single: { price: 84, label: 'Single Bottle' },
  monthly: { price: 68, label: 'Monthly Subscription' },
  quarterly: { price: 186, label: 'Quarterly Subscription' },
  biannual: { price: 324, label: '6-Month Subscription' },
  kit: { price: 326, label: '6-Month Kit' },
};

/**
 * Start a checkout session
 * @param {string} tier - One of: single, monthly, quarterly, biannual, kit
 * @param {object} options - Optional: { quantity, email }
 */
async function checkout(tier, options = {}) {
  const { quantity = 1, email } = options;

  // Collect UTM params from URL
  const urlParams = new URLSearchParams(window.location.search);
  const utm_source = urlParams.get('utm_source');
  const utm_campaign = urlParams.get('utm_campaign');

  try {
    const response = await fetch(`${API_BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier,
        quantity,
        email,
        utm_source,
        utm_campaign,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Checkout failed');
    }

    const { url } = await response.json();

    // Track checkout start in PostHog (if available)
    if (typeof posthog !== 'undefined') {
      posthog.capture('checkout_started', { tier, quantity });
    }

    // Redirect to Stripe Checkout
    window.location.href = url;
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Something went wrong. Please try again or email kitchensinksender@gmail.com');
  }
}

// Wire up buy buttons when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Find all elements with data-checkout attribute
  // Usage: <button data-checkout="monthly">Subscribe</button>
  document.querySelectorAll('[data-checkout]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const tier = button.dataset.checkout;
      const quantity = parseInt(button.dataset.quantity || '1', 10);
      checkout(tier, { quantity });
    });
  });

  // Also handle any existing buy.stripe.com links (for backwards compatibility)
  // These will be removed once the API is fully wired up
  document.querySelectorAll('a[href*="buy.stripe.com"]').forEach(link => {
    link.addEventListener('click', (e) => {
      // Log but don't prevent — let the direct link work as fallback
      console.warn('Direct Stripe link clicked. Consider migrating to data-checkout attribute.');
    });
  });
});

/**
 * Example usage in HTML:
 *
 * <button data-checkout="single">Buy One — $84</button>
 * <button data-checkout="monthly">Subscribe — $68/mo</button>
 * <button data-checkout="quarterly">Quarterly — $186/3mo</button>
 * <button data-checkout="biannual">6-Month — $324/6mo</button>
 * <button data-checkout="kit">6-Month Kit — $326</button>
 *
 * Or call checkout() directly:
 *
 * <button onclick="checkout('monthly')">Subscribe Now</button>
 */
