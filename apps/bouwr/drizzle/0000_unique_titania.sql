CREATE TABLE `bids` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`developer` text NOT NULL,
	`amount` integer NOT NULL,
	`days` integer NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bid_project_developer` ON `bids` (`project`,`developer`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`uploader` text NOT NULL,
	`name` text NOT NULL,
	`folder` text NOT NULL,
	`size` integer NOT NULL,
	`client_visible` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_files_project` ON `files` (`project`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`email` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_membership_project_email` ON `memberships` (`project`,`email`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`author` text NOT NULL,
	`channel` text NOT NULL,
	`body` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_messages_project` ON `messages` (`project`,`created`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`project` text NOT NULL,
	`body` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user` ON `notifications` (`user`,`created`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`amount` integer NOT NULL,
	`fee` integer NOT NULL,
	`status` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_project` ON `payments` (`project`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`executor` text,
	`title` text NOT NULL,
	`client` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`budget` integer NOT NULL,
	`deadline` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`hosting` text NOT NULL,
	`contact` integer DEFAULT 0 NOT NULL,
	`checklist` text NOT NULL,
	`payment_mode` text DEFAULT 'platform' NOT NULL,
	`secret` text,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_owner` ON `projects` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_projects_executor` ON `projects` (`executor`);--> statement-breakpoint
CREATE INDEX `idx_projects_status` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`checklist` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_templates_owner` ON `templates` (`owner`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`company` text NOT NULL,
	`role` text DEFAULT 'developer' NOT NULL,
	`brand` text DEFAULT '{}' NOT NULL,
	`created` text NOT NULL
);
