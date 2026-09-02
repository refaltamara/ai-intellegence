/** SQL execution for skills: parameterised only, with a hash of everything run for meta.sql_hash. */
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "../db/client";
import type { Row } from "./types";

export class SkillDb {
  private client = neon(databaseUrl("pooled"));
  private hash = createHash("sha256");
  public queries = 0;

  async q<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    this.hash.update(text).update(JSON.stringify(params));
    this.queries += 1;
    return (await this.client.query(text, params as any[])) as T[];
  }

  async one<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.q<T>(text, params);
    return rows[0];
  }

  sqlHash(): string {
    return this.hash.copy().digest("hex").slice(0, 16);
  }
}
