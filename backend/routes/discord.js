import express from 'express';

const router = express.Router();

// Public bug reports and product feedback remain intentionally separate from
// the retired trade/review routes. They do not perform service-role reads.
router.post('/bug-report', async (req, res) => {
  try {
    const { report, collectorName } = req.body;

    if (!report?.trim()) return res.status(400).json({ error: 'Missing report' });

    const webhookUrl = process.env.DISCORD_BUG_REPORTS_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ error: 'Bug report webhook missing' });

    const content = [
      '🐛 **Bug Report**',
      '',
      `👤 From: ${collectorName ?? 'Anonymous'}`,
      '',
      `📝 ${report.trim()}`,
    ].join('\n');

    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Stackr Bug Reports', content }),
    });

    if (!discordResponse.ok) {
      const text = await discordResponse.text();
      console.log('Discord webhook failed:', discordResponse.status, text);
      return res.status(500).json({ error: 'Discord webhook failed' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.log('Discord route error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { feedback, collectorName } = req.body;

    if (!feedback?.trim()) return res.status(400).json({ error: 'Missing feedback' });

    const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ error: 'Feedback webhook missing' });

    const content = [
      '💬 **Feedback**',
      '',
      `👤 From: ${collectorName ?? 'Anonymous'}`,
      '',
      `📝 ${feedback.trim()}`,
    ].join('\n');

    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Stackr Feedback', content }),
    });

    if (!discordResponse.ok) {
      const text = await discordResponse.text();
      console.log('Feedback webhook failed:', discordResponse.status, text);
      return res.status(500).json({ error: 'Discord webhook failed' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.log('Feedback route error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
