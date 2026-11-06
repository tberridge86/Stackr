CREATE TABLE shop_price_overrides (
 product_id TEXT PRIMARY KEY,
 sale_pence INTEGER NOT NULL CHECK(typeof(sale_pence)='integer' AND sale_pence BETWEEN 1 AND 100000000),
 market_pence INTEGER NOT NULL CHECK(typeof(market_pence)='integer' AND market_pence BETWEEN 1 AND 100000000),
 basis TEXT NOT NULL CHECK(basis IN ('owner','feed')),
 market_source TEXT NOT NULL CHECK(length(market_source) BETWEEN 1 AND 2000),
 market_checked TEXT NOT NULL, expires_at TEXT NOT NULL,
 reference_json TEXT, revision TEXT NOT NULL REFERENCES owner_actions(id), updated_at TEXT NOT NULL,
 CHECK(sale_pence=CAST((market_pence*9000+5000)/10000 AS INTEGER)),
 CHECK((basis='owner' AND reference_json IS NULL) OR (basis='feed' AND reference_json IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE stockroom_sync_changes (
 action_id TEXT NOT NULL REFERENCES owner_actions(id), product_id TEXT NOT NULL,
 expected_reserved_quantity INTEGER NOT NULL CHECK(expected_reserved_quantity=0),
 expected_paid_quantity INTEGER NOT NULL CHECK(typeof(expected_paid_quantity)='integer' AND expected_paid_quantity>=0),
 expected_override_revision TEXT,
 PRIMARY KEY(action_id,product_id)
);
--> statement-breakpoint
CREATE TRIGGER stockroom_sync_guard BEFORE INSERT ON stockroom_sync_changes BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM shop_order_items l JOIN shop_orders o ON o.id=l.order_id WHERE l.product_id=NEW.product_id AND o.status IN ('creating','pending')) THEN RAISE(ABORT,'stock_reserved') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(l.quantity) FROM shop_order_items l JOIN shop_orders o ON o.id=l.order_id WHERE l.product_id=NEW.product_id AND o.status='paid' AND o.mode='live'),0)<>NEW.expected_paid_quantity THEN RAISE(ABORT,'stock_changed') END;
 SELECT CASE WHEN NOT ((SELECT revision FROM shop_price_overrides WHERE product_id=NEW.product_id) IS NEW.expected_override_revision) THEN RAISE(ABORT,'price_changed') END;
END;
--> statement-breakpoint
CREATE INDEX shop_orders_paid_idx ON shop_orders(mode,status,updated_at,id);
--> statement-breakpoint
CREATE INDEX shop_order_items_product_idx ON shop_order_items(product_id,order_id);
