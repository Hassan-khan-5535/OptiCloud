CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(128) NOT NULL,
  "name" varchar(255) NOT NULL,
  "slack_team_id" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
  CONSTRAINT "organizations_slack_team_id_unique" UNIQUE("slack_team_id")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_subject" varchar(255) NOT NULL,
  "email" varchar(320),
  "role" varchar(32) DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "organizations" ("id", "slug", "name")
VALUES ('00000000-0000-0000-0000-000000000000', 'cindr-demo', 'Cindr demo workspace')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
DROP INDEX "cloud_accounts_provider_external_id_idx";
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "org_id" uuid;
--> statement-breakpoint
ALTER TABLE "cloud_accounts" ADD COLUMN "org_id" uuid;
--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "org_id" uuid;
--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD COLUMN "org_id" uuid;
--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD COLUMN "org_id" uuid;
--> statement-breakpoint
ALTER TABLE "resource_metrics" ADD COLUMN "org_id" uuid;
--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "org_id" uuid;
--> statement-breakpoint
ALTER TABLE "waste_findings" ADD COLUMN "org_id" uuid;
--> statement-breakpoint
UPDATE "cloud_accounts" SET "org_id" = '00000000-0000-4000-8000-000000000000' WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "resources" r SET "org_id" = a."org_id" FROM "cloud_accounts" a WHERE r."cloud_account_id" = a."id" AND r."org_id" IS NULL;
--> statement-breakpoint
UPDATE "resource_metrics" m SET "org_id" = r."org_id" FROM "resources" r WHERE m."resource_id" = r."id" AND m."org_id" IS NULL;
--> statement-breakpoint
UPDATE "waste_findings" f SET "org_id" = r."org_id" FROM "resources" r WHERE f."resource_id" = r."id" AND f."org_id" IS NULL;
--> statement-breakpoint
UPDATE "remediation_actions" a SET "org_id" = f."org_id" FROM "waste_findings" f WHERE a."waste_finding_id" = f."id" AND a."org_id" IS NULL;
--> statement-breakpoint
UPDATE "policies" p SET "org_id" = a."org_id" FROM "cloud_accounts" a WHERE p."cloud_account_id" = a."id" AND p."org_id" IS NULL;
--> statement-breakpoint
UPDATE "policy_evaluations" e SET "org_id" = p."org_id" FROM "policies" p WHERE e."policy_id" = p."id" AND e."org_id" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" l SET "org_id" = f."org_id" FROM "waste_findings" f WHERE l."entity_type" = 'waste_finding' AND l."entity_id" = f."id" AND l."org_id" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" l SET "org_id" = a."org_id" FROM "remediation_actions" a WHERE l."entity_type" = 'remediation_action' AND l."entity_id" = a."id" AND l."org_id" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" SET "org_id" = '00000000-0000-4000-8000-000000000000' WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "resources" SET "org_id" = '00000000-0000-4000-8000-000000000000' WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "resource_metrics" SET "org_id" = '00000000-0000-4000-8000-000000000000' WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "waste_findings" SET "org_id" = '00000000-0000-4000-8000-000000000000' WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "remediation_actions" SET "org_id" = '00000000-0000-4000-8000-000000000000' WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "policies" SET "org_id" = '00000000-0000-4000-8000-000000000000' WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "policy_evaluations" SET "org_id" = '00000000-0000-4000-8000-000000000000' WHERE "org_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_user_org_idx" ON "organization_members" USING btree ("user_subject", "org_id");
--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cloud_accounts" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "policy_evaluations" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "remediation_actions" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "resource_metrics" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "waste_findings" ALTER COLUMN "org_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cloud_accounts" ADD CONSTRAINT "cloud_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resource_metrics" ADD CONSTRAINT "resource_metrics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waste_findings" ADD CONSTRAINT "waste_findings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_accounts_provider_external_id_idx" ON "cloud_accounts" USING btree ("org_id","provider","external_id");
