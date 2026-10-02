CREATE TABLE "culture_result" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"culture_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"total_kg" numeric(10, 3),
	"area_m2" numeric(10, 2),
	"yield_kg_m2" numeric(10, 3),
	"quality" smallint,
	"success_pct" smallint,
	"rating" smallint,
	"would_grow_again" boolean,
	"no_harvest" boolean DEFAULT false NOT NULL,
	"problems_reviewed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"completeness" smallint NOT NULL,
	"author_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_quality_range" CHECK ("culture_result"."quality" is null or "culture_result"."quality" between 1 and 5),
	CONSTRAINT "result_rating_range" CHECK ("culture_result"."rating" is null or "culture_result"."rating" between 1 and 5),
	CONSTRAINT "result_success_range" CHECK ("culture_result"."success_pct" is null or "culture_result"."success_pct" between 0 and 100),
	CONSTRAINT "result_completeness_range" CHECK ("culture_result"."completeness" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "culture_result_problem" (
	"result_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"severity" smallint DEFAULT 2 NOT NULL,
	CONSTRAINT "culture_result_problem_result_id_problem_id_pk" PRIMARY KEY("result_id","problem_id"),
	CONSTRAINT "result_problem_severity" CHECK ("culture_result_problem"."severity" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "data_export" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"bytes" integer,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reco_secret" (
	"year" integer PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "culture_result" ADD CONSTRAINT "culture_result_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_result" ADD CONSTRAINT "culture_result_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_result" ADD CONSTRAINT "result_culture_same_garden_fk" FOREIGN KEY ("garden_id","culture_id") REFERENCES "public"."culture"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_result" ADD CONSTRAINT "result_season_same_garden_fk" FOREIGN KEY ("garden_id","season_id") REFERENCES "public"."season"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_result_problem" ADD CONSTRAINT "culture_result_problem_result_id_culture_result_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."culture_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_result_problem" ADD CONSTRAINT "culture_result_problem_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "culture_result_culture_season_uq" ON "culture_result" USING btree ("culture_id","season_id");--> statement-breakpoint
CREATE INDEX "culture_result_garden_idx" ON "culture_result" USING btree ("garden_id");--> statement-breakpoint
CREATE INDEX "culture_result_season_idx" ON "culture_result" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "culture_result_author_idx" ON "culture_result" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "culture_result_problem_problem_idx" ON "culture_result_problem" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "data_export_user_idx" ON "data_export" USING btree ("user_id","created_at");