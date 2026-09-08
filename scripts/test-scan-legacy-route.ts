import assert from 'node:assert/strict';
import { getLegacyCameraRedirect } from '../lib/scanLegacyRoute';

const binderPageRedirect = getLegacyCameraRedirect({
  intent: ['binder_page', 'listing'],
  binderId: ['binder-42'],
  parentSessionId: ['session-12'],
  replacePocketIndex: ['7'],
  layout: ['3x3'],
  scanMode: ['manual'],
  q: ['charizard'],
});

assert.deepEqual(binderPageRedirect, {
  pathname: '/scan',
  params: {
    intent: 'binder_page',
    binderId: 'binder-42',
    parentSessionId: 'session-12',
    replacePocketIndex: '7',
    layout: '3x3',
    scanMode: 'manual',
    q: 'charizard',
  },
});

assert.deepEqual(getLegacyCameraRedirect({ mode: 'listing', flow: 'listing', type: 'single' }), {
  pathname: '/scan',
  params: { mode: 'listing', flow: 'listing', type: 'single' },
});

console.log('scan legacy-route tests passed');
