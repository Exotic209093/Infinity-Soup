CREATE TABLE `lead_post` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`urn` text,
	`text` text,
	`posted_at` text,
	`url` text,
	`likes` integer,
	`comments` integer,
	`reposts` integer,
	`is_repost` integer,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade
);
