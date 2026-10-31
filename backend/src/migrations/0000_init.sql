CREATE TYPE "public"."issue_state" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."classification_method" AS ENUM('ai', 'topic_match', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."search_stage" AS ENUM('refining', 'searching_github', 'processing_results');--> statement-breakpoint
CREATE TYPE "public"."search_status" AS ENUM('processing', 'completed', 'partial', 'no_results', 'needs_clarification', 'failed');--> statement-breakpoint
CREATE TABLE "repository_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"evidence_fingerprint" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_analyses_repo_fp_prompt_uq" UNIQUE("repository_id","evidence_fingerprint","prompt_version")
);
--> statement-breakpoint
CREATE TABLE "repository_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"state" "issue_state" NOT NULL,
	"html_url" text NOT NULL,
	"github_created_at" timestamp with time zone,
	"github_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_issues_repo_number_uq" UNIQUE("repository_id","number")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"html_url" text NOT NULL,
	"description" text,
	"language" text,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"stars" integer DEFAULT 0 NOT NULL,
	"forks" integer DEFAULT 0 NOT NULL,
	"open_issues" integer DEFAULT 0 NOT NULL,
	"github_pushed_at" timestamp with time zone,
	"github_updated_at" timestamp with time zone,
	"readme_content" text,
	"readme_url" text,
	"readme_fetched_at" timestamp with time zone,
	"category_id" text DEFAULT 'other' NOT NULL,
	"category_confidence" real,
	"category_method" "classification_method",
	"category_reason" text,
	"classified_at" timestamp with time zone,
	"etag" text,
	"archived" boolean DEFAULT false NOT NULL,
	"unavailable_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "search_status" DEFAULT 'processing' NOT NULL,
	"stage" "search_stage",
	"refined_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_refined" boolean DEFAULT false NOT NULL,
	"clarification_question" text,
	"error_code" text,
	"error_message" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "search_repositories" (
	"search_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "search_repositories_search_id_repository_id_pk" PRIMARY KEY("search_id","repository_id")
);
--> statement-breakpoint
ALTER TABLE "repository_analyses" ADD CONSTRAINT "repository_analyses_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_issues" ADD CONSTRAINT "repository_issues_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_repositories" ADD CONSTRAINT "search_repositories_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_repositories" ADD CONSTRAINT "search_repositories_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repositories_category_idx" ON "repositories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "searches_fingerprint_idx" ON "searches" USING btree ("fingerprint");