CREATE TABLE "plan_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"plan_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_snapshot_day_uq" UNIQUE("garden_id","taken_on")
);
--> statement-breakpoint
CREATE TABLE "terrain_cell" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"scene_zone_id" uuid,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terrain_cell_position_uq" UNIQUE NULLS NOT DISTINCT("garden_id","scene_zone_id","x","y"),
	CONSTRAINT "terrain_cell_position_ck" CHECK ("terrain_cell"."x" between 0 and 10000 and "terrain_cell"."y" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "plan_snapshot" ADD CONSTRAINT "plan_snapshot_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terrain_cell" ADD CONSTRAINT "terrain_cell_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terrain_cell" ADD CONSTRAINT "terrain_cell_scene_same_garden_fk" FOREIGN KEY ("garden_id","scene_zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE cascade ON UPDATE no action;