CREATE UNIQUE INDEX "cloud_accounts_org_id_id_idx" ON "cloud_accounts" USING btree ("org_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_org_id_id_idx" ON "policies" USING btree ("org_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_org_id_id_idx" ON "resources" USING btree ("org_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "waste_findings_org_id_id_idx" ON "waste_findings" USING btree ("org_id","id");--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_org_policy_fk" FOREIGN KEY ("org_id","policy_id") REFERENCES "public"."policies"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_org_finding_fk" FOREIGN KEY ("org_id","waste_finding_id") REFERENCES "public"."waste_findings"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_org_finding_fk" FOREIGN KEY ("org_id","waste_finding_id") REFERENCES "public"."waste_findings"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_metrics" ADD CONSTRAINT "resource_metrics_org_resource_fk" FOREIGN KEY ("org_id","resource_id") REFERENCES "public"."resources"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_org_cloud_account_fk" FOREIGN KEY ("org_id","cloud_account_id") REFERENCES "public"."cloud_accounts"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_findings" ADD CONSTRAINT "waste_findings_org_resource_fk" FOREIGN KEY ("org_id","resource_id") REFERENCES "public"."resources"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_role_chk" CHECK ("organization_members"."role" IN ('admin', 'operator', 'member'));--> statement-breakpoint
