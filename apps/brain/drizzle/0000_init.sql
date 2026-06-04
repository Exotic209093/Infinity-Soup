CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`target` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`created_at` integer NOT NULL,
	`dispatched_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `lead` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_url` text NOT NULL,
	`full_name` text NOT NULL,
	`headline` text,
	`location` text,
	`about` text,
	`current_company` text,
	`current_title` text,
	`profile_raw` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `lead_certification` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`name` text NOT NULL,
	`issuer` text,
	`issued_date` text,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lead_education` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`school` text,
	`degree` text,
	`field` text,
	`start_year` integer,
	`end_year` integer,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lead_experience` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`title` text,
	`company` text,
	`employment_type` text,
	`start_date` text,
	`end_date` text,
	`is_current` integer,
	`location` text,
	`company_url` text,
	`description` text,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lead_skill` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade
);
