create index if not exists external_identifiers_publication_language_id_idx
on ingest.external_identifiers (language_code, id)
include (source_id, source_entity_type, external_id, set_id, is_current, deprecated_at);
