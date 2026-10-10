CREATE TABLE "labellers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"target" text NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text,
	"confidence" real,
	"labeller_id" integer NOT NULL,
	"labelled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_target_chk" CHECK ("labels"."target" in ('post','comment'))
);
--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_labeller_id_labellers_id_fk" FOREIGN KEY ("labeller_id") REFERENCES "public"."labellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labellers_name_version_uq" ON "labellers" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "labels_target_idx" ON "labels" USING btree ("target","target_id","kind","labelled_at");--> statement-breakpoint
CREATE INDEX "labels_ws_kind_idx" ON "labels" USING btree ("workspace_id","kind","labelled_at");