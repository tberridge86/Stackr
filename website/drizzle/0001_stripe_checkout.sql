CREATE TABLE shop_orders (
 id TEXT PRIMARY KEY NOT NULL,
 client_id TEXT NOT NULL,
 ip_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('creating','pending','paid','expired','failed')),
 mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 items_json TEXT NOT NULL,
 subtotal_pence INTEGER NOT NULL CHECK(subtotal_pence > 0),
 delivery_pence INTEGER NOT NULL CHECK(delivery_pence >= 0),
 total_pence INTEGER NOT NULL CHECK(total_pence = subtotal_pence + delivery_pence),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 stripe_session_id TEXT UNIQUE,
 stripe_url TEXT,
 payment_intent TEXT
);
--> statement-breakpoint
CREATE INDEX shop_orders_client_idx ON shop_orders(client_id, status);
--> statement-breakpoint
CREATE INDEX shop_orders_ip_idx ON shop_orders(ip_hash, status);
--> statement-breakpoint
CREATE TABLE shop_order_items (
 order_id TEXT NOT NULL REFERENCES shop_orders(id),
 product_id TEXT NOT NULL REFERENCES shop_inventory(product_id),
 quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 3),
 unit_pence INTEGER NOT NULL CHECK(typeof(unit_pence) = 'integer' AND unit_pence > 0),
 PRIMARY KEY(order_id, product_id)
);
--> statement-breakpoint
CREATE TABLE shop_payment_events (
 event_id TEXT PRIMARY KEY NOT NULL,
 order_id TEXT NOT NULL REFERENCES shop_orders(id),
 event_type TEXT NOT NULL,
 received_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER shop_checkout_reserve_guard BEFORE INSERT ON shop_order_items BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM shop_inventory i JOIN shop_orders o ON o.id = NEW.order_id
  WHERE i.product_id = NEW.product_id AND o.status = 'creating'
   AND i.status = 'in_stock' AND i.quantity IS NOT NULL AND i.quantity >= NEW.quantity
 ) THEN RAISE(ABORT, 'stock_unavailable') END;
END;
--> statement-breakpoint
CREATE TRIGGER shop_checkout_reserve AFTER INSERT ON shop_order_items BEGIN
 UPDATE shop_inventory SET
  status = CASE WHEN quantity - NEW.quantity = 0 THEN 'out_of_stock' ELSE 'in_stock' END,
  quantity = quantity - NEW.quantity,
  updated_at = (SELECT updated_at FROM shop_orders WHERE id = NEW.order_id), updated_by = 'checkout'
 WHERE product_id = NEW.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER shop_checkout_release AFTER UPDATE OF status ON shop_orders
 WHEN OLD.status IN ('creating','pending') AND NEW.status IN ('expired','failed') BEGIN
 UPDATE shop_inventory SET
  quantity = quantity + (SELECT quantity FROM shop_order_items WHERE order_id = NEW.id AND product_id = shop_inventory.product_id),
  status = 'in_stock', updated_at = NEW.updated_at, updated_by = 'checkout'
 WHERE product_id IN (SELECT product_id FROM shop_order_items WHERE order_id = NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER shop_checkout_stock_edit_guard BEFORE UPDATE ON shop_inventory
 WHEN NEW.updated_by <> 'checkout' AND EXISTS (
  SELECT 1 FROM shop_order_items l JOIN shop_orders o ON o.id = l.order_id
  WHERE l.product_id = OLD.product_id AND o.status IN ('creating','pending')
 ) BEGIN SELECT RAISE(ABORT, 'stock_reserved'); END;
--> statement-breakpoint
CREATE TRIGGER shop_checkout_order_limit BEFORE INSERT ON shop_orders BEGIN
 SELECT CASE WHEN EXISTS (SELECT 1 FROM shop_orders WHERE client_id = NEW.client_id AND status IN ('creating','pending'))
  OR (SELECT COUNT(*) FROM shop_orders WHERE ip_hash = NEW.ip_hash AND status IN ('creating','pending')) >= 3
  THEN RAISE(ABORT, 'checkout_limit') END;
END;
