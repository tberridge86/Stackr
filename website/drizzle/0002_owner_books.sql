CREATE TABLE owner_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), vat_status TEXT NOT NULL CHECK(vat_status IN ('unknown','not_registered','registered')),
 vat_number TEXT NOT NULL DEFAULT '', sales_vat_bps INTEGER CHECK(sales_vat_bps IN (0,500,2000)), updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE owner_actions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL, user_id TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE owner_entries (
 id TEXT PRIMARY KEY REFERENCES owner_actions(id), kind TEXT NOT NULL CHECK(kind IN ('purchase','expense','income','sale','supplier_credit','sales_refund')),
 entry_date TEXT NOT NULL, paid_date TEXT, counterparty TEXT NOT NULL, reference TEXT NOT NULL, category TEXT NOT NULL,
 document_ref TEXT NOT NULL, note TEXT NOT NULL, product_id TEXT, quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity BETWEEN 0 AND 999999),
 net_pence INTEGER NOT NULL CHECK(typeof(net_pence)='integer' AND net_pence BETWEEN 0 AND 1000000000),
 vat_pence INTEGER NOT NULL CHECK(typeof(vat_pence)='integer' AND vat_pence BETWEEN 0 AND 1000000000),
 gross_pence INTEGER NOT NULL CHECK(gross_pence=net_pence+vat_pence AND gross_pence BETWEEN 1 AND 1000000000),
 tax_snapshot TEXT NOT NULL, cost_pence INTEGER, received_at TEXT, reversed_by TEXT UNIQUE,
 related_id TEXT REFERENCES owner_entries(id), reverses_id TEXT UNIQUE REFERENCES owner_entries(id), created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX owner_entries_date ON owner_entries(entry_date, id);
--> statement-breakpoint
CREATE UNIQUE INDEX owner_invoice_product ON owner_entries(lower(counterparty),lower(reference),product_id) WHERE kind='purchase' AND reversed_by IS NULL AND reverses_id IS NULL;
--> statement-breakpoint
CREATE TABLE owner_costs (product_id TEXT PRIMARY KEY, units INTEGER NOT NULL CHECK(units>=0), gross_pence INTEGER NOT NULL CHECK(gross_pence>=0), known INTEGER NOT NULL CHECK(known IN (0,1)));
--> statement-breakpoint
CREATE TABLE owner_order_costs (
 order_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL, cost_pence INTEGER,
 vat_status TEXT NOT NULL, sales_vat_bps INTEGER, sales_vat_pence INTEGER, PRIMARY KEY(order_id,product_id)
);
--> statement-breakpoint
CREATE TABLE owner_stock_changes (
 action_id TEXT NOT NULL REFERENCES owner_actions(id), product_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('count','receipt')),
 expected_at TEXT, expected_quantity INTEGER, expected_status TEXT, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 999999),
 entry_id TEXT REFERENCES owner_entries(id), note TEXT NOT NULL, changed_at TEXT NOT NULL, user_id TEXT NOT NULL,
 PRIMARY KEY(action_id,product_id)
);
--> statement-breakpoint
CREATE TRIGGER owner_stock_guard BEFORE INSERT ON owner_stock_changes BEGIN
 SELECT CASE WHEN NOT ((SELECT updated_at FROM shop_inventory WHERE product_id=NEW.product_id) IS NEW.expected_at)
 OR NOT ((SELECT quantity FROM shop_inventory WHERE product_id=NEW.product_id) IS NEW.expected_quantity)
 OR NOT ((SELECT status FROM shop_inventory WHERE product_id=NEW.product_id) IS NEW.expected_status)
 THEN RAISE(ABORT,'stock_changed') END;
 SELECT CASE WHEN NEW.kind='receipt' AND NOT EXISTS(SELECT 1 FROM owner_entries WHERE id=NEW.entry_id AND kind='purchase' AND product_id=NEW.product_id AND received_at IS NULL AND reversed_by IS NULL AND reverses_id IS NULL) THEN RAISE(ABORT,'receipt_unavailable') END;
