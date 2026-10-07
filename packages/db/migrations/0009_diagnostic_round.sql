CREATE TYPE "public"."diagnostic_round" AS ENUM('core', 'rest');--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD COLUMN "round" "diagnostic_round" DEFAULT 'core' NOT NULL;