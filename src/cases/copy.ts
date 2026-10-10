/**
 * A case workspace copied into its panel as a case (DECISIONS, 10 Oct 2026: Kahf Threads is a case of Beauty Indonesia).
 * Everything the workspace holds about its posts comes along, matched by natural keys: accounts (platform, handle), posts
 * (platform, url) and their link to the panel's brand, readings, comments (platform comment id), labels with their author,
 * and the topics, under the case's own ids. The copies are the case's (posts and accounts brought in by it, case_posts,
 * topics.case_id), so the panel's numbers do not move. The source workspace stays as it is. One transaction: all or nothing.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";

export type CopyPlan = {
  from: string;
  to: string;
  /** the source's brands, by id, to the panel's brand each one is */
  brands: Record<string, string>;
  case: { id: string; name: string; about: string; starts_on: string; terms: string[]; platforms: string[]; access: string[]; created_by: string; settings: Record<string, unknown> };
};

const q = async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];

/** a table's columns, minus the ones the copy sets itself */
async function columns(table: string, except: string[]): Promise<string[]> {
  const r = await q<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`,
    [table],
  );
  return r.map((c) => c.column_name).filter((c) => !except.includes(c));
}

/**
 * The statements name their values (:src the source workspace, :dst the panel, :case, :brands the brand map); `bind` numbers
 * the ones a statement uses, since Postgres takes exactly the parameters a statement names.
 */
export type CopyArgs = { src: string; dst: string; case: string; brands: string };
export function bind(text: string, args: CopyArgs): [string, unknown[]] {
  const order: (keyof CopyArgs)[] = [];
  const out = text.replace(/:(src|dst|case|brands)\b/g, (_, k: keyof CopyArgs) => {
    if (!order.includes(k)) order.push(k);
    return `$${order.indexOf(k) + 1}${k === "brands" ? "::jsonb" : "::text"}`;
  });
  return [out, order.map((k) => args[k])];
}

/** a source topic id under the case: <case>:<the part after the source workspace's prefix> */
const T = (x: string) => `(case when ${x} is null then null when ${x} like :src || ':%' then :case || ':' || substr(${x}, length(:src) + 2) else :case || ':' || ${x} end)`;
/** the panel's link for a source link */
const NEW_LINK = (o: string, n: string) => `join posts ${n} on ${n}.workspace_id = :dst and ${n}.platform = ${o}.platform and ${n}.url = ${o}.url and ${n}.brand_id = (:brands ->> ${o}.brand_id)`;

/** the statements, in order, with named values (bind) */
export async function copyStatements(): Promise<string[]> {
  const list = (cols: string[], a: string) => cols.map((c) => `${a}.${c}`).join(", ");
  const topic = await columns("topics", ["id", "workspace_id", "case_id", "parent_id"]);
  const creator = await columns("creators", ["id", "workspace_id", "brought_in_by"]);
  const item = await columns("post_items", ["id", "workspace_id", "creator_id", "topic_id", "load_id"]);
  const link = await columns("posts", ["id", "workspace_id", "brand_id", "item_id", "creator_id", "topic_id", "load_id", "brought_in_by"]);
  const reading = await columns("post_readings", ["post_id", "load_id"]);
  const comment = await columns("comments", ["id", "workspace_id", "post_id", "item_id", "topic_id"]);
  return [
    `insert into topics (id, workspace_id, case_id, parent_id, ${topic.join(", ")})
     select ${T("t.id")}, :dst, :case, ${T("t.parent_id")}, ${list(topic, "t")} from topics t where t.workspace_id = :src`,
    `insert into creators (workspace_id, brought_in_by, ${creator.join(", ")})
     select :dst, :case, ${list(creator, "c")} from creators c where c.workspace_id = :src
     on conflict (workspace_id, platform, handle) do nothing`,
    `insert into post_items (workspace_id, creator_id, topic_id, load_id, ${item.join(", ")})
     select :dst, nc.id, ${T("i.topic_id")}, null, ${list(item, "i")}
       from post_items i left join creators oc on oc.id = i.creator_id
       left join creators nc on nc.workspace_id = :dst and nc.platform = oc.platform and nc.handle = oc.handle
      where i.workspace_id = :src`,
    `insert into posts (workspace_id, brand_id, item_id, creator_id, topic_id, load_id, brought_in_by, ${link.join(", ")})
     select :dst, :brands ->> p.brand_id, ni.id, ni.creator_id, ni.topic_id, null, :case, ${list(link, "p")}
       from posts p join post_items oi on oi.id = p.item_id
       join post_items ni on ni.workspace_id = :dst and ni.platform = oi.platform and ni.url = oi.url
      where p.workspace_id = :src`,
    `insert into post_readings (post_id, load_id, ${reading.join(", ")})
     select np.id, null, ${list(reading, "r")} from post_readings r join posts op on op.id = r.post_id ${NEW_LINK("op", "np")} where op.workspace_id = :src`,
    `insert into comments (workspace_id, post_id, topic_id, ${comment.join(", ")})
     select :dst, np.id, ${T("c.topic_id")}, ${list(comment, "c")} from comments c join posts op on op.id = c.post_id ${NEW_LINK("op", "np")} where c.workspace_id = :src`,
    `insert into labels (workspace_id, target, target_id, kind, value, confidence, labeller_id, labelled_at)
     select :dst, l.target, nc.id, l.kind, case when l.kind = 'topic' then ${T("l.value")} else l.value end, l.confidence, l.labeller_id, l.labelled_at
       from labels l join comments oc on oc.id = l.target_id
       join comments nc on nc.workspace_id = :dst and nc.platform_comment_id = oc.platform_comment_id
      where l.workspace_id = :src and l.target = 'comment'`,
    `insert into labels (workspace_id, target, target_id, kind, value, confidence, labeller_id, labelled_at)
     select :dst, l.target, np.id, l.kind, case when l.kind = 'topic' then ${T("l.value")} else l.value end, l.confidence, l.labeller_id, l.labelled_at
       from labels l join posts op on op.id = l.target_id ${NEW_LINK("op", "np")}
      where l.workspace_id = :src and l.target = 'post'`,
    `insert into case_posts (case_id, item_id, workspace_id, load_id)
     select :case, p.item_id, :dst, null from posts p where p.workspace_id = :dst and p.brought_in_by = :case group by p.item_id`,
  ];
}

/** what the source holds and what the copy would meet in the panel: the copy runs only when nothing overlaps */
export async function copyCheck(plan: CopyPlan): Promise<{ problems: string[]; source: Record<string, number> }> {
  const [src] = await q<Record<string, number>>(
    `select (select count(*) from post_items where workspace_id = $1)::int as posts, (select count(*) from posts where workspace_id = $1)::int as links,
            (select count(*) from comments where workspace_id = $1)::int as comments, (select count(*) from labels where workspace_id = $1)::int as labels,
            (select count(*) from post_readings r join posts p on p.id = r.post_id where p.workspace_id = $1)::int as readings,
            (select count(*) from topics where workspace_id = $1)::int as topics, (select count(*) from creators where workspace_id = $1)::int as creators`,
    [plan.from],
  );
  const problems: string[] = [];
  const [o] = await q<{ posts: number; comments: number; case_exists: boolean; unmapped: string[] | null; missing: string[] | null }>(
    `select (select count(*) from post_items a join post_items b on b.workspace_id = $2 and b.platform = a.platform and b.url = a.url where a.workspace_id = $1)::int as posts,
            (select count(*) from comments a join comments b on b.workspace_id = $2 and b.platform_comment_id = a.platform_comment_id where a.workspace_id = $1)::int as comments,
            exists (select 1 from cases where id = $3) as case_exists,
            (select array_agg(distinct p.brand_id) from posts p where p.workspace_id = $1 and not ($4::jsonb ? p.brand_id)) as unmapped,
            (select array_agg(v) from jsonb_each_text($4::jsonb) e(k, v) where not exists (select 1 from brands b where b.id = e.v and b.workspace_id = $2)) as missing`,
    [plan.from, plan.to, plan.case.id, toJson(plan.brands)],
  );
  if (o.case_exists) problems.push(`a case ${plan.case.id} already exists`);
  if (o.posts) problems.push(`${o.posts} posts are in ${plan.to} already`);
  if (o.comments) problems.push(`${o.comments} comments are in ${plan.to} already`);
  if (o.unmapped?.length) problems.push(`brands with no panel brand to go to: ${o.unmapped.join(", ")}`);
  if (o.missing?.length) problems.push(`not brands of ${plan.to}: ${o.missing.join(", ")}`);
  return { problems, source: src };
}

/** the copy, in one transaction; returns what the case holds afterwards */
export async function copyIntoCase(plan: CopyPlan): Promise<Record<string, number>> {
  const { problems } = await copyCheck(plan);
  if (problems.length) throw new Error(`not copied: ${problems.join("; ")}`);
  const c = plan.case;
  const args: CopyArgs = { src: plan.from, dst: plan.to, case: c.id, brands: toJson(plan.brands) };
  await sql.transaction([
    sql.query(
      `insert into cases (id, workspace_id, name, about, starts_on, terms, platforms, pace, access, created_by, settings)
       values ($1, $2, $3, $4, $5::date, $6::text[], $7::text[], 'daily', $8::text[], $9, $10::jsonb)`,
      [c.id, plan.to, c.name, c.about, c.starts_on, c.terms, c.platforms, c.access, c.created_by, toJson(c.settings)],
    ),
    ...(await copyStatements()).map((text) => sql.query(...bind(text, args))),
  ]);
  const [after] = await q<Record<string, number>>(
    `select (select count(*) from case_posts where case_id = $2)::int as posts, (select count(*) from posts where workspace_id = $1 and brought_in_by = $2)::int as links,
            (select count(*) from comments c join posts p on p.id = c.post_id where p.workspace_id = $1 and p.brought_in_by = $2)::int as comments,
            (select count(*) from post_readings r join posts p on p.id = r.post_id where p.workspace_id = $1 and p.brought_in_by = $2)::int as readings,
            (select count(*) from labels l where l.workspace_id = $1 and (l.target_id in (select id from posts where workspace_id = $1 and brought_in_by = $2)
               or l.target_id in (select c.id from comments c join posts p on p.id = c.post_id where p.workspace_id = $1 and p.brought_in_by = $2)))::int as labels,
            (select count(*) from topics where case_id = $2)::int as topics, (select count(*) from creators where workspace_id = $1 and brought_in_by = $2)::int as creators`,
    [plan.to, c.id],
  );
  return after;
}
