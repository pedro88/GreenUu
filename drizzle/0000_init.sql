CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"platform_role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"garden_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "garden" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"org_type" text NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"geohash4" text NOT NULL,
	"place_label" text,
	"altitude_m" integer,
	"koppen" text,
	"hardiness_zone" text,
	"soil_type" text DEFAULT 'unknown' NOT NULL,
	"soil_ph" numeric(3, 1),
	"exposure" text,
	"water_access" text,
	"timezone" text NOT NULL,
	"season_start_month" smallint DEFAULT 1 NOT NULL,
	"tile_size_cm" integer DEFAULT 50 NOT NULL,
	"plan_edit_min_role" text NOT NULL,
	"decor_min_role" text DEFAULT 'member' NOT NULL,
	"leaderboard_enabled" boolean DEFAULT false NOT NULL,
	"share_results" boolean DEFAULT false NOT NULL,
	"plan_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garden_lat_range" CHECK ("garden"."lat" between -90 and 90),
	CONSTRAINT "garden_lng_range" CHECK ("garden"."lng" between -180 and 180),
	CONSTRAINT "garden_ph_range" CHECK ("garden"."soil_ph" is null or "garden"."soil_ph" between 0 and 14),
	CONSTRAINT "garden_season_month" CHECK ("garden"."season_start_month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "garden_environment" (
	"garden_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "garden_environment_garden_id_environment_pk" PRIMARY KEY("garden_id","environment")
);
--> statement-breakpoint
CREATE TABLE "garden_group" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'green' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garden_group_garden_id_id_uq" UNIQUE("garden_id","id")
);
--> statement-breakpoint
CREATE TABLE "garden_invitation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garden_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "garden_member" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garden_member_garden_id_id_uq" UNIQUE("garden_id","id")
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"garden_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_member_group_id_member_id_pk" PRIMARY KEY("group_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_garden_year_uq" UNIQUE("garden_id","year"),
	CONSTRAINT "season_garden_id_id_uq" UNIQUE("garden_id","id"),
	CONSTRAINT "season_dates" CHECK ("season"."starts_on" < "season"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"pseudo" "citext" NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"default_view" text DEFAULT 'classic' NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"profile_visibility" text DEFAULT 'members' NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_pseudo_unique" UNIQUE("pseudo")
);
--> statement-breakpoint
CREATE TABLE "practice" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "practice_declaration" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"zone_id" uuid,
	"practice_id" uuid NOT NULL,
	"season_id" uuid,
	"details" jsonb,
	"excluded" boolean DEFAULT false NOT NULL,
	"decor_placement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"parent_id" uuid,
	"zone_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"depth" smallint DEFAULT 0 NOT NULL,
	"environment" text,
	"surface_m2_manual" numeric(10, 2),
	"length_cm" integer,
	"width_cm" integer,
	"geometry" jsonb,
	"scene_zone_id" uuid,
	"has_interior" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_garden_id_id_uq" UNIQUE("garden_id","id"),
	CONSTRAINT "zone_depth_max" CHECK ("zone"."depth" between 0 and 7),
	CONSTRAINT "zone_not_own_parent" CHECK ("zone"."parent_id" is null or "zone"."parent_id" <> "zone"."id"),
	CONSTRAINT "zone_surface_positive" CHECK ("zone"."surface_m2_manual" is null or "zone"."surface_m2_manual" > 0),
	CONSTRAINT "zone_dims_positive" CHECK (("zone"."length_cm" is null or "zone"."length_cm" > 0) and ("zone"."width_cm" is null or "zone"."width_cm" > 0))
);
--> statement-breakpoint
CREATE TABLE "zone_group_permission" (
	"garden_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_group_permission_zone_id_group_id_pk" PRIMARY KEY("zone_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "zone_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"can_host_cultures" boolean DEFAULT true NOT NULL,
	"has_interior_default" boolean DEFAULT false NOT NULL,
	"default_environment" text,
	"sort_order" smallint DEFAULT 100 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"garden_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden" ADD CONSTRAINT "garden_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_environment" ADD CONSTRAINT "garden_environment_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_group" ADD CONSTRAINT "garden_group_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_invitation" ADD CONSTRAINT "garden_invitation_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_invitation" ADD CONSTRAINT "garden_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_invitation" ADD CONSTRAINT "garden_invitation_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_member" ADD CONSTRAINT "garden_member_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_member" ADD CONSTRAINT "garden_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_member" ADD CONSTRAINT "garden_member_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_same_garden_fk" FOREIGN KEY ("garden_id","group_id") REFERENCES "public"."garden_group"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_member_same_garden_fk" FOREIGN KEY ("garden_id","member_id") REFERENCES "public"."garden_member"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_declaration" ADD CONSTRAINT "practice_declaration_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_declaration" ADD CONSTRAINT "practice_declaration_practice_id_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_declaration" ADD CONSTRAINT "practice_decl_zone_same_garden_fk" FOREIGN KEY ("garden_id","zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_declaration" ADD CONSTRAINT "practice_decl_season_same_garden_fk" FOREIGN KEY ("garden_id","season_id") REFERENCES "public"."season"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_zone_type_id_zone_type_id_fk" FOREIGN KEY ("zone_type_id") REFERENCES "public"."zone_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_parent_same_garden_fk" FOREIGN KEY ("garden_id","parent_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_scene_same_garden_fk" FOREIGN KEY ("garden_id","scene_zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_group_permission" ADD CONSTRAINT "zgp_zone_same_garden_fk" FOREIGN KEY ("garden_id","zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_group_permission" ADD CONSTRAINT "zgp_group_same_garden_fk" FOREIGN KEY ("garden_id","group_id") REFERENCES "public"."garden_group"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_type" ADD CONSTRAINT "zone_type_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_event" ADD CONSTRAINT "domain_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "consent_user_id_idx" ON "consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_garden_id_idx" ON "consent" USING btree ("garden_id");--> statement-breakpoint
CREATE INDEX "garden_created_by_idx" ON "garden" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "garden_group_active_name_uq" ON "garden_group" USING btree ("garden_id",lower("name")) WHERE "garden_group"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "garden_invitation_garden_email_idx" ON "garden_invitation" USING btree ("garden_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "garden_invitation_active_uq" ON "garden_invitation" USING btree ("garden_id","email") WHERE "garden_invitation"."accepted_at" is null and "garden_invitation"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "garden_invitation_invited_by_idx" ON "garden_invitation" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "garden_invitation_accepted_by_idx" ON "garden_invitation" USING btree ("accepted_by");--> statement-breakpoint
CREATE UNIQUE INDEX "garden_member_active_uq" ON "garden_member" USING btree ("garden_id","user_id") WHERE "garden_member"."left_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "garden_member_one_owner_uq" ON "garden_member" USING btree ("garden_id") WHERE "garden_member"."left_at" is null and "garden_member"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "garden_member_user_active_idx" ON "garden_member" USING btree ("user_id") WHERE "garden_member"."left_at" is null;--> statement-breakpoint
CREATE INDEX "garden_member_removed_by_idx" ON "garden_member" USING btree ("removed_by");--> statement-breakpoint
CREATE INDEX "group_member_member_idx" ON "group_member" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "group_member_garden_idx" ON "group_member" USING btree ("garden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_declaration_uq" ON "practice_declaration" USING btree ("garden_id",coalesce("zone_id", '00000000-0000-0000-0000-000000000000'::uuid),"practice_id",coalesce("season_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "practice_declaration_garden_zone_idx" ON "practice_declaration" USING btree ("garden_id","zone_id");--> statement-breakpoint
CREATE INDEX "practice_declaration_practice_idx" ON "practice_declaration" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "practice_declaration_season_idx" ON "practice_declaration" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "zone_garden_parent_idx" ON "zone" USING btree ("garden_id","parent_id");--> statement-breakpoint
CREATE INDEX "zone_garden_path_idx" ON "zone" USING btree ("garden_id","path" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "zone_garden_scene_idx" ON "zone" USING btree ("garden_id","scene_zone_id");--> statement-breakpoint
CREATE INDEX "zone_type_idx" ON "zone" USING btree ("zone_type_id");--> statement-breakpoint
CREATE INDEX "zone_group_permission_group_idx" ON "zone_group_permission" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "zone_group_permission_garden_idx" ON "zone_group_permission" USING btree ("garden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zone_type_code_uq" ON "zone_type" USING btree (coalesce("garden_id", '00000000-0000-0000-0000-000000000000'::uuid),"code");--> statement-breakpoint
CREATE INDEX "zone_type_garden_idx" ON "zone_type" USING btree ("garden_id");--> statement-breakpoint
CREATE INDEX "domain_event_undispatched_idx" ON "domain_event" USING btree ("occurred_at") WHERE "domain_event"."dispatched_at" is null;--> statement-breakpoint
CREATE INDEX "domain_event_actor_idx" ON "domain_event" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_event_garden_idx" ON "domain_event" USING btree ("garden_id","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_event_subject_idx" ON "domain_event" USING btree ("subject_type","subject_id");