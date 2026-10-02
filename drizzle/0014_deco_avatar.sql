CREATE TABLE "decor_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"sprite_key" text NOT NULL,
	"width_tiles" smallint DEFAULT 1 NOT NULL,
	"height_tiles" smallint DEFAULT 1 NOT NULL,
	"practice_id" uuid,
	"unlock_condition" jsonb NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decor_item_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "decor_placement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"garden_id" uuid NOT NULL,
	"scene_zone_id" uuid,
	"decor_item_id" uuid NOT NULL,
	"x_cm" integer NOT NULL,
	"y_cm" integer NOT NULL,
	"label" text,
	"placed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decor_placement_position_ck" CHECK ("decor_placement"."x_cm" >= 0 and "decor_placement"."y_cm" >= 0),
	CONSTRAINT "decor_placement_label_ck" CHECK ("decor_placement"."label" is null or char_length("decor_placement"."label") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "avatar_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"layer" text NOT NULL,
	"sprite_key" text NOT NULL,
	"palette_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unlock_condition" jsonb NOT NULL,
	"default_unlocked" boolean DEFAULT false NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatar_item_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "avatar_item_palette" (
	"avatar_item_id" uuid NOT NULL,
	"palette_id" uuid NOT NULL,
	CONSTRAINT "avatar_item_palette_avatar_item_id_palette_id_pk" PRIMARY KEY("avatar_item_id","palette_id")
);
--> statement-breakpoint
CREATE TABLE "palette" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"slot_kind" text NOT NULL,
	"ramp" jsonb NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "palette_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_avatar" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"config_version" integer DEFAULT 0 NOT NULL,
	"config" jsonb NOT NULL,
	"config_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decor_item" ADD CONSTRAINT "decor_item_practice_id_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decor_placement" ADD CONSTRAINT "decor_placement_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decor_placement" ADD CONSTRAINT "decor_placement_decor_item_id_decor_item_id_fk" FOREIGN KEY ("decor_item_id") REFERENCES "public"."decor_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decor_placement" ADD CONSTRAINT "decor_placement_placed_by_user_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decor_placement" ADD CONSTRAINT "decor_scene_same_garden_fk" FOREIGN KEY ("garden_id","scene_zone_id") REFERENCES "public"."zone"("garden_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_item_palette" ADD CONSTRAINT "avatar_item_palette_avatar_item_id_avatar_item_id_fk" FOREIGN KEY ("avatar_item_id") REFERENCES "public"."avatar_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_item_palette" ADD CONSTRAINT "avatar_item_palette_palette_id_palette_id_fk" FOREIGN KEY ("palette_id") REFERENCES "public"."palette"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_avatar" ADD CONSTRAINT "user_avatar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decor_garden_scene_idx" ON "decor_placement" USING btree ("garden_id","scene_zone_id");--> statement-breakpoint
CREATE INDEX "decor_item_idx" ON "decor_placement" USING btree ("decor_item_id");--> statement-breakpoint
CREATE INDEX "avatar_item_layer_idx" ON "avatar_item" USING btree ("layer","sort_order");--> statement-breakpoint
CREATE INDEX "avatar_item_palette_palette_idx" ON "avatar_item_palette" USING btree ("palette_id");--> statement-breakpoint
ALTER TABLE "practice_declaration" ADD CONSTRAINT "practice_declaration_decor_placement_id_decor_placement_id_fk" FOREIGN KEY ("decor_placement_id") REFERENCES "public"."decor_placement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_declaration_decor_uq" ON "practice_declaration" USING btree ("decor_placement_id") WHERE "practice_declaration"."decor_placement_id" is not null;