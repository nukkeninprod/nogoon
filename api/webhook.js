import Stripe from 'stripe';

// Vercel: disable automatic body parsing so we can read the raw body
// needed for Stripe signature verification.
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/** Read the raw request body as a Buffer. */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Send a post-purchase email via Resend. */
async function sendPurchaseEmail(toEmail, sessionId) {
  const macCmd = `curl -sL "https://nogoon.io/api/go?s=${sessionId}&os=mac" | sudo bash`;
  const winCmd = `irm "https://nogoon.io/api/go?s=${sessionId}&os=win" | iex`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your nogoon install command</title>
</head>
<body style="margin:0;padding:0;background:#0B1120;font-family:'Inter',-apple-system,sans-serif;color:#fafafa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Brand -->
        <tr><td align="center" style="padding-bottom:28px;">
          <a href="https://nogoon.io" style="text-decoration:none;display:inline-flex;align-items:baseline;gap:2px;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:22px;color:#fff;">no</span><span style="font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:22px;background:#A1EAFB;color:#000;padding:2px 4px;border-radius:6px;">goon</span>
          </a>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#111827;border:1px solid rgba(161,234,251,0.15);border-radius:16px;padding:36px 32px;">

          <!-- Check icon -->
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:20px;">
            <div style="width:52px;height:52px;border-radius:50%;border:2px solid #A1EAFB;background:rgba(161,234,251,0.1);display:inline-flex;align-items:center;justify-content:center;font-size:22px;line-height:52px;text-align:center;">✓</div>
          </td></tr></table>

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;text-align:center;">Payment confirmed.</h1>
          <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;text-align:center;">Paste one of these commands in your terminal. Porn is blocked permanently.</p>

          <!-- macOS -->
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#A1EAFB;letter-spacing:0.08em;text-transform:uppercase;">macOS</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr><td style="background:#0B1120;border:1px solid rgba(161,234,251,0.15);border-radius:10px;padding:14px 16px;">
            <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Open Terminal (⌘ Space → "Terminal"), paste &amp; press Enter:</p>
            <code style="font-family:'JetBrains Mono','Courier New',monospace;font-size:12px;color:#A1EAFB;word-break:break-all;">${macCmd}</code>
          </td></tr></table>
          <p style="margin:0 0 24px;font-size:12px;color:#94a3b8;">Type your password when prompted (invisible — that's normal) then Enter.</p>

          <!-- Windows -->
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#A1EAFB;letter-spacing:0.08em;text-transform:uppercase;">Windows</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr><td style="background:#0B1120;border:1px solid rgba(161,234,251,0.15);border-radius:10px;padding:14px 16px;">
            <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Right-click Start → Terminal (Admin), paste &amp; press Enter:</p>
            <code style="font-family:'JetBrains Mono','Courier New',monospace;font-size:12px;color:#A1EAFB;word-break:break-all;">${winCmd}</code>
          </td></tr></table>
          <p style="margin:0 0 28px;font-size:12px;color:#94a3b8;">Type Y if asked and wait for the green "Done" message.</p>

          <!-- Warning -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background:rgba(161,234,251,0.05);border:1px solid rgba(161,234,251,0.15);border-radius:10px;padding:14px 16px;">
            <p style="margin:0;font-size:13px;color:#fafafa;">⚠&nbsp; <strong>One-time link.</strong> Each command works once. Save this email before running it.</p>
          </td></tr></table>

          <!-- Divider -->
          <hr style="border:none;border-top:1px solid rgba(161,234,251,0.1);margin:0 0 24px;">

          <!-- Support -->
          <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">Questions? Reply to this email or reach us at <a href="mailto:support@nogoon.io" style="color:#A1EAFB;text-decoration:none;">support@nogoon.io</a></p>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#475569;">nogoon.io &mdash; Permanent Porn Blocker</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    'Payment confirmed — Your nogoon install command',
    '═══════════════════════════════════════════════',
    '',
    '⚠  This command can only be used ONCE. Save this email.',
    '',
    '── macOS ──────────────────────────────────────',
    '1. Open Terminal (⌘ Space → "Terminal")',
    '2. Paste the command below and press Enter',
    '3. Type your password (invisible) → Enter',
    '',
    macCmd,
    '',
    '── Windows ────────────────────────────────────',
    '1. Right-click Start → Terminal (Admin)',
    '2. Paste the command below and press Enter',
    '3. Type Y if asked → wait for "Done"',
    '',
    winCmd,
    '',
    '═══════════════════════════════════════════════',
    'Questions? support@nogoon.io',
    '═══════════════════════════════════════════════',
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'nogoon <support@nogoon.io>',
      to: [toEmail],
      reply_to: 'support@nogoon.io',
      subject: 'Your nogoon install command — save this',
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email;

    if (!email) {
      console.warn('checkout.session.completed: no customer email, skipping email send');
      return res.status(200).json({ received: true });
    }

    try {
      await sendPurchaseEmail(email, session.id);
      console.log(`Purchase email sent to ${email} for session ${session.id}`);
    } catch (err) {
      // Log but don't fail — Stripe will retry if we return 5xx
      console.error('Failed to send purchase email:', err.message);
      return res.status(500).json({ error: 'Email send failed' });
    }
  }

  return res.status(200).json({ received: true });
}
