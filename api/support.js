export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, message, chatId } = req.body || {};
  if (!email || !message) {
    return res.status(400).json({ error: 'Email and message are required' });
  }

  const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
  if (!SLACK_WEBHOOK) {
    console.error('SLACK_WEBHOOK_URL not configured');
    return res.status(500).json({ error: 'Support unavailable' });
  }

  const slackPayload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '💬 Support Chat Message', emoji: true }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*From:*\n${email}` },
          { type: 'mrkdwn', text: `*Session:*\n\`${chatId || 'n/a'}\`` }
        ]
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `> ${message}` }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `🕐 ${new Date().toUTCString()}` }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📧 Reply via Email' },
            url: `mailto:${email}?subject=Re: nogoon support&body=%0A%0A----%0AOriginal message:%0A${encodeURIComponent(message)}`
          }
        ]
      }
    ]
  };

  try {
    const slackRes = await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload)
    });

    if (!slackRes.ok) {
      console.error('Slack error:', await slackRes.text());
      return res.status(500).json({ error: 'Failed to send' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Support endpoint error:', err);
    return res.status(500).json({ error: 'Failed to send' });
  }
}
