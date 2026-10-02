CREATE TABLE "terrain_element" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"scene_zone_id" uuid,
	"kind" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ALTER COLUMN "default_view" SET DEFAULT 'garden';--> statement-breakpoint
ALTER TABLE "terrain_element" ADD CONSTRAINT "terrain_element_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terrain_element" ADD CONSTRAINT "terrain_scene_same_garden_fk" FOREIGN KEY ("garden_id","scene_zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "terrain_garden_scene_idx" ON "terrain_element" USING btree ("garden_id","scene_zone_id");