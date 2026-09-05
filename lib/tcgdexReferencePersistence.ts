import {
  preserveExistingImageUrlBeforePersistence,
  stripTcgdexReferenceBeforePersistence,
} from './tcgdexControlledCardReference';

/** Select a persistence-safe image without deleting a value already at rest. */
export function selectTcgdexReferencePersistenceImage(
  candidate: string | null | undefined,
  existing: string | null | undefined = null,
) {
  return preserveExistingImageUrlBeforePersistence(
    stripTcgdexReferenceBeforePersistence(candidate),
    existing,
  );
}
