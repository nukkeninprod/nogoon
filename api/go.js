import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { join } from 'path';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const sessionId = req.query.s;
  const os = req.query.os || 'mac'; // 'mac' or 'win'

  if (!sessionId) {
    res.status(400).send('# Error: missing session ID\nexit 1\n');
    return;
  }

  try {
    // Verify with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Check payment succeeded
    if (session.payment_status !== 'paid') {
      res.status(403).send('# Error: payment not completed\nexit 1\n');
      return;
    }

    // Use the payment intent to track redemption
    const paymentIntentId = session.payment_intent;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Check if already redeemed
    if (paymentIntent.metadata?.redeemed === 'true') {
      res.status(403).send('# Error: this link has already been used.\n# Each purchase generates a single-use link.\n# Contact support@nogoon.io if you need help.\nexit 1\n');
      return;
    }

    // Mark as redeemed on the payment intent
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: { redeemed: 'true' },
    });

    // Serve the correct script
    const filename = os === 'win' ? 'go.ps1' : 'go.sh';
    const scriptPath = join(process.cwd(), 'public', filename);
    const script = readFileSync(scriptPath, 'utf-8');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(script);
  } catch (err) {
    if (err.type === 'StripeInvalidRequestError') {
      res.status(403).send('# Error: invalid session\nexit 1\n');
    } else {
      console.error(err);
      res.status(500).send('# Error: something went wrong. Contact support@nogoon.io\nexit 1\n');
    }
  }
}
