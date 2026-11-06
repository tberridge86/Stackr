// Declarative counterpart of the authored SQLite migration in drizzle/.
// drizzle-kit is not a dependency of this plain Worker project; no generator ran.
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const shopInventory = sqliteTable('shop_inventory', {
  productId: text('product_id').primaryKey().notNull(),
  status: text('status', { enum: ['in_stock', 'out_of_stock', 'unknown'] }).notNull().default('unknown'),
  quantity: integer('quantity'),
  note: text('note').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
}, table => [
  check('shop_inventory_status', sql`${table.status} IN ('in_stock', 'out_of_stock', 'unknown')`),
  check('shop_inventory_quantity', sql`${table.quantity} IS NULL OR (typeof(${table.quantity}) = 'integer' AND ${table.quantity} BETWEEN 0 AND 999999)`),
  check('shop_inventory_state_quantity', sql`(${table.status} = 'unknown' AND ${table.quantity} IS NULL) OR (${table.status} = 'out_of_stock' AND ${table.quantity} IS NOT NULL AND ${table.quantity} = 0) OR (${table.status} = 'in_stock' AND (${table.quantity} IS NULL OR ${table.quantity} > 0))`),
]);

export const shopInterests = sqliteTable('shop_interests', {
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull(),
  email: text('email').notNull(),
  quantity: integer('quantity').notNull().default(1),
  consentAt: text('consent_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.productId] }),
  check('shop_interests_quantity', sql`typeof(${table.quantity}) = 'integer' AND ${table.quantity} BETWEEN 1 AND 3`),
  index('shop_interests_product_idx').on(table.productId),
  index('shop_interests_updated_idx').on(table.updatedAt),
]);

// Atomic reservation/release triggers are authoritative in 0001_stripe_checkout.sql.
export const shopOrders = sqliteTable('shop_orders', {
 id: text('id').primaryKey().notNull(), clientId: text('client_id').notNull(), ipHash: text('ip_hash').notNull(),
 status: text('status', {enum: ['creating','pending','paid','expired','failed']}).notNull(),
 mode: text('mode', {enum: ['test','live']}).notNull(), itemsJson: text('items_json').notNull(),
 subtotalPence: integer('subtotal_pence').notNull(), deliveryPence: integer('delivery_pence').notNull(),
 totalPence: integer('total_pence').notNull(), createdAt: text('created_at').notNull(),
 updatedAt: text('updated_at').notNull(), expiresAt: integer('expires_at').notNull(),
 stripeSessionId: text('stripe_session_id').unique(), stripeUrl: text('stripe_url'), paymentIntent: text('payment_intent'),
}, table => [index('shop_orders_client_idx').on(table.clientId, table.status), index('shop_orders_ip_idx').on(table.ipHash, table.status)]);
export const shopOrderItems = sqliteTable('shop_order_items', {
 orderId: text('order_id').notNull().references(()=>shopOrders.id),
 productId: text('product_id').notNull().references(()=>shopInventory.productId),
 quantity: integer('quantity').notNull(), unitPence: integer('unit_pence').notNull(),
}, table=>[primaryKey({columns:[table.orderId,table.productId]})]);
export const shopPaymentEvents = sqliteTable('shop_payment_events', {
 eventId: text('event_id').primaryKey().notNull(), orderId: text('order_id').notNull().references(()=>shopOrders.id),
 eventType: text('event_type').notNull(), receivedAt: text('received_at').notNull(),
});