END;
--> statement-breakpoint
CREATE TRIGGER owner_stock_apply AFTER INSERT ON owner_stock_changes BEGIN
 INSERT INTO shop_inventory(product_id,status,quantity,note,updated_at,updated_by)
 VALUES(NEW.product_id,CASE WHEN NEW.quantity=0 THEN 'out_of_stock' ELSE 'in_stock' END,NEW.quantity,NEW.note,NEW.changed_at,CASE WHEN NEW.kind='receipt' THEN 'owner-receipt:'||NEW.action_id ELSE NEW.user_id END)
 ON CONFLICT(product_id) DO UPDATE SET status=excluded.status,quantity=excluded.quantity,note=excluded.note,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 INSERT INTO owner_costs(product_id,units,gross_pence,known)
 SELECT NEW.product_id,NEW.quantity,e.gross_pence,CASE WHEN COALESCE(NEW.expected_quantity,0)=0 THEN 1 ELSE 0 END FROM owner_entries e WHERE e.id=NEW.entry_id AND NEW.kind='receipt'
 ON CONFLICT(product_id) DO UPDATE SET
 gross_pence=CASE WHEN COALESCE(NEW.expected_quantity,0)=0 THEN excluded.gross_pence ELSE owner_costs.gross_pence+excluded.gross_pence END,
 known=CASE WHEN COALESCE(NEW.expected_quantity,0)=0 THEN 1 WHEN owner_costs.units=NEW.expected_quantity AND owner_costs.known=1 THEN 1 ELSE 0 END,units=excluded.units;
 UPDATE owner_costs SET known=0 WHERE product_id=NEW.product_id AND NEW.kind='receipt' AND EXISTS(SELECT 1 FROM owner_entries e WHERE e.kind='supplier_credit' AND e.related_id=NEW.entry_id AND e.reverses_id IS NULL AND e.reversed_by IS NULL);
 UPDATE owner_entries SET received_at=NEW.changed_at WHERE id=NEW.entry_id AND NEW.kind='receipt';
END;
--> statement-breakpoint
CREATE TRIGGER owner_recount_cost AFTER UPDATE ON shop_inventory WHEN NEW.updated_by NOT IN ('checkout','owner-sale') AND NOT EXISTS(SELECT 1 FROM owner_stock_changes c WHERE c.product_id=NEW.product_id AND NEW.updated_by='owner-receipt:'||c.action_id AND c.kind='receipt') BEGIN
 UPDATE owner_costs SET known=CASE WHEN NEW.quantity=OLD.quantity THEN known ELSE 0 END,units=COALESCE(NEW.quantity,0) WHERE product_id=NEW.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER owner_checkout_cost AFTER INSERT ON shop_order_items BEGIN
 INSERT INTO owner_order_costs(order_id,product_id,quantity,cost_pence,vat_status,sales_vat_bps,sales_vat_pence)
 VALUES(NEW.order_id,NEW.product_id,NEW.quantity,
 (SELECT CASE WHEN known=1 AND units>=NEW.quantity AND units>0 THEN CAST((gross_pence*NEW.quantity+units/2)/units AS INTEGER) ELSE NULL END FROM owner_costs WHERE product_id=NEW.product_id),
 COALESCE((SELECT vat_status FROM owner_settings WHERE id=1),'unknown'),(SELECT sales_vat_bps FROM owner_settings WHERE id=1),
 (SELECT CASE WHEN vat_status='not_registered' THEN 0 WHEN vat_status='registered' AND sales_vat_bps IS NOT NULL THEN CAST((NEW.unit_pence*NEW.quantity*sales_vat_bps+(10000+sales_vat_bps)/2)/(10000+sales_vat_bps) AS INTEGER) ELSE NULL END FROM owner_settings WHERE id=1));
 UPDATE owner_costs SET gross_pence=MAX(0,gross_pence-COALESCE((SELECT cost_pence FROM owner_order_costs WHERE order_id=NEW.order_id AND product_id=NEW.product_id),0)),
 known=CASE WHEN units>=NEW.quantity THEN known ELSE 0 END, units=MAX(0,units-NEW.quantity) WHERE product_id=NEW.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER owner_checkout_cost_release AFTER UPDATE OF status ON shop_orders WHEN OLD.status IN ('creating','pending') AND NEW.status IN ('expired','failed') BEGIN
 UPDATE owner_costs SET units=units+(SELECT quantity FROM owner_order_costs c WHERE c.order_id=NEW.id AND c.product_id=owner_costs.product_id),
 gross_pence=gross_pence+COALESCE((SELECT cost_pence FROM owner_order_costs c WHERE c.order_id=NEW.id AND c.product_id=owner_costs.product_id),0),
 known=CASE WHEN (SELECT cost_pence FROM owner_order_costs c WHERE c.order_id=NEW.id AND c.product_id=owner_costs.product_id) IS NULL THEN 0 ELSE known END
 WHERE product_id IN (SELECT product_id FROM owner_order_costs WHERE order_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER owner_manual_sale_guard BEFORE INSERT ON owner_entries WHEN NEW.kind='sale' AND NEW.reverses_id IS NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM shop_inventory WHERE product_id=NEW.product_id AND status='in_stock' AND quantity>=NEW.quantity) THEN RAISE(ABORT,'stock_unavailable') END;
