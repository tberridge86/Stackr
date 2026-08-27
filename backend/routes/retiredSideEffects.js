import express from 'express';

const router = express.Router();

export const RETIRED_UNAUTHENTICATED_SIDE_EFFECT_PATHS = [
  '/notify',
  '/notify/trade-offer',
  '/notify/trade-status',
  '/notify/wishlist-match',
  '/notify/price-alert',
  '/discord/new-trade-listing',
  '/discord/new-review',
];

function unauthenticatedSideEffectRetired(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.status(410).json({
    error: 'This unauthenticated side-effect route has been retired.',
    code: 'unauthenticated_side_effect_retired',
    requestId: req.stackrRequestId ?? null,
  });
}

for (const path of RETIRED_UNAUTHENTICATED_SIDE_EFFECT_PATHS) {
  router.post(path, unauthenticatedSideEffectRetired);
}

export default router;
