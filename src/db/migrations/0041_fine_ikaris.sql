ALTER TABLE "raw_files" ADD COLUMN "case_id" text;--> statement-breakpoint
ALTER TABLE "staging"."loads" ADD COLUMN "case_id" text;--> statement-breakpoint
ALTER TABLE "raw_files" ADD CONSTRAINT "raw_files_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging"."loads" ADD CONSTRAINT "loads_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;