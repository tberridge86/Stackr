CREATE TABLE `shop_inventory` (
  `product_id` text PRIMARY KEY NOT NULL,
  `status` text DEFAULT 'unknown' NOT NULL,
  `quantity` integer,
  `note` text DEFAULT '' NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL,
  CONSTRAINT `shop_inventory_status` CHECK (`status` IN ('in_stock', 'out_of_stock', 'unknown')),
  CONSTRAINT `shop_inventory_quantity` CHECK (`quantity` IS NULL OR (typeof(`quantity`) = 'integer' AND `quantity` BETWEEN 0 AND 999999)),
  CONSTRAINT `shop_inventory_state_quantity` CHECK ((`status` = 'unknown' AND `quantity` IS NULL) OR (`status` = 'out_of_stock' AND `quantity` IS NOT NULL AND `quantity` = 0) OR (`status` = 'in_stock' AND (`quantity` IS NULL OR `quantity` > 0)))
);
--> statement-breakpoint
CREATE TABLE `shop_interests` (
  `user_id` text NOT NULL,
  `product_id` text NOT NULL,
  `email` text NOT NULL,
  `quantity` integer DEFAULT 1 NOT NULL,
  `consent_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `product_id`),
  CONSTRAINT `shop_interests_quantity` CHECK (typeof(`quantity`) = 'integer' AND `quantity` BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE INDEX `shop_interests_product_idx` ON `shop_interests` (`product_id`);
--> statement-breakpoint
CREATE INDEX `shop_interests_updated_idx` ON `shop_interests` (`updated_at`);
