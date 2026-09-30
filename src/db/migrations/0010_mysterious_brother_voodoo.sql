CREATE TABLE "mcp_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"workspace_id" text NOT NULL,
	"client_id" text,
	"tool" text NOT NULL,
	"params" jsonb,
	"status" text NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_name" text,
	"redirect_uris" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scope" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_hash" text NOT NULL,
	"refresh_hash" text,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_tokens_access_hash_unique" UNIQUE("access_hash"),
	CONSTRAINT "mcp_tokens_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
ALTER TABLE "mcp_calls" ADD CONSTRAINT "mcp_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_client_id_mcp_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_client_id_mcp_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_calls_user_created_idx" ON "mcp_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_calls_ws_created_idx" ON "mcp_calls" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_tokens_user_idx" ON "mcp_tokens" USING btree ("user_id");