CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"garden_id" uuid,
	"type" text NOT NULL,
	"group_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_user_id_type_channel_pk" PRIMARY KEY("user_id","type","channel")
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"zone_id" uuid,
	"culture_id" uuid,
	"level" text GENERATED ALWAYS AS (case when culture_id is not null then 'culture' when zone_id is not null then 'zone' else 'garden' end) STORED,
	"type" text NOT NULL,
	"action_tag" text,
	"title" text NOT NULL,
	"title_key" text,
	"title_params" jsonb,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_on" date,
	"visible_from" date,
	"source" text DEFAULT 'manual' NOT NULL,
	"series_id" uuid,
	"occurrence_on" date,
	"detached" boolean DEFAULT false NOT NULL,
	"source_stage_id" uuid,
	"source_guide_version_id" uuid,
	"created_by" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"first_completed_at" timestamp with time zone,
	"due_soon_notified_at" timestamp with time zone,
	"overdue_notified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_garden_id_id_uq" UNIQUE("garden_id","id"),
	CONSTRAINT "ticket_one_target" CHECK (num_nonnulls("ticket"."zone_id", "ticket"."culture_id") <= 1),
	CONSTRAINT "ticket_title_length" CHECK (char_length("ticket"."title") between 3 and 140)
);
--> statement-breakpoint
CREATE TABLE "ticket_assignee" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"member_id" uuid,
	"group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignee_one_target" CHECK (num_nonnulls("ticket_assignee"."member_id", "ticket_assignee"."group_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "ticket_checklist_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"label" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_series" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"zone_id" uuid,
	"culture_id" uuid,
	"template" jsonb NOT NULL,
	"rrule" text NOT NULL,
	"dtstart" date NOT NULL,
	"until" date,
	"skip_missed" boolean DEFAULT true NOT NULL,
	"assignees" jsonb DEFAULT '{"memberIds":[],"groupIds":[]}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_series_garden_id_id_uq" UNIQUE("garden_id","id"),
	CONSTRAINT "series_one_target" CHECK (num_nonnulls("ticket_series"."zone_id", "ticket_series"."culture_id") <= 1)
);
--> statement-breakpoint
ALTER TABLE "attachment" DROP CONSTRAINT "attachment_max_one_target";--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "ticket_id" uuid;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "ticket_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_source_stage_id_culture_stage_id_fk" FOREIGN KEY ("source_stage_id") REFERENCES "public"."culture_stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_zone_same_garden_fk" FOREIGN KEY ("garden_id","zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_culture_same_garden_fk" FOREIGN KEY ("garden_id","culture_id") REFERENCES "public"."culture"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_series_same_garden_fk" FOREIGN KEY ("garden_id","series_id") REFERENCES "public"."ticket_series"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignee" ADD CONSTRAINT "assignee_ticket_same_garden_fk" FOREIGN KEY ("garden_id","ticket_id") REFERENCES "public"."ticket"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignee" ADD CONSTRAINT "assignee_member_same_garden_fk" FOREIGN KEY ("garden_id","member_id") REFERENCES "public"."garden_member"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignee" ADD CONSTRAINT "assignee_group_same_garden_fk" FOREIGN KEY ("garden_id","group_id") REFERENCES "public"."garden_group"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist_item" ADD CONSTRAINT "ticket_checklist_item_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_series" ADD CONSTRAINT "ticket_series_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_series" ADD CONSTRAINT "ticket_series_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_series" ADD CONSTRAINT "series_zone_same_garden_fk" FOREIGN KEY ("garden_id","zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_series" ADD CONSTRAINT "series_culture_same_garden_fk" FOREIGN KEY ("garden_id","culture_id") REFERENCES "public"."culture"("garden_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notification_group_idx" ON "notification" USING btree ("user_id","type","group_key","created_at");--> statement-breakpoint
CREATE INDEX "notification_garden_idx" ON "notification" USING btree ("garden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_series_occurrence_uq" ON "ticket" USING btree ("series_id","occurrence_on");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_source_stage_uq" ON "ticket" USING btree ("source_stage_id") WHERE "ticket"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ticket_garden_status_due_idx" ON "ticket" USING btree ("garden_id","status","due_on") WHERE "ticket"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ticket_garden_zone_idx" ON "ticket" USING btree ("garden_id","zone_id");--> statement-breakpoint
CREATE INDEX "ticket_garden_culture_idx" ON "ticket" USING btree ("garden_id","culture_id");--> statement-breakpoint
CREATE INDEX "ticket_garden_visible_idx" ON "ticket" USING btree ("garden_id","visible_from");--> statement-breakpoint
CREATE INDEX "ticket_series_idx" ON "ticket" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "ticket_created_by_idx" ON "ticket" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "ticket_completed_by_idx" ON "ticket" USING btree ("completed_by");--> statement-breakpoint
CREATE INDEX "ticket_due_reminder_idx" ON "ticket" USING btree ("due_on") WHERE "ticket"."deleted_at" is null and "ticket"."status" in ('todo', 'in_progress', 'blocked');--> statement-breakpoint
CREATE UNIQUE INDEX "assignee_member_uq" ON "ticket_assignee" USING btree ("ticket_id","member_id") WHERE "ticket_assignee"."member_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "assignee_group_uq" ON "ticket_assignee" USING btree ("ticket_id","group_id") WHERE "ticket_assignee"."group_id" is not null;--> statement-breakpoint
CREATE INDEX "assignee_member_idx" ON "ticket_assignee" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "assignee_group_idx" ON "ticket_assignee" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "assignee_ticket_idx" ON "ticket_assignee" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "checklist_ticket_idx" ON "ticket_checklist_item" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "comment_ticket_idx" ON "ticket_comment" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_author_idx" ON "ticket_comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "ticket_event_ticket_idx" ON "ticket_event" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_event_actor_idx" ON "ticket_event" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "ticket_series_garden_idx" ON "ticket_series" USING btree ("garden_id") WHERE "ticket_series"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "ticket_series_zone_idx" ON "ticket_series" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "ticket_series_culture_idx" ON "ticket_series" USING btree ("culture_id");--> statement-breakpoint
CREATE INDEX "ticket_series_created_by_idx" ON "ticket_series" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "attachment_ticket_idx" ON "attachment" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "attachment_comment_idx" ON "attachment" USING btree ("ticket_comment_id");--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_max_one_target" CHECK (num_nonnulls("attachment"."journal_entry_id", "attachment"."ticket_id", "attachment"."ticket_comment_id") <= 1);