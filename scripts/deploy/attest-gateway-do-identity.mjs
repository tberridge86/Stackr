import assert from 'node:assert/strict';

const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
export function attestGatewayDoIdentity(version, { expectedId, expectedNamespace }) {
  assert.equal(version?.id, expectedId, 'gateway_do_version_id_mismatch');
  const bindings = version?.resources?.bindings ?? version?.bindings ?? [];
  const durable = bindings.filter((binding) => binding?.type === 'durable_object_namespace');
  assert.equal(durable.length, 1, 'gateway_do_binding_count_mismatch');
  const binding = durable[0];
  assert.deepEqual({ name: binding.name, class_name: binding.class_name, namespace_id: binding.namespace_id }, { name: 'GATEWAY_STATE', class_name: 'GatewayState', namespace_id: expectedNamespace }, 'gateway_do_identity_mismatch');
  return { id: version.id, durable_object_bindings: durable.map(({ name, class_name, namespace_id, script_name, environment }) => ({ name, class_name, namespace_id, ...(script_name === undefined ? {} : { script_name }), ...(environment === undefined ? {} : { environment }) })) };
}

if (process.argv[1]?.endsWith('/attest-gateway-do-identity.mjs') || process.argv[1]?.endsWith('\\attest-gateway-do-identity.mjs')) {
  const chunks = []; process.stdin.on('data', (chunk) => chunks.push(chunk)); process.stdin.on('end', () => {
    const result = attestGatewayDoIdentity(JSON.parse(Buffer.concat(chunks).toString('utf8')), { expectedId: option('--expected-id'), expectedNamespace: option('--expected-namespace') });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  });
}
