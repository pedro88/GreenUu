CREATE TABLE "commune" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"country_code" text NOT NULL,
	"postal_code" text NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"population" integer DEFAULT 0 NOT NULL,
	"elevation_m" integer,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "commune_country_postal_name_uq" ON "commune" USING btree ("country_code","postal_code","name");--> statement-breakpoint
CREATE INDEX "commune_search_trgm_idx" ON "commune" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "commune_postal_idx" ON "commune" USING btree ("postal_code");