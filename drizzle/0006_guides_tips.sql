CREATE TABLE "content_report" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"guide_id" uuid,
	"tip_id" uuid,
	"reported_user_id" uuid,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_report_one_target" CHECK (num_nonnulls("content_report"."guide_id", "content_report"."tip_id", "content_report"."reported_user_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "guide" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"author_id" uuid NOT NULL,
	"garden_id" uuid,
	"species_id" uuid NOT NULL,
	"variety_id" uuid,
	"visibility" text NOT NULL,
	"slug" text NOT NULL,
	"forked_from_version_id" uuid,
	"current_version_id" uuid,
	"draft" jsonb NOT NULL,
	"hidden_by_moderation" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_private_has_garden" CHECK (("guide"."visibility" = 'private') = ("guide"."garden_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "guide_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"guide_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"context" jsonb NOT NULL,
	"calendar_template" jsonb,
	"change_note" text,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tip" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"author_id" uuid NOT NULL,
	"species_id" uuid,
	"body" text NOT NULL,
	"geohash4" text,
	"koppen" text,
	"environment" text,
	"useful_count" integer DEFAULT 0 NOT NULL,
	"not_useful_count" integer DEFAULT 0 NOT NULL,
	"hidden_by_moderation" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tip_body_length" CHECK (char_length("tip"."body") between 10 and 500)
);
--> statement-breakpoint
CREATE TABLE "tip_tag" (
	"tip_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "tip_tag_tip_id_tag_id_pk" PRIMARY KEY("tip_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tip_vote" (
	"tip_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tip_vote_tip_id_user_id_pk" PRIMARY KEY("tip_id","user_id"),
	CONSTRAINT "tip_vote_value" CHECK ("tip_vote"."value" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_guide_id_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_tip_id_tip_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reported_user_id_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_variety_id_variety_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."variety"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_forked_from_version_id_guide_version_id_fk" FOREIGN KEY ("forked_from_version_id") REFERENCES "public"."guide_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_current_version_id_guide_version_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."guide_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_version" ADD CONSTRAINT "guide_version_guide_id_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip" ADD CONSTRAINT "tip_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip" ADD CONSTRAINT "tip_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_tag" ADD CONSTRAINT "tip_tag_tip_id_tip_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_tag" ADD CONSTRAINT "tip_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_vote" ADD CONSTRAINT "tip_vote_tip_id_tip_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_vote" ADD CONSTRAINT "tip_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_guide_uq" ON "content_report" USING btree ("reporter_id","guide_id") WHERE "content_report"."guide_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_tip_uq" ON "content_report" USING btree ("reporter_id","tip_id") WHERE "content_report"."tip_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_user_uq" ON "content_report" USING btree ("reporter_id","reported_user_id") WHERE "content_report"."reported_user_id" is not null;--> statement-breakpoint
CREATE INDEX "content_report_status_idx" ON "content_report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_report_guide_idx" ON "content_report" USING btree ("guide_id");--> statement-breakpoint
CREATE INDEX "content_report_tip_idx" ON "content_report" USING btree ("tip_id");--> statement-breakpoint
CREATE INDEX "content_report_reported_user_idx" ON "content_report" USING btree ("reported_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_slug_uq" ON "guide" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "guide_visibility_species_idx" ON "guide" USING btree ("visibility","species_id") WHERE "guide"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "guide_author_idx" ON "guide" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "guide_garden_idx" ON "guide" USING btree ("garden_id");--> statement-breakpoint
CREATE INDEX "guide_forked_from_idx" ON "guide" USING btree ("forked_from_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_version_number_uq" ON "guide_version" USING btree ("guide_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_slug_uq" ON "tag" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tip_feed_idx" ON "tip" USING btree ("created_at") WHERE "tip"."deleted_at" is null and not "tip"."hidden_by_moderation";--> statement-breakpoint
CREATE INDEX "tip_author_idx" ON "tip" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "tip_species_idx" ON "tip" USING btree ("species_id");--> statement-breakpoint
CREATE INDEX "tip_tag_tag_idx" ON "tip_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tip_vote_user_idx" ON "tip_vote" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_applied_guide_version_id_guide_version_id_fk" FOREIGN KEY ("applied_guide_version_id") REFERENCES "public"."guide_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_source_guide_version_id_guide_version_id_fk" FOREIGN KEY ("source_guide_version_id") REFERENCES "public"."guide_version"("id") ON DELETE set null ON UPDATE no action;