CREATE TABLE `mollie_connections` (
	`user` text PRIMARY KEY NOT NULL,
	`tokens` text NOT NULL,
	`profile` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`expires` integer NOT NULL
);
