import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    const requestUrl = new URL(req.url || '', baseUrl);
    const wantsJson = req.query?.json === '1' || requestUrl.searchParams.get('json') === '1';

    const checkoutParams = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Permanent Blocker Script',
              description: 'One-time setup. Block it permanently on macOS & Windows. No subscription. No app to manage. Just execute a script and it\'s done.',
              images: ['https://nogoon.io/page-success.png'],
            },
            unit_amount: 900, // $9.00
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/`,
    };

    // Omit payment_method_types so Stripe Checkout uses the payment methods
    // configured in the Dashboard. Fall back to card-only if Stripe rejects it.
    let paymentMethodsMode = 'dashboard';
    let session;
    try {
      session = await stripe.checkout.sessions.create(checkoutParams);
    } catch (dashboardErr) {
      paymentMethodsMode = 'card_fallback';
      console.warn('Dashboard payment methods failed; falling back to card:', dashboardErr.message);
      session = await stripe.checkout.sessions.create({
        ...checkoutParams,
        payment_method_types: ['card'],
      });
    }

    if (wantsJson) {
      res.status(200).json({ url: session.url, paymentMethodsMode });
      return;
    }

    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
