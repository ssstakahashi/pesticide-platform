CREATE TABLE "app_users" (
	"uid" text PRIMARY KEY NOT NULL,
	"is_anonymous" boolean NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_crop_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uid" text NOT NULL,
	"name" text NOT NULL,
	"field_name" text,
	"crop_name" text NOT NULL,
	"started_on" date,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_spray_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"registration_number" varchar(10) NOT NULL,
	"pesticide_name" text,
	"sprayed_date" date NOT NULL,
	"dilution" text,
	"amount" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_crop_seasons" ADD CONSTRAINT "user_crop_seasons_uid_app_users_uid_fk" FOREIGN KEY ("uid") REFERENCES "public"."app_users"("uid") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_spray_records" ADD CONSTRAINT "user_spray_records_season_id_user_crop_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."user_crop_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_app_users_anonymous_last_seen" ON "app_users" USING btree ("is_anonymous","last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_user_crop_seasons_uid_started" ON "user_crop_seasons" USING btree ("uid","started_on");--> statement-breakpoint
CREATE INDEX "idx_user_spray_records_season_date" ON "user_spray_records" USING btree ("season_id","sprayed_date");