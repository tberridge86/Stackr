-- New website collections only. Existing Supabase/app collections are untouched.
CREATE TABLE web_binders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 type TEXT NOT NULL CHECK(type IN ('custom','set')),
 language TEXT NOT NULL CHECK(language IN ('en','ja','ko','zh-cn','zh-tw')),
 set_id TEXT, set_name TEXT, set_total INTEGER CHECK(set_total IS NULL OR set_total BETWEEN 0 AND 10000), set_checked_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1), archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK((type='set' AND set_id IS NOT NULL) OR (type='custom' AND set_id IS NULL))
);
--> statement-breakpoint
CREATE INDEX web_binders_owner ON web_binders(user_id,archived,updated_at,id);
--> statement-breakpoint
CREATE TABLE web_binder_items (
 binder_id TEXT NOT NULL REFERENCES web_binders(id), card_id TEXT NOT NULL, variant_id TEXT NOT NULL,
 canonical_id TEXT NOT NULL, variant_code TEXT NOT NULL, finish_code TEXT,
 set_id TEXT NOT NULL, language TEXT NOT NULL, native_name TEXT NOT NULL, english_name TEXT,
 collector_number TEXT NOT NULL, image_url TEXT,
 quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity BETWEEN 0 AND 9999),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(binder_id,card_id,variant_id)
);
--> statement-breakpoint
CREATE TABLE web_binder_actions (
 user_id TEXT NOT NULL, id TEXT NOT NULL, binder_id TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('create','edit','item')),
 expected_revision INTEGER NOT NULL CHECK(expected_revision>=0), payload TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,id)
);
--> statement-breakpoint
CREATE TRIGGER web_binder_action_guard BEFORE INSERT ON web_binder_actions BEGIN
 SELECT CASE WHEN NEW.operation='create' AND (
  EXISTS(SELECT 1 FROM web_binders WHERE id=NEW.binder_id)
  OR (SELECT COUNT(*) FROM web_binders WHERE user_id=NEW.user_id)>=200
 ) THEN RAISE(ABORT,'binder_create_conflict') END;
 SELECT CASE WHEN NEW.operation<>'create' AND NOT EXISTS(
  SELECT 1 FROM web_binders WHERE id=NEW.binder_id AND user_id=NEW.user_id
   AND revision=NEW.expected_revision AND (archived=0 OR NEW.operation='edit')
 ) THEN RAISE(ABORT,'binder_revision_conflict') END;
END;
--> statement-breakpoint
CREATE TRIGGER web_binder_action_revision AFTER INSERT ON web_binder_actions WHEN NEW.operation<>'create' BEGIN
 UPDATE web_binders SET revision=revision+1,updated_at=NEW.created_at
 WHERE id=NEW.binder_id AND user_id=NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER web_binder_item_guard BEFORE INSERT ON web_binder_items BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM web_binders b WHERE b.id=NEW.binder_id AND b.archived=0 AND b.language=NEW.language
   AND (b.type='custom' OR b.set_id=NEW.set_id)
 ) THEN RAISE(ABORT,'binder_identity_mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM web_binder_items WHERE binder_id=NEW.binder_id AND card_id=NEW.card_id AND variant_id=NEW.variant_id)
  AND (SELECT COUNT(*) FROM web_binder_items WHERE binder_id=NEW.binder_id)>=10000
 THEN RAISE(ABORT,'binder_item_limit') END;
END;
