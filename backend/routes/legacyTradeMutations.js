import express from 'express';

const router = express.Router();

function legacyTradeMutationRetired(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.status(410).json({
    error: 'This legacy trade mutation route has been retired.',
    code: 'legacy_trade_mutation_retired',
    requestId: req.stackrRequestId ?? null,
  });
}

router.post('/sent', legacyTradeMutationRetired);
router.post('/received', legacyTradeMutationRetired);

export default router;
