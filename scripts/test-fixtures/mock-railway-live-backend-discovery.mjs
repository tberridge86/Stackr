const args = process.argv.slice(2);
const requestId = args[args.indexOf('--request-id') + 1];
if (!requestId) process.exitCode = 1;
const record = {
  requestId: process.env.MOCK_RAILWAY_LOG_REQUEST_ID ?? requestId,
  deploymentId: process.env.MOCK_RAILWAY_LOG_DEPLOYMENT_ID ?? '44444444-4444-4444-8444-444444444444',
  method: process.env.MOCK_RAILWAY_LOG_METHOD ?? 'GET',
  path: process.env.MOCK_RAILWAY_LOG_PATH ?? '/health',
  httpStatus: Number(process.env.MOCK_RAILWAY_LOG_STATUS ?? 200),
};
if (process.env.MOCK_RAILWAY_MALFORMED_LOG === 'true') {
  console.log('not-json');
} else if (process.env.MOCK_RAILWAY_LOG_REQUEST_IDS !== 'irrelevant') {
  console.log(JSON.stringify(record));
  if (process.env.MOCK_RAILWAY_DUPLICATE_LOG === 'true') console.log(JSON.stringify(record));
}
