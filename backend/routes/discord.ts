import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.post('/new-trade-listing', async (req: any, res: any) => {
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
        listing_notes,
        profiles (
          collector_name
        )
      `)
      .eq('id', listingId)
      .eq('flag_type', 'trade')
      .maybeSingle();

    if (error) throw error;

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listingRow = listing as any;

    const { data: card } = await supabase
      .from('pokemon_cards')
      .select('name, raw_data')
      .eq('id', listingRow.card_id)
      .maybeSingle();

    const cardRow = card as any;
    const cardName = cardRow?.name ?? listingRow.card_id;
    const setName = cardRow?.raw_data?.set?.name ?? listingRow.set_id ?? 'Unknown set';
    const sellerName =
      Array.isArray(listingRow.profiles)
        ? listingRow.profiles[0]?.collector_name
        : listingRow.profiles?.collector_name;

    const price =
      listingRow.asking_price != null
        ? `£${Number(listingRow.asking_price).toFixed(2)}`
        : listingRow.value != null
        ? `£${Number(listingRow.value).toFixed(2)}`
        : 'Open to offers';

    const content = [
      '🆕 **New trade listing**',
      '',
      `🎴 **${cardName}**`,
      `📦 Set: ${setName}`,
      listingRow.condition ? `✨ Condition: ${listingRow.condition}` : null,
      `💷 Value: ${price}`,
      sellerName ? `👤 Listed by: ${sellerName}` : null,
      listingRow.listing_notes || listingRow.notes
        ? `💬 "${listingRow.listing_notes ?? listingRow.notes}"`
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

export default router;
