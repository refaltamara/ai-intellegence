ALTER TABLE "reports" DROP CONSTRAINT "reports_skill_run_id_skill_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_agent_run_id_agent_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_skill_run_id_skill_runs_id_fk" FOREIGN KEY ("skill_run_id") REFERENCES "public"."skill_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;