import assert from 'node:assert/strict';
import { attestGatewayDoIdentity } from './deploy/attest-gateway-do-identity.mjs';
const id = '4afc2fcb-7ff7-46d0-90a3-9ca2d24a0486'; const namespace = 'aa7d685ce0ee4139b5b70cf0b33db23c';
const version = { id, resources: { bindings: [{ type: 'durable_object_namespace', name: 'GATEWAY_STATE', class_name: 'GatewayState', namespace_id: namespace }, { type: 'plain_text', name: 'UNRELATED', text: 'not-output' }] } };
assert.deepEqual(attestGatewayDoIdentity(version, { expectedId: id, expectedNamespace: namespace }), { id, durable_object_bindings: [{ name: 'GATEWAY_STATE', class_name: 'GatewayState', namespace_id: namespace }] });
assert.throws(() => attestGatewayDoIdentity({ ...version, id: 'other' }, { expectedId: id, expectedNamespace: namespace }), /version_id/);
assert.throws(() => attestGatewayDoIdentity({ ...version, resources: { bindings: [] } }, { expectedId: id, expectedNamespace: namespace }), /binding_count/);
assert.throws(() => attestGatewayDoIdentity({ ...version, resources: { bindings: [{ ...version.resources.bindings[0], namespace_id: 'other' }] } }, { expectedId: id, expectedNamespace: namespace }), /identity/);
console.log('Gateway Durable Object identity guards passed.');
