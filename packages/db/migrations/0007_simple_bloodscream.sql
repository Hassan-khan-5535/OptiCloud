DELETE FROM "resource_metrics" older
USING "resource_metrics" newer
WHERE older."resource_id" = newer."resource_id"
  AND older."metric_name" = newer."metric_name"
  AND older."recorded_at" = newer."recorded_at"
  AND older."id" > newer."id";--> statement-breakpoint
CREATE UNIQUE INDEX "resource_metrics_resource_metric_unique_idx" ON "resource_metrics" USING btree ("resource_id","metric_name","recorded_at");--> statement-breakpoint