END;
--> statement-breakpoint
CREATE TRIGGER owner_manual_sale AFTER INSERT ON owner_entries WHEN NEW.kind='sale' AND NEW.reverses_id IS NULL BEGIN
 UPDATE owner_entries SET cost_pence=(SELECT CASE WHEN known=1 AND units>=NEW.quantity AND units>0 THEN CAST((gross_pence*NEW.quantity+units/2)/units AS INTEGER) ELSE NULL END FROM owner_costs WHERE product_id=NEW.product_id) WHERE id=NEW.id;
 UPDATE owner_costs SET gross_pence=MAX(0,gross_pence-COALESCE((SELECT cost_pence FROM owner_entries WHERE id=NEW.id),0)),known=CASE WHEN units>=NEW.quantity THEN known ELSE 0 END,units=MAX(0,units-NEW.quantity) WHERE product_id=NEW.product_id;
 UPDATE shop_inventory SET quantity=quantity-NEW.quantity,status=CASE WHEN quantity-NEW.quantity=0 THEN 'out_of_stock' ELSE 'in_stock' END,updated_at=NEW.created_at,updated_by='owner-sale' WHERE product_id=NEW.product_id;
END;

--> statement-breakpoint
CREATE TRIGGER owner_reverse_guard BEFORE INSERT ON owner_entries WHEN NEW.reverses_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM owner_entries e WHERE e.id=NEW.reverses_id AND e.reversed_by=NEW.id AND e.received_at IS NULL AND e.reverses_id IS NULL AND e.kind<>'sale') THEN RAISE(ABORT,'correction_unavailable') END;
END;
--> statement-breakpoint
CREATE TRIGGER owner_paid_guard BEFORE UPDATE OF paid_date ON owner_entries WHEN NEW.paid_date IS NOT OLD.paid_date BEGIN
 SELECT CASE WHEN OLD.reversed_by IS NOT NULL OR OLD.reverses_id IS NOT NULL OR OLD.paid_date IS NOT NULL THEN RAISE(ABORT,'payment_date_locked') END;
END;
--> statement-breakpoint
CREATE TRIGGER owner_credit_cost AFTER INSERT ON owner_entries WHEN NEW.kind='supplier_credit' BEGIN
 UPDATE owner_costs SET known=0 WHERE product_id=(SELECT product_id FROM owner_entries WHERE id=NEW.related_id AND received_at IS NOT NULL);
END;
