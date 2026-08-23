CREATE TYPE "public"."policy_evaluation_mode" AS ENUM('live', 'dry_run');--> statement-breakpoint
CREATE TABLE "policy_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"waste_finding_id" uuid NOT NULL,
	"mode" "policy_evaluation_mode" NOT NULL,
	"matched" boolean NOT NULL,
	"safe" boolean NOT NULL,
	"condition_results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_waste_finding_id_waste_findings_id_fk" FOREIGN KEY ("waste_finding_id") REFERENCES "public"."waste_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_evaluations_policy_finding_created_idx" ON "policy_evaluations" USING btree ("policy_id","waste_finding_id","created_at");