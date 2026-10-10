CREATE TABLE "raw_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"path" text NOT NULL,
	"blob_path" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"received" date NOT NULL,
	"keep_until" date NOT NULL,
	"stored_at" timestamp with time zone,
	"store_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raw_files" ADD CONSTRAINT "raw_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_files_blob_path_uq" ON "raw_files" USING btree ("blob_path");--> statement-breakpoint
CREATE INDEX "raw_files_workspace_idx" ON "raw_files" USING btree ("workspace_id","received");