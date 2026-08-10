# Recognition database role

The recognition service connects to Postgres with the dedicated
`stackr_recognition` role. Migration
`20260805200000_recognition_service_database_role.sql` creates the role with
login disabled and grants only the catalogue, model-registry, diagnostic, and
feedback-event access used by the service.

## Environment provisioning

Provision credentials separately in each environment after migrations or a
database rebuild:

1. Generate a cryptographically random password of at least 32 bytes.
2. As the database owner, run:

   ```sql
   alter role stackr_recognition login password '<generated-password>' connection limit 5;
   ```

3. Build the Supavisor session-pooler connection string for that environment:

   ```text
   postgresql://stackr_recognition.<project-ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=10
   ```

4. Store it as the secret Railway variable
   `STACKR_RECOGNITION_DATABASE_URL`. Do not print it or write it to a file.
5. Redeploy the recognition service and verify `/ready` reports both
   `components.repository.catalogue.ok` and
   `components.repository.database.ok` as `true`.

## Verification

Confirm that the role:

- can read `ml.embedding_models`, `ml.embedding_index_versions`, and the
  published `api.catalogue_cards` view;
- can write `ml.recognition_scan_diagnostics` and recognition feedback events;
- cannot read unrelated private tables such as `ml.scan_upload_assets`;
- is not a superuser and does not bypass row-level security.

Rotate the password after a suspected disclosure or operator change. Create a
separate password for production only after production release approval.
