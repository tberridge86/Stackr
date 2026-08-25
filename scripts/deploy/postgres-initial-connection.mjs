import pg from 'pg';

const { Client } = pg;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isRetryableInitialPostgresConnectionError(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? error ?? '');
  const combined = `${code} ${message}`;
  return (/\bECHECKOUTTIMEOUT\b/i.test(combined)
      && /unable to check out connection/i.test(message))
    || /authentication did not complete within \d+ms(?: in Session mode)?/i.test(message)
    || (code === 'XX000'
      && /\bEAUTHQUERY\b.*authentication query failed: connection to database not available/i
        .test(message));
}

export async function connectPostgresWithRetry({
  connectionString,
  applicationName,
  statementTimeoutMs,
  maxAttempts = 1,
  retryDelayMs = 0,
  ClientClass = Client,
  sleep = wait,
  onRetry = () => {},
}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = new ClientClass({
      connectionString,
      application_name: applicationName,
    });
    try {
      await client.connect();
      await client.query(
        "select set_config('statement_timeout', $1, false)",
        [String(statementTimeoutMs)],
      );
      return { client, attemptsUsed: attempt };
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      const retryable = isRetryableInitialPostgresConnectionError(error);
      if (!retryable || attempt === maxAttempts) throw error;
      onRetry({ attempt, maxAttempts, applicationName });
      await sleep(retryDelayMs);
    }
  }
  throw lastError;
}
