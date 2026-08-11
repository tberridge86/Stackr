const CONNECTION_OVERRIDE_PARAMETERS = new Set([
  'host',
  'hostaddr',
  'port',
  'user',
  'password',
  'dbname',
  'database',
  'service',
  'options',
]);

export function assertNoPostgresConnectionOverrides(parsed) {
  for (const parameter of CONNECTION_OVERRIDE_PARAMETERS) {
    if (parsed.searchParams.has(parameter)) {
      throw new Error(`unsafe_postgres_connection_parameter:${parameter}`);
    }
  }
}
