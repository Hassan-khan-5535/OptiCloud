CREATE TABLE "resource_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"metric_name" varchar(128) NOT NULL,
	"value" double precision NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_metrics" ADD CONSTRAINT "resource_metrics_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_metrics_resource_metric_time_idx" ON "resource_metrics" USING btree ("resource_id","metric_name","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "waste_findings_open_natural_key_idx" ON "waste_findings" USING btree ("resource_id","finding_type") WHERE "waste_findings"."status" NOT IN ('completed', 'rolled_back', 'denied', 'expired');

--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS timescaledb;--> statement-breakpoint
SELECT create_hypertable('resource_metrics', 'recorded_at', if_not_exists => TRUE);--> statement-breakpoint
