CREATE TABLE "botanical_family" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"latin_name" text NOT NULL,
	"rotation_return_years" smallint DEFAULT 2 NOT NULL,
	"sprite_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "botanical_family_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "companion" (
	"species_a_id" uuid NOT NULL,
	"species_b_id" uuid NOT NULL,
	"effect" text NOT NULL,
	"note_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companion_species_a_id_species_b_id_pk" PRIMARY KEY("species_a_id","species_b_id"),
	CONSTRAINT "companion_ordered" CHECK ("companion"."species_a_id" < "companion"."species_b_id")
);
--> statement-breakpoint
CREATE TABLE "problem" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "species" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"family_id" uuid NOT NULL,
	"latin_name" text NOT NULL,
	"common_names" jsonb NOT NULL,
	"visual_model" text NOT NULL,
	"skill_domain" text NOT NULL,
	"perennial" boolean DEFAULT false NOT NULL,
	"green_manure" boolean DEFAULT false NOT NULL,
	"sun" text NOT NULL,
	"water" text NOT NULL,
	"temp_min_c" numeric(4, 1),
	"temp_opt_c" numeric(4, 1),
	"temp_max_c" numeric(4, 1),
	"spacing_row_cm" integer,
	"spacing_plant_cm" integer,
	"days_to_maturity_min" integer,
	"days_to_maturity_max" integer,
	"avg_unit_weight_g" numeric(8, 1),
	"sprite_key" text,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "species_latin_name_unique" UNIQUE("latin_name")
);
--> statement-breakpoint
CREATE TABLE "species_calendar" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"species_id" uuid NOT NULL,
	"koppen_group" text NOT NULL,
	"environment" text NOT NULL,
	"method" text NOT NULL,
	"stage" text NOT NULL,
	"window_start_doy" smallint NOT NULL,
	"window_end_doy" smallint NOT NULL,
	"source" text DEFAULT 'reference' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "species_calendar_doy" CHECK ("species_calendar"."window_start_doy" between 1 and 366 and "species_calendar"."window_end_doy" between 1 and 366)
);
--> statement-breakpoint
CREATE TABLE "variety" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"species_id" uuid NOT NULL,
	"name" text NOT NULL,
	"origin" text DEFAULT 'commercial' NOT NULL,
	"description" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"proposed_by" uuid,
	"proposed_garden_id" uuid,
	"merged_into_id" uuid,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"moderation_note" text,
	"sprite_key" text,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"journal_entry_id" uuid,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachment_max_one_target" CHECK (num_nonnulls("attachment"."journal_entry_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "culture" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"species_id" uuid NOT NULL,
	"variety_id" uuid,
	"method" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"plant_count" integer,
	"area_m2" numeric(10, 2),
	"seed_source" text DEFAULT 'unknown' NOT NULL,
	"seed_parent_culture_id" uuid,
	"rotation_override" boolean DEFAULT false NOT NULL,
	"applied_guide_version_id" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	"occupied_from" date,
	"occupied_to" date,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "culture_garden_id_id_uq" UNIQUE("garden_id","id"),
	CONSTRAINT "culture_area_positive" CHECK ("culture"."area_m2" is null or "culture"."area_m2" > 0),
	CONSTRAINT "culture_plants_positive" CHECK ("culture"."plant_count" is null or "culture"."plant_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "culture_stage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"culture_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"planned_on" date,
	"actual_on" date,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvest" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"culture_id" uuid NOT NULL,
	"harvested_on" date NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit" text NOT NULL,
	"quantity_kg" numeric(10, 3),
	"quality" smallint,
	"seed_saving" boolean DEFAULT false NOT NULL,
	"note" text,
	"author_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "harvest_quantity_positive" CHECK ("harvest"."quantity" > 0),
	CONSTRAINT "harvest_quality" CHECK ("harvest"."quality" is null or "harvest"."quality" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "journal_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"culture_id" uuid,
	"zone_id" uuid,
	"kind" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"body" text,
	"problem_id" uuid,
	"problem_other" text,
	"severity" smallint,
	"intervention" text,
	"weather" jsonb,
	"resolved" boolean DEFAULT false NOT NULL,
	"author_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_one_target" CHECK (num_nonnulls("journal_entry"."culture_id", "journal_entry"."zone_id") = 1),
	CONSTRAINT "journal_severity" CHECK ("journal_entry"."severity" is null or "journal_entry"."severity" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "companion" ADD CONSTRAINT "companion_species_a_id_species_id_fk" FOREIGN KEY ("species_a_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion" ADD CONSTRAINT "companion_species_b_id_species_id_fk" FOREIGN KEY ("species_b_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species" ADD CONSTRAINT "species_family_id_botanical_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."botanical_family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_calendar" ADD CONSTRAINT "species_calendar_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variety" ADD CONSTRAINT "variety_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variety" ADD CONSTRAINT "variety_proposed_by_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variety" ADD CONSTRAINT "variety_proposed_garden_id_garden_id_fk" FOREIGN KEY ("proposed_garden_id") REFERENCES "public"."garden"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variety" ADD CONSTRAINT "variety_moderated_by_user_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_variety_id_variety_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."variety"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_zone_same_garden_fk" FOREIGN KEY ("garden_id","zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_season_same_garden_fk" FOREIGN KEY ("garden_id","season_id") REFERENCES "public"."season"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_seed_parent_fk" FOREIGN KEY ("seed_parent_culture_id") REFERENCES "public"."culture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_stage" ADD CONSTRAINT "culture_stage_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_stage" ADD CONSTRAINT "stage_culture_same_garden_fk" FOREIGN KEY ("garden_id","culture_id") REFERENCES "public"."culture"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest" ADD CONSTRAINT "harvest_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest" ADD CONSTRAINT "harvest_culture_same_garden_fk" FOREIGN KEY ("garden_id","culture_id") REFERENCES "public"."culture"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_culture_same_garden_fk" FOREIGN KEY ("garden_id","culture_id") REFERENCES "public"."culture"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_zone_same_garden_fk" FOREIGN KEY ("garden_id","zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companion_b_idx" ON "companion" USING btree ("species_b_id");--> statement-breakpoint
CREATE INDEX "species_family_idx" ON "species" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "species_search_trgm_idx" ON "species" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "species_calendar_species_idx" ON "species_calendar" USING btree ("species_id");--> statement-breakpoint
CREATE UNIQUE INDEX "species_calendar_uq" ON "species_calendar" USING btree ("species_id","koppen_group","environment","method","stage");--> statement-breakpoint
CREATE INDEX "variety_species_idx" ON "variety" USING btree ("species_id");--> statement-breakpoint
CREATE INDEX "variety_status_idx" ON "variety" USING btree ("status");--> statement-breakpoint
CREATE INDEX "variety_proposed_by_idx" ON "variety" USING btree ("proposed_by");--> statement-breakpoint
CREATE INDEX "variety_proposed_garden_idx" ON "variety" USING btree ("proposed_garden_id");--> statement-breakpoint
CREATE INDEX "variety_merged_into_idx" ON "variety" USING btree ("merged_into_id");--> statement-breakpoint
CREATE INDEX "variety_moderated_by_idx" ON "variety" USING btree ("moderated_by");--> statement-breakpoint
CREATE INDEX "variety_search_trgm_idx" ON "variety" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "variety_species_name_approved_uq" ON "variety" USING btree ("species_id",lower("name")) WHERE "variety"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "attachment_garden_idx" ON "attachment" USING btree ("garden_id");--> statement-breakpoint
CREATE INDEX "attachment_journal_idx" ON "attachment" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "attachment_uploaded_by_idx" ON "attachment" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "culture_garden_season_idx" ON "culture" USING btree ("garden_id","season_id") WHERE "culture"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "culture_garden_zone_occ_idx" ON "culture" USING btree ("garden_id","zone_id","occupied_from") WHERE "culture"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "culture_species_idx" ON "culture" USING btree ("species_id");--> statement-breakpoint
CREATE INDEX "culture_variety_idx" ON "culture" USING btree ("variety_id");--> statement-breakpoint
CREATE INDEX "culture_created_by_idx" ON "culture" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "culture_deleted_by_idx" ON "culture" USING btree ("deleted_by");--> statement-breakpoint
CREATE INDEX "culture_seed_parent_idx" ON "culture" USING btree ("seed_parent_culture_id");--> statement-breakpoint
CREATE INDEX "culture_season_idx" ON "culture" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "culture_stage_uq" ON "culture_stage" USING btree ("culture_id","stage");--> statement-breakpoint
CREATE INDEX "culture_stage_planned_idx" ON "culture_stage" USING btree ("garden_id","planned_on") WHERE "culture_stage"."actual_on" is null;--> statement-breakpoint
CREATE INDEX "culture_stage_recorded_by_idx" ON "culture_stage" USING btree ("recorded_by");--> statement-breakpoint
CREATE INDEX "harvest_culture_idx" ON "harvest" USING btree ("garden_id","culture_id","harvested_on") WHERE "harvest"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "harvest_author_idx" ON "harvest" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "journal_culture_idx" ON "journal_entry" USING btree ("garden_id","culture_id","observed_at") WHERE "journal_entry"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "journal_zone_idx" ON "journal_entry" USING btree ("garden_id","zone_id","observed_at") WHERE "journal_entry"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "journal_problem_idx" ON "journal_entry" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "journal_author_idx" ON "journal_entry" USING btree ("author_id");