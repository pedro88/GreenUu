ALTER TABLE "culture" ADD COLUMN "spacing_plant_cm" integer;--> statement-breakpoint
ALTER TABLE "culture" ADD COLUMN "spacing_row_cm" integer;--> statement-breakpoint
ALTER TABLE "culture" ADD COLUMN "density" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "culture" ADD COLUMN "density_unit" text;--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_spacing_ck" CHECK (("culture"."spacing_plant_cm" is null or "culture"."spacing_plant_cm" between 1 and 1000) and ("culture"."spacing_row_cm" is null or "culture"."spacing_row_cm" between 1 and 1000));--> statement-breakpoint
ALTER TABLE "culture" ADD CONSTRAINT "culture_density_ck" CHECK (("culture"."density" is null) = ("culture"."density_unit" is null) and ("culture"."density" is null or "culture"."density" > 0));