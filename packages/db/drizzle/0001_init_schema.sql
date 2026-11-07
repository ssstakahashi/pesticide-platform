CREATE TABLE "agr_crops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"level" integer DEFAULT 3 NOT NULL,
	"synonyms" text[],
	CONSTRAINT "agr_crops_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "agr_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"total_count_group_name" text,
	"frac_code" varchar(20),
	"irac_code" varchar(20),
	"hrac_code" varchar(20),
	CONSTRAINT "agr_ingredients_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "agr_pesticide_ingredients" (
	"registration_number" varchar(10) NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"ordinal_position" integer NOT NULL,
	"concentration_text" text,
	CONSTRAINT "agr_pesticide_ingredients_registration_number_ordinal_position_pk" PRIMARY KEY("registration_number","ordinal_position")
);
--> statement-breakpoint
CREATE TABLE "agr_pesticides" (
	"registration_number" varchar(10) PRIMARY KEY NOT NULL,
	"raw_id" uuid,
	"pesticide_type" text,
	"name" text NOT NULL,
	"registrant_name" text,
	"usage_category" text,
	"formulation_type" text,
	"mixture_count" integer,
	"registered_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agr_pests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" varchar(50),
	CONSTRAINT "agr_pests_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "agr_usage_ingredient_limits" (
	"usage_rule_id" uuid NOT NULL,
	"ordinal_position" integer NOT NULL,
	"ingredient_id" uuid,
	"limit_text" text NOT NULL,
	"max_total_count" integer,
	CONSTRAINT "agr_usage_ingredient_limits_usage_rule_id_ordinal_position_pk" PRIMARY KEY("usage_rule_id","ordinal_position")
);
--> statement-breakpoint
CREATE TABLE "agr_usage_pests" (
	"usage_rule_id" uuid NOT NULL,
	"pest_id" uuid NOT NULL,
	"condition_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "agr_usage_pests_usage_rule_id_pest_id_condition_note_pk" PRIMARY KEY("usage_rule_id","pest_id","condition_note")
);
--> statement-breakpoint
CREATE TABLE "agr_usage_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"registration_number" varchar(10) NOT NULL,
	"crop_id" uuid NOT NULL,
	"raw_crop_name" text NOT NULL,
	"crop_condition" text,
	"excluded_crop_names" text[],
	"excluded_crop_ids" uuid[],
	"application_place" text,
	"purpose" text,
	"application_method" text,
	"dilution_text" text,
	"dilution_min" numeric,
	"dilution_max" numeric,
	"dilution_unit" varchar(50),
	"liquid_amount" text,
	"usage_timing_text" text,
	"phi_days" integer,
	"max_applications_text" text,
	"max_applications_count" integer,
	"fumigation_time" text,
	"fumigation_temperature" text,
	"soil_type" text,
	"zone_name" text,
	"applied_pesticide_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agr_pesticide_ingredients" ADD CONSTRAINT "agr_pesticide_ingredients_registration_number_agr_pesticides_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."agr_pesticides"("registration_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_pesticide_ingredients" ADD CONSTRAINT "agr_pesticide_ingredients_ingredient_id_agr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."agr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_usage_ingredient_limits" ADD CONSTRAINT "agr_usage_ingredient_limits_usage_rule_id_agr_usage_rules_id_fk" FOREIGN KEY ("usage_rule_id") REFERENCES "public"."agr_usage_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_usage_ingredient_limits" ADD CONSTRAINT "agr_usage_ingredient_limits_ingredient_id_agr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."agr_ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_usage_pests" ADD CONSTRAINT "agr_usage_pests_usage_rule_id_agr_usage_rules_id_fk" FOREIGN KEY ("usage_rule_id") REFERENCES "public"."agr_usage_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_usage_pests" ADD CONSTRAINT "agr_usage_pests_pest_id_agr_pests_id_fk" FOREIGN KEY ("pest_id") REFERENCES "public"."agr_pests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_usage_rules" ADD CONSTRAINT "agr_usage_rules_registration_number_agr_pesticides_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."agr_pesticides"("registration_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agr_usage_rules" ADD CONSTRAINT "agr_usage_rules_crop_id_agr_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."agr_crops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agr_crops_parent_id" ON "agr_crops" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_agr_crops_name_trgm" ON "agr_crops" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_agr_ingredients_name_trgm" ON "agr_ingredients" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_agr_pesticide_ing_ing_id" ON "agr_pesticide_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "idx_agr_pesticides_name_trgm" ON "agr_pesticides" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_agr_pests_name_trgm" ON "agr_pests" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_agr_usage_limits_ing_id" ON "agr_usage_ingredient_limits" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "idx_agr_usage_pests_pest_id" ON "agr_usage_pests" USING btree ("pest_id");--> statement-breakpoint
CREATE INDEX "idx_agr_usage_rules_crop_id" ON "agr_usage_rules" USING btree ("crop_id");--> statement-breakpoint
CREATE INDEX "idx_agr_usage_rules_reg_num" ON "agr_usage_rules" USING btree ("registration_number");