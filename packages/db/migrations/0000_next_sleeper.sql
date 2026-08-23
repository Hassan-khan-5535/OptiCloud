CREATE TYPE "public"."audit_entity_type" AS ENUM('waste_finding', 'remediation_action');--> statement-breakpoint
CREATE TYPE "public"."cloud_provider" AS ENUM('aws', 'gcp');--> statement-breakpoint
CREATE TYPE "public"."remediation_action_status" AS ENUM('pending', 'executing', 'completed', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."remediation_action_type" AS ENUM('stop_instance', 'detach_volume', 'delete_volume', 'resize_instance');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('ebs_volume', 'rds_instance', 'ec2_instance', 'load_balancer');--> statement-breakpoint
CREATE TYPE "public"."waste_finding_status" AS ENUM('detected', 'proposed', 'approved', 'executing', 'completed', 'failed', 'rolled_back', 'denied', 'expired');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_status" varchar(32),
	"to_status" varchar(32) NOT NULL,
	"actor" varchar(255) NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "cloud_provider" NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"credentials_ref" varchar(512) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_account_id" uuid NOT NULL,
	"rule" jsonb NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remediation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waste_finding_id" uuid NOT NULL,
	"action_type" "remediation_action_type" NOT NULL,
	"is_reversible" boolean NOT NULL,
	"rollback_action" jsonb,
	"status" "remediation_action_status" DEFAULT 'pending' NOT NULL,
	"executed_at" timestamp with time zone,
	"executed_by" varchar(255),
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remediation_actions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_account_id" uuid NOT NULL,
	"type" "resource_type" NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"region" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waste_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"finding_type" varchar(128) NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estimated_monthly_savings_cents" integer NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "waste_finding_status" DEFAULT 'detected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_cloud_account_id_cloud_accounts_id_fk" FOREIGN KEY ("cloud_account_id") REFERENCES "public"."cloud_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_waste_finding_id_waste_findings_id_fk" FOREIGN KEY ("waste_finding_id") REFERENCES "public"."waste_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_cloud_account_id_cloud_accounts_id_fk" FOREIGN KEY ("cloud_account_id") REFERENCES "public"."cloud_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_findings" ADD CONSTRAINT "waste_findings_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_accounts_provider_external_id_idx" ON "cloud_accounts" USING btree ("provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_cloud_account_type_external_id_idx" ON "resources" USING btree ("cloud_account_id","type","external_id");

--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();--> statement-breakpoint
