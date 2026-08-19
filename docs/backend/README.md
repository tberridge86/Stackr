# StackR backend engineering

The backend release criteria are defined in [BACKEND_RELEASE_GATES.md](./BACKEND_RELEASE_GATES.md).

Run the machine-readable gate locally with:

```bash
node scripts/backend-readiness-report.mjs --scope=full
```

The report is written to `reports/backend/readiness.json` and is uploaded by the dedicated Backend Readiness GitHub Actions workflow.
