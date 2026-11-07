CREATE TABLE "agr_collection_jobs" (
	"registration_number" varchar(10) PRIMARY KEY NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"last_stats" jsonb,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agr_manufacturer_domains" (
	"registrant_name" text PRIMARY KEY NOT NULL,
	"domains" text[] NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agr_pesticide_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_number" varchar(10) NOT NULL,
	"kind" varchar(20) DEFAULT 'other' NOT NULL,
	"title" text,
	"page_url" text,
	"page_count" integer,
	"source_url" text NOT NULL,
	"storage_path" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"byte_size" bigint NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"verification_score" integer DEFAULT 0 NOT NULL,
	"verification_details" jsonb,
	"verified_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agr_pesticide_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_number" varchar(10) NOT NULL,
	"alt_text" text,
	"page_url" text,
	"width" integer,
	"height" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_url" text NOT NULL,
	"storage_path" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"byte_size" bigint NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"verification_score" integer DEFAULT 0 NOT NULL,
	"verification_details" jsonb,
	"verified_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agr_pesticide_web_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_number" varchar(10) NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"source" varchar(20) DEFAULT 'search' NOT NULL,
	"http_status" integer,
	"last_checked_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"verification_score" integer DEFAULT 0 NOT NULL,
	"verification_details" jsonb,
	"verified_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agr_collection_jobs" ADD CONSTRAINT "agr_collection_jobs_registration_number_agr_pesticides_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."agr_pesticides"("registration_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_pesticide_documents" ADD CONSTRAINT "agr_pesticide_documents_registration_number_agr_pesticides_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."agr_pesticides"("registration_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_pesticide_images" ADD CONSTRAINT "agr_pesticide_images_registration_number_agr_pesticides_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."agr_pesticides"("registration_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_pesticide_web_pages" ADD CONSTRAINT "agr_pesticide_web_pages_registration_number_agr_pesticides_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."agr_pesticides"("registration_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agr_collection_jobs_next" ON "agr_collection_jobs" USING btree ("priority","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agr_documents_reg_sha" ON "agr_pesticide_documents" USING btree ("registration_number","sha256");--> statement-breakpoint
CREATE INDEX "idx_agr_documents_status" ON "agr_pesticide_documents" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agr_images_reg_sha" ON "agr_pesticide_images" USING btree ("registration_number","sha256");--> statement-breakpoint
CREATE INDEX "idx_agr_images_status" ON "agr_pesticide_images" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agr_web_pages_reg_url" ON "agr_pesticide_web_pages" USING btree ("registration_number","url");--> statement-breakpoint
CREATE INDEX "idx_agr_web_pages_status" ON "agr_pesticide_web_pages" USING btree ("status");