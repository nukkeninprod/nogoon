import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'nogoon.io — Permanent porn block',
              description: 'One-time setup. macOS & Windows. No subscription.',
            },
            unit_amount: 2900, // $29.00
          },
          quantity: 1,
        },
      ],
      success_url: `${req.headers.origin || 'https://nogoon.io'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://nogoon.io'}/#buy`,
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
