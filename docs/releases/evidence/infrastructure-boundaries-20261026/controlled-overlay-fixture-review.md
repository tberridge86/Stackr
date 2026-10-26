# Controlled overlay assertion qualification

Final candidate d76f5099f1cb1811df01b3eace6532d8eaf83a59 changes only scripts/test-tcgdex-controlled-card-reference.ts from8f8d521. Reviewed Git blob831dfccb3a565a12d168599dcdd56e2d729cc21d. Independent stackr_reviewer GO: the assertion retains the controlled provider overlay and bounded read, and additionally requires the caller cancellation signal. No runtime change or assertion removal. Focused test exits0; diff --check passes. Prior failed run40364533602 is retained in ci-8f-fixture-failure.json, not described as green.
