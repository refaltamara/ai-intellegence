CREATE TABLE "brand_handles" (
	"workspace_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"platform" text DEFAULT '*' NOT NULL,
	"handle" text NOT NULL,
	"owned" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_handles_workspace_id_platform_handle_pk" PRIMARY KEY("workspace_id","platform","handle")
);
--> statement-breakpoint
CREATE TABLE "brand_terms" (
	"workspace_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"term" text NOT NULL,
	"mode" text DEFAULT 'counts' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_terms_workspace_id_brand_id_mode_term_pk" PRIMARY KEY("workspace_id","brand_id","mode","term"),
	CONSTRAINT "brand_terms_mode_chk" CHECK ("brand_terms"."mode" in ('counts','never'))
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text DEFAULT 'listening_dump' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "tagged_handles" text[];--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "definition" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "status" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_handles" ADD CONSTRAINT "brand_handles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_handles" ADD CONSTRAINT "brand_handles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_terms" ADD CONSTRAINT "brand_terms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_terms" ADD CONSTRAINT "brand_terms_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_handles_brand_idx" ON "brand_handles" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "data_sources_ws_idx" ON "data_sources" USING btree ("workspace_id");