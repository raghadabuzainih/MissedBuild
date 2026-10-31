CREATE TYPE "public"."search_mode" AS ENUM('explore', 'analyze');--> statement-breakpoint
CREATE TYPE "public"."idea_analysis_stage" AS ENUM('selecting', 'analyzing', 'comparing');--> statement-breakpoint
CREATE TYPE "public"."idea_analysis_status" AS ENUM('processing', 'completed', 'partial', 'failed', 'no_candidates');--> statement-breakpoint
ALTER TYPE "public"."ai_operation" ADD VALUE 'idea_comparison';--> statement-breakpoint
CREATE TABLE "idea_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"status" "idea_analysis_status" DEFAULT 'processing' NOT NULL,
	"stage" "idea_analysis_stage",
	"repositories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comparison" jsonb,
	"comparison_prompt_version" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "idea_analyses_search_id_unique" UNIQUE("search_id")
);
--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "mode" "search_mode" DEFAULT 'explore' NOT NULL;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "filtered_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "idea_analyses" ADD CONSTRAINT "idea_analyses_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;