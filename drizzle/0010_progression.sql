CREATE TABLE "garden_goal" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"group_id" uuid,
	"title" text NOT NULL,
	"metric" text NOT NULL,
	"target" numeric(10, 2) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_period" CHECK ("garden_goal"."period_start" <= "garden_goal"."period_end"),
	CONSTRAINT "goal_target_positive" CHECK ("garden_goal"."target" > 0)
);
--> statement-breakpoint
CREATE TABLE "quest" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"garden_id" uuid,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"ticket_id" uuid,
	"stage_id" uuid,
	"culture_id" uuid,
	"template_code" text,
	"title_key" text NOT NULL,
	"title_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target" integer DEFAULT 1 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievement" (
	"user_id" uuid NOT NULL,
	"achievement_code" text NOT NULL,
	"garden_id" uuid,
	"earned_at" timestamp with time zone NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "user_achievement_user_id_achievement_code_pk" PRIMARY KEY("user_id","achievement_code")
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"skills" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recomputed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_flag" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"events" integer NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"garden_id" uuid,
	"event_id" uuid,
	"action_code" text NOT NULL,
	"amount" integer NOT NULL,
	"skill_primary" text,
	"skill_secondary" text,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reverses_entry_id" uuid,
	"subject_id" uuid,
	"culture_id" uuid,
	"local_day" date NOT NULL,
	"rules_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "leaderboard_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "garden_goal" ADD CONSTRAINT "garden_goal_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_goal" ADD CONSTRAINT "garden_goal_group_id_garden_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."garden_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_goal" ADD CONSTRAINT "garden_goal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_stage_id_culture_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."culture_stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_flag" ADD CONSTRAINT "xp_flag_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger_entry" ADD CONSTRAINT "xp_ledger_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger_entry" ADD CONSTRAINT "xp_ledger_entry_event_id_domain_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger_entry" ADD CONSTRAINT "xp_ledger_entry_reverses_entry_id_xp_ledger_entry_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."xp_ledger_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "garden_goal_garden_idx" ON "garden_goal" USING btree ("garden_id");--> statement-breakpoint
CREATE INDEX "garden_goal_group_idx" ON "garden_goal" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_unique_per_period" ON "quest" USING btree ("user_id","kind","period_start",coalesce("ticket_id"::text, "stage_id"::text, "culture_id"::text, "template_code"));--> statement-breakpoint
CREATE INDEX "quest_user_status_idx" ON "quest" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "quest_ticket_idx" ON "quest" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "quest_stage_idx" ON "quest" USING btree ("stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_flag_user_window_uq" ON "xp_flag" USING btree ("user_id","window_start");--> statement-breakpoint
CREATE INDEX "xp_flag_open_idx" ON "xp_flag" USING btree ("created_at") WHERE "xp_flag"."reviewed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "xp_ledger_idempotency_uq" ON "xp_ledger_entry" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "xp_ledger_user_day_idx" ON "xp_ledger_entry" USING btree ("user_id","local_day","action_code");--> statement-breakpoint
CREATE INDEX "xp_ledger_user_created_idx" ON "xp_ledger_entry" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_ledger_garden_idx" ON "xp_ledger_entry" USING btree ("garden_id");--> statement-breakpoint
CREATE INDEX "xp_ledger_subject_idx" ON "xp_ledger_entry" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "xp_ledger_culture_idx" ON "xp_ledger_entry" USING btree ("culture_id");--> statement-breakpoint
CREATE INDEX "xp_ledger_event_idx" ON "xp_ledger_entry" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "xp_ledger_reverses_idx" ON "xp_ledger_entry" USING btree ("reverses_entry_id");