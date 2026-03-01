// Local test for the one-time script delivery flow
// Usage: STRIPE_SECRET_KEY=sk_test_... node test-local.js

import Stripe from 'stripe';
import http from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Import the handler logic inline
async function handleCheckout(req, res) {
  try {
    let price;
    const prices = await stripe.prices.list({ limit: 5, active: true });
    const existing = prices.data.find(p => p.unit_amount === 2900 && p.currency === 'usd');

    if (existing) {
      price = existing;
    } else {
      const product = await stripe.products.create({ name: 'nogoon.io — Permanent Porn Block' });
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: 2900,
        currency: 'usd',
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: price.id, quantity: 1 }],
      mode: 'payment',
      success_url: 'http://localhost:3456/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:3456/#buy',
    });

    res.writeHead(303, { Location: session.url });
    res.end();
    console.log(`→ Checkout session created, redirecting to Stripe...`);
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Failed to create checkout session');
  }
}

async function handleGo(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('s');
  const os = url.searchParams.get('os') || 'mac';

  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('# Error: missing session ID\nexit 1\n');
    return;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('# Error: payment not completed\nexit 1\n');
      return;
    }

    const paymentIntentId = session.payment_intent;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata?.redeemed === 'true') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('# Error: this link has already been used.\n# Each purchase generates a single-use link.\nexit 1\n');
      return;
    }

    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: { redeemed: 'true' },
    });

    const filename = os === 'win' ? 'go.ps1' : 'go.sh';
    const script = readFileSync(join(__dirname, 'public', filename), 'utf-8');

    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end(script);
    console.log(`✓ Script delivered (${filename}) — session marked as redeemed`);
  } catch (err) {
    console.error('Error:', err.message);
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('# Error: ' + err.message + '\nexit 1\n');
  }
}

// Serve static files + API
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/checkout')) {
    await handleCheckout(req, res);
  } else if (req.url.startsWith('/api/go')) {
    await handleGo(req, res);
  } else if (req.url.startsWith('/success')) {
    const html = readFileSync(join(__dirname, 'public', 'success.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(__dirname, 'public', 'index.html'), 'utf-8'));
  }
});

server.listen(3456, () => {
  console.log('\n🚀 Local test server running on http://localhost:3456');
  console.log('');
  console.log('  → Open http://localhost:3456 in your browser');
  console.log('  → Click "Buy permanent block"');
  console.log('  → Use card: 4242 4242 4242 4242');
  console.log('  → Any future date, any CVC, any zip');
  console.log('  → After payment, you\'ll land on /success with your command\n');
});
