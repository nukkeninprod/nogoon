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
  const orderId = sessionId.slice(-8).toUpperCase();
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your Nogoon Order Receipt</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono&family=Inter:wght@400;500;600;700&display=swap');
    table, td, div, h1, h2, h3, p, span, a, strong, li, code {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    body { margin: 0; padding: 0; width: 100%; word-break: break-word; -webkit-font-smoothing: antialiased; background-color: #F9FAFB; }
    .email-container { width: 100%; max-width: 600px; margin: 0 auto; }
    @media screen and (max-width: 600px) {
      .content-wrapper { padding: 30px 20px !important; }
      .col-header { font-size: 11px !important; }
      .item-name { font-size: 13px !important; }
      .instruction-col { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
      .instruction-col-spacer { display: block !important; height: 24px !important; }
    }
    <!--[if mso]>
    <style>table, td {border-collapse: collapse;} body, table, td, h1, h2, h3, p, span, a, strong, li, code {font-family: Arial, sans-serif !important;}</style>
    <![endif]-->
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F9FAFB; color: #F3F4F6;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F9FAFB; width: 100%;">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <!-- Logo -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin-bottom: 24px;">
          <tr>
            <td align="center">
              <a href="https://nogoon.io" style="text-decoration: none; display: inline-block;">
                <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;"><tr>
                  <td style="font-family: Arial, Helvetica, sans-serif; font-size: 22px; font-weight: 900; color: #111827; vertical-align: middle; letter-spacing: -0.02em; padding: 0; line-height: 1;">n</td>
                  <td style="vertical-align: middle; padding: 0; line-height: 0;"><img src="https://nogoon.io/shield.png" width="22" height="22" alt="o" style="display: block;"></td>
                  <td style="font-family: Arial, Helvetica, sans-serif; font-size: 22px; font-weight: 900; color: #111827; vertical-align: middle; letter-spacing: -0.02em; padding: 0; line-height: 1;">goon</td>
                </tr></table>
              </a>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table role="presentation" class="email-container" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #111827; border: 1px solid rgba(161, 234, 251, 0.15); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
          <tr>
            <td class="content-wrapper" style="padding: 40px 40px;">

              <!-- Header -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #A1EAFB;">Payment Receipt</p>
                    <h1 style="margin: 4px 0 0 0; font-size: 22px; font-weight: 800; color: #FFFFFF;">Thank you for your purchase!</h1>
                  </td>
                </tr>
              </table>

              <!-- Order info -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px; background-color: #0B1120; border-radius: 10px; border: 1px solid rgba(161, 234, 251, 0.08);">
                <tr>
                  <td style="padding: 16px 20px;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="50%" style="padding-bottom: 8px;">
                          <span style="font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Order</span>
                          <strong style="font-size: 13px; color: #FFFFFF; font-weight: 600;">#${orderId}</strong>
                        </td>
                        <td width="50%" align="right" style="padding-bottom: 8px;">
                          <span style="font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Date</span>
                          <strong style="font-size: 13px; color: #FFFFFF; font-weight: 600;">${date}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td width="50%" style="padding-top: 8px; border-top: 1px solid rgba(161, 234, 251, 0.05);">
                          <span style="font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Payment method</span>
                          <strong style="font-size: 13px; color: #FFFFFF; font-weight: 600;">Credit card (Stripe)</strong>
                        </td>
                        <td width="50%" align="right" style="padding-top: 8px; border-top: 1px solid rgba(161, 234, 251, 0.05);">
                          <span style="font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Status</span>
                          <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #2DD4BF; background-color: rgba(45, 212, 191, 0.1); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(45, 212, 191, 0.2);">Paid</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Items table -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <thead>
                  <tr>
                    <th class="col-header" align="left" style="padding-bottom: 8px; border-bottom: 1px solid rgba(161, 234, 251, 0.15); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9CA3AF;">Description</th>
                    <th class="col-header" align="center" style="padding-bottom: 8px; border-bottom: 1px solid rgba(161, 234, 251, 0.15); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9CA3AF; width: 60px;">Qty</th>
                    <th class="col-header" align="right" style="padding-bottom: 8px; border-bottom: 1px solid rgba(161, 234, 251, 0.15); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9CA3AF; width: 80px;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="item-name" style="padding: 16px 0; border-bottom: 1px solid rgba(161, 234, 251, 0.05); font-size: 14px; color: #FFFFFF; font-weight: 500;">
                      Nogoon — Permanent porn blocking script<br>
                      <span style="font-size: 12px; color: #9CA3AF; font-weight: 400;">Lifetime license (single device)</span>
                    </td>
                    <td align="center" style="padding: 16px 0; border-bottom: 1px solid rgba(161, 234, 251, 0.05); font-size: 14px; color: #9CA3AF;">1</td>
                    <td align="right" style="padding: 16px 0; border-bottom: 1px solid rgba(161, 234, 251, 0.05); font-size: 14px; color: #FFFFFF; font-weight: 600;">9,00 $</td>
                  </tr>
                  <tr>
                    <td colspan="2" align="right" style="padding: 16px 0 8px 0; font-size: 13px; color: #9CA3AF;">Subtotal</td>
                    <td align="right" style="padding: 16px 0 8px 0; font-size: 13px; color: #FFFFFF;">$9.00</td>
                  </tr>
                  <tr>
                    <td colspan="2" align="right" style="padding: 0 0 12px 0; font-size: 13px; color: #9CA3AF;">Tax (VAT)</td>
                    <td align="right" style="padding: 0 0 12px 0; font-size: 13px; color: #FFFFFF;">$0.00</td>
                  </tr>
                  <tr>
                    <td colspan="2" align="right" style="padding: 12px 0 0 0; border-top: 1px solid rgba(161, 234, 251, 0.15); font-size: 14px; font-weight: 700; color: #FFFFFF;">Total paid</td>
                    <td align="right" style="padding: 12px 0 0 0; border-top: 1px solid rgba(161, 234, 251, 0.15); font-size: 16px; font-weight: 800; color: #A1EAFB;">$9.00 USD</td>
                  </tr>
                </tbody>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr><td style="border-top: 1px solid rgba(161, 234, 251, 0.15);"></td></tr>
              </table>

              <!-- Terminal scripts -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px; text-align: left;">
                <tr>
                  <td>
                    <h2 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #FFFFFF;">Your install scripts</h2>
                    <p style="margin: 0 0 20px 0; font-size: 13px; color: #9CA3AF; line-height: 1.5;">Copy the command for your OS and paste it in a terminal.</p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <!-- macOS terminal -->
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 16px; background-color: #0A0E17; border: 1px solid rgba(161, 234, 251, 0.15); border-radius: 10px;">
                      <tr>
                        <td style="padding: 16px;">
                          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 10px;">
                            <tr>
                              <td align="left" style="width: 50px;">
                                <span style="display: inline-block; width: 8px; height: 8px; background-color: #FF5F56; border-radius: 50%; margin-right: 4px;"></span>
                                <span style="display: inline-block; width: 8px; height: 8px; background-color: #FFBD2E; border-radius: 50%; margin-right: 4px;"></span>
                                <span style="display: inline-block; width: 8px; height: 8px; background-color: #27C93F; border-radius: 50%;"></span>
                              </td>
                              <td align="right">
                                <span style="font-size: 11px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em;">macOS</span>
                              </td>
                            </tr>
                          </table>
                          <code style="display: block; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #A1EAFB; line-height: 1.6; word-break: break-all;">${macCmd}</code>
                        </td>
                      </tr>
                    </table>

                    <!-- Windows terminal -->
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0A0E17; border: 1px solid rgba(161, 234, 251, 0.15); border-radius: 10px;">
                      <tr>
                        <td style="padding: 16px;">
                          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 10px;">
                            <tr>
                              <td align="left" style="width: 50px;">
                                <span style="display: inline-block; width: 8px; height: 8px; background-color: #FF5F56; border-radius: 50%; margin-right: 4px;"></span>
                                <span style="display: inline-block; width: 8px; height: 8px; background-color: #FFBD2E; border-radius: 50%; margin-right: 4px;"></span>
                                <span style="display: inline-block; width: 8px; height: 8px; background-color: #27C93F; border-radius: 50%;"></span>
                              </td>
                              <td align="right">
                                <span style="font-size: 11px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em;">Windows</span>
                              </td>
                            </tr>
                          </table>
                          <code style="display: block; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #A1EAFB; line-height: 1.6; word-break: break-all;">${winCmd}</code>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- How to run it -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; text-align: left;">
                <tr>
                  <td>
                    <h2 style="margin: 0 0 20px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9CA3AF;">How to run it</h2>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <!-- macOS steps -->
                        <td class="instruction-col" valign="top" width="48%" style="padding-right: 12px;">
                          <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; color: #A1EAFB;">On macOS:</h3>
                          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td valign="top" style="width: 20px; font-size: 13px; font-weight: bold; color: #A1EAFB; line-height: 20px; padding-bottom: 12px;">1.</td>
                              <td valign="top" style="font-size: 13px; color: #9CA3AF; line-height: 20px; padding-bottom: 12px;">Open <strong>Terminal</strong><br><span style="font-size: 11px; color: #6B7280;">(&#8984; + Space → type "Terminal")</span></td>
                            </tr>
                            <tr>
                              <td valign="top" style="width: 20px; font-size: 13px; font-weight: bold; color: #A1EAFB; line-height: 20px; padding-bottom: 12px;">2.</td>
                              <td valign="top" style="font-size: 13px; color: #9CA3AF; line-height: 20px; padding-bottom: 12px;"><strong>Paste</strong> (&#8984; + V) and press <strong>Enter</strong></td>
                            </tr>
                            <tr>
                              <td valign="top" style="width: 20px; font-size: 13px; font-weight: bold; color: #A1EAFB; line-height: 20px;">3.</td>
                              <td valign="top" style="font-size: 13px; color: #9CA3AF; line-height: 20px;">Type your <strong>password</strong> (invisible — normal) → <strong>Enter</strong></td>
                            </tr>
                          </table>
                        </td>
                        <td class="instruction-col-spacer" width="4%" style="font-size: 0; line-height: 0;"></td>
                        <!-- Windows steps -->
                        <td class="instruction-col" valign="top" width="48%" style="padding-left: 12px; border-left: 1px solid rgba(161, 234, 251, 0.08);">
                          <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; color: #2DD4BF;">On Windows:</h3>
                          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td valign="top" style="width: 20px; font-size: 13px; font-weight: bold; color: #2DD4BF; line-height: 20px; padding-bottom: 12px;">1.</td>
                              <td valign="top" style="font-size: 13px; color: #9CA3AF; line-height: 20px; padding-bottom: 12px;">Right-click Start → <strong>Terminal (Admin)</strong></td>
                            </tr>
                            <tr>
                              <td valign="top" style="width: 20px; font-size: 13px; font-weight: bold; color: #2DD4BF; line-height: 20px; padding-bottom: 12px;">2.</td>
                              <td valign="top" style="font-size: 13px; color: #9CA3AF; line-height: 20px; padding-bottom: 12px;"><strong>Paste</strong> (Ctrl + V) and press <strong>Enter</strong></td>
                            </tr>
                            <tr>
                              <td valign="top" style="width: 20px; font-size: 13px; font-weight: bold; color: #2DD4BF; line-height: 20px;">3.</td>
                              <td valign="top" style="font-size: 13px; color: #9CA3AF; line-height: 20px;">Type <strong>Y</strong> if prompted → wait for the green "Done" message</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- One-time note -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 24px; border-top: 1px solid rgba(161, 234, 251, 0.05); padding-top: 16px;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #6B7280;">
                      <strong style="color: #A1EAFB;">One-time link.</strong> This script only works once. You can copy the command from this email at any time if you need to reinstall.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Support -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #6B7280;">
                      Need help? Just reply to this email or reach us at <a href="mailto:support@nogoon.io" style="color: #A1EAFB; text-decoration: none;">support@nogoon.io</a>.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin-top: 24px;">
          <tr>
            <td align="center" style="font-size: 11px; line-height: 16px; color: #6B7280; text-align: center;">
              You received this email because you made a purchase on nogoon.io.<br>
              &copy; 2026 nogoon.io. All rights reserved.
            </td>
          </tr>
        </table>

      </td>
    </tr>
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
