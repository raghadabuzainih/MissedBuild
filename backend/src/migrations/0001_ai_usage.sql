CREATE TYPE "public"."ai_call_status" AS ENUM('success', 'failure', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."ai_error_category" AS ENUM('timeout', 'rate_limited', 'auth', 'bad_request', 'server_error', 'connection', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ai_operation" AS ENUM('query_refinement', 'classification', 'repository_analysis');--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" "ai_operation" NOT NULL,
	"model" text NOT NULL,
	"status" "ai_call_status" NOT NULL,
	"error_category" "ai_error_category",
	"request_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"cached_input_tokens" integer,
	"reasoning_tokens" integer,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_usage_operation_created_idx" ON "ai_usage" USING btree ("operation","created_at");