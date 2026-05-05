import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/new-trade-listing', async (req, res) => {
  try {
    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).json({ error: 'Missing listingId' });
    }

    const webhookUrl = process.env.DISCORD_FIND_TRADE_WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(500).json({ error: 'Discord webhook missing' });
    }

    const { data: listing, error } = await supabase
      .from('user_card_flags')
      .select(`
        id,
        user_id,
        card_id,
        set_id,
        condition,
        value,
        asking_price,
        notes,
        listing_notes
      `)
      .eq('id', listingId)
      .eq('flag_type', 'trade')
      .maybeSingle();

    if (error) throw error;

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('collector_name')
      .eq('id', listing.user_id)
      .maybeSingle();

    const { data: card } = await supabase
      .from('pokemon_cards')
      .select('name, raw_data')
      .eq('id', listing.card_id)
      .maybeSingle();

    const cardName = card?.name ?? listing.card_id;
    const setName = card?.raw_data?.set?.name ?? listing.set_id ?? 'Unknown set';
    const sellerName = profile?.collector_name ?? 'Collector';

    const price =
      listing.asking_price != null
        ? `£${Number(listing.asking_price).toFixed(2)}`
        : listing.value != null
        ? `£${Number(listing.value).toFixed(2)}`
        : 'Open to offers';

    const content = [
      '🆕 **New trade listing**',
      '',
      `🎴 **${cardName}**`,
      `📦 Set: ${setName}`,
      listing.condition ? `✨ Condition: ${listing.condition}` : null,
      `💷 Value: ${price}`,
      `👤 Listed by: ${sellerName}`,
      listing.listing_notes || listing.notes
        ? `💬 "${listing.listing_notes ?? listing.notes}"`
        : null,
      '',
      '👀 Anyone interested?',
    ]
      .filter(Boolean)
      .join('\n');

    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Stackr Trade Feed',
        content,
      }),
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

// ===============================
// TRADE REVIEW
// ===============================

router.post('/new-review', async (req, res) => {
  try {
    const { reviewedUserId, reviewerUserId, rating, comment, cardName } = req.body;

    if (!reviewedUserId || !rating) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const webhookUrl = process.env.DISCORD_REVIEWS_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ error: 'Reviews webhook missing' });

    const { data: reviewedProfile } = await supabase
      .from('profiles')
      .select('collector_name')
      .eq('id', reviewedUserId)
      .maybeSingle();

    const { data: reviewerProfile } = await supabase
      .from('profiles')
      .select('collector_name')
      .eq('id', reviewerUserId)
      .maybeSingle();

    const reviewedName = reviewedProfile?.collector_name ?? 'A collector';
    const reviewerName = reviewerProfile?.collector_name ?? 'Someone';
    const stars = '⭐'.repeat(rating);

    const content = [
      `${stars} **New Trade Review**`,
      '',
      `👤 **${reviewedName}** just received a ${rating}-star review`,
      `✍️ From: ${reviewerName}`,
      cardName ? `🎴 Card: ${cardName}` : null,
      comment?.trim() ? `💬 "${comment.trim()}"` : null,
    ].filter(Boolean).join('\n');

    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Stackr Reviews', content }),
    });

    if (!discordResponse.ok) {
      const text = await discordResponse.text();
      console.log('Review webhook failed:', discordResponse.status, text);
      return res.status(500).json({ error: 'Discord webhook failed' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.log('Review route error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// BUG REPORT
// ===============================

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
      console.log('Bug report webhook failed:', discordResponse.status, text);
      return res.status(500).json({ error: 'Discord webhook failed' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.log('Bug report route error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// FEEDBACK
// ===============================

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