/**
 * "Our Chorus" (CMS plan, The Builder; DECISIONS 4 Oct 2026): the team's own version of its
 * role. A Builder approves what Members made, undoes a change, brings a setting back to
 * Fair's and suggests something to Fair; a Member sees the same page and the status of
 * what they made. Every button goes through /api/builder/*, which checks the level again.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { companyPage } from "@/company/page";
import { KIND_LABEL, type Creation } from "@/company/creations";
import { sql } from "@/db/client";
import { POLICY_HELP } from "@/roles/policy";
import { Act } from "@/ui/company/Act";
import { MemoryForm } from "@/ui/company/MemoryForm";
import { UploadValues } from "@/ui/company/UploadValues";
import { CaseWords } from "@/ui/company/CaseWords";
import { TWO, Tag } from "@/ui/dashboard/parts";
import { MadeBy } from "@/ui/decks/formParts";
import { buttonClass } from "@/ui/kit/Button";
import { PageHeader } from "@/ui/kit/PageHeader";
import { Empty, Panel, SectionCard } from "@/ui/kit/Section";
import { StatusPill, type PillTone } from "@/ui/kit/StatusPill";
import { TABLE, TABLE_FRAME, TD, TH, THEAD, TR, Table } from "@/ui/kit/Table";
import { cellOf, columnsOf } from "@/ui/table";
import { cn } from "@/ui/cn";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const C = "/api/builder/creations";
const P = "/api/builder/company";
const STATUS: Record<string, string> = {
  draft: "Draft",
  waiting: "Waiting for a Builder",
  approved: "Live",
  sent_back: "Sent back",
  rejected: "Not approved",
  removed: "Removed",
};
const STATUS_TONE: Record<string, PillTone> = {
  draft: "neutral",
  waiting: "waiting",
  approved: "ok",
  sent_back: "error",
  rejected: "neutral",
  removed: "neutral",
};
const SUGGESTION: Record<string, { label: string; tone: PillTone }> = {
  new: { label: "Sent", tone: "neutral" },
  seen: { label: "Seen by Fair", tone: "waiting" },
  adopted: { label: "Coming to every client", tone: "ok" },
};
const show = (v: unknown) =>
  v == null
    ? "Fair's"
    : Array.isArray(v)
      ? v.join(", ") || "none"
      : typeof v === "object"
        ? Object.entries(v as Record<string, unknown>)
            .map(([k, x]) => `${k}: ${x}`)
            .join(", ")
        : String(v);
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
const ROWS = "m-0 flex list-none flex-col divide-y divide-card-border p-0";
const MUTED = "text-xs text-gray-500";
const NOTE = "rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800";

function what(c: Creation): string {
  const s = c.spec as Record<string, unknown>;
  if (c.kind === "skill") return String(s.description ?? "");
  if (c.kind === "deck_template")
    return `${s.grain === "day" ? "Daily" : s.grain === "week" ? "Weekly" : "Monthly"} · ${((s.rep_slides ?? s.social_slides ?? s.slides) as string[]).length} slides${Array.isArray(s.findings) && s.findings.length ? ` + ${s.findings.length} of your team's` : ""}${s.description ? ` · ${s.description}` : ""}`;
  if (c.kind === "term") return c.title;
  if (c.kind === "panel")
    return `${String(s.description ?? "")} · on the Dashboard`;
  if (c.kind === "dashboard")
    return `${Array.isArray(s.panels) ? s.panels.length : 0} panel${Array.isArray(s.panels) && s.panels.length === 1 ? "" : "s"}${s.description ? ` · ${s.description}` : ""} · in the Dashboard templates`;
  if (c.kind === "extension") {
    const est = (c as Creation & { estimate?: { credits_now: number } })
      .estimate;
    return `On ${s.target}s: ${((s.values ?? []) as { name: string }[]).map((v) => v.name).join(", ")} · ${s.source === "cemo" ? "CeMO reads each" : s.source === "rule" ? "keyword rules" : "from a file"}${est ? ` · about ${Math.round(est.credits_now).toLocaleString("en-US")} credits to fill` : ""}`;
  }
  return String(s.text ?? "");
}

/** one thing in a list: its name and marks, what it is, anything under it, and its actions on the right */
function Row({
  title,
  marks,
  body,
  children,
  actions,
}: {
  title: ReactNode;
  marks?: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <b className="text-sm font-semibold text-gray-900">{title}</b>
          {marks}
        </span>
        {body && (
          <p className="text-sm leading-relaxed text-gray-600">{body}</p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </li>
  );
}

export default async function CompanyPage() {
  const ws = await currentWorkspaceId();
  const [actor, role] = await Promise.all([currentActor(), currentRole(ws)]);
  if (!actor || !can(actor, "role.use", { workspace: ws, role: role.id }))
    redirect("/");
  const [d, clientRow] = await Promise.all([
    companyPage(ws, role, actor),
    sql.query(
      "select b.name from workspaces w join brands b on b.id = w.client_brand_id and b.workspace_id = w.id where w.id = $1",
      [ws],
    ) as unknown as Promise<{ name: string }[]>,
  ]);
  const client = clientRow[0]?.name ?? "Your team";
  const topics =
    role.id === "pr"
      ? (
          (await sql.query(
            "select label from topics where workspace_id = $1 and case_id is null and not coalesce(is_catch_all, false) and kind not in ('aside', 'post') order by sort_order, label limit 20",
            [ws],
          )) as { label: string }[]
        ).map((t) => t.label)
      : [];
  const badge = (c: Creation) => (
    <MadeBy
      badge={client}
      by={`${c.maker_name ?? c.maker_email}${c.approver && c.approver !== c.maker_email ? `, approved by ${c.approver}` : ""}`}
    />
  );
  const live = (k: Creation["kind"][]) =>
    d.creations.filter((c) => k.includes(c.kind) && c.status === "approved");
  const mine = d.creations.filter(
    (c) =>
      c.maker_email === d.me &&
      c.status !== "approved" &&
      c.status !== "removed",
  );
  const removed = d.creations.filter(
    (c) => c.status === "removed" && c.approver,
  );
  const suggested = new Set(d.suggestions.map((s) => s.ref));
  const sentToFair = <span className={MUTED}>Sent to Fair</span>;
  const row = (c: Creation, acts = true) => (
    <Row
      key={c.id}
      title={c.title}
      marks={
        <>
          {badge(c)}
          <Tag>{KIND_LABEL[c.kind]}</Tag>
        </>
      }
      body={what(c) !== c.title ? what(c) : undefined}
      actions={
        acts && d.builder && c.status === "approved" ? (
          <>
            {suggested.has(c.id) ? (
              sentToFair
            ) : (
              <Act
                label="Suggest to Fair"
                url={P}
                body={{ action: "suggest", kind: "creation", ref: c.id }}
                ask="Why should every client have this? (one line for Fair's role owners)"
                done="Sent to Fair"
              />
            )}
            <Act
              label="Remove"
              variant="ghost"
              danger
              url={C}
              body={{ action: "remove", id: c.id }}
              confirm={`Remove "${c.title}" for everyone? You can bring it back from the history.`}
            />
          </>
        ) : undefined
      }
    />
  );
  const historyRows = d.history.filter(
    (h) => h.lines.length || h.base_version !== null,
  );
  const extensions = d.extensions.filter((x) => x.status !== "draft");

  return (
    <section
      data-tw
      className="flex min-h-full flex-col gap-6 px-4 pb-10 md:px-6"
    >
      <PageHeader
        title={`Our ${role.codename}`}
        subtitle={
          <>
            {client}&apos;s {role.codename} ({role.label}) · on Fair&apos;s{" "}
            {role.codename} {d.fair_version} · {d.follows}
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <MadeBy badge="Fair" /> came with the role
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MadeBy badge={client} /> your team made
              </span>
            </span>
          </>
        }
        actions={
          d.builder ? (
            <Link
              className={buttonClass("outline", "sm")}
              href="/credits"
              title="Credits this month"
            >
              {Math.round(d.credits.spent).toLocaleString("en-US")} of{" "}
              {d.credits.limit.toLocaleString("en-US")} credits this month
            </Link>
          ) : undefined
        }
      />

      {d.next && (
        <Panel
          title={`Coming in ${role.codename} ${d.next.version}`}
          className="border-brand-palette-200 bg-brand-palette-50"
        >
          {d.next.note && (
            <p className="text-sm text-gray-700">{d.next.note}</p>
          )}
          {d.next.lines.length > 0 && (
            <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {d.next.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-600">
            Everything your team changed and made stays as it is.
          </p>
        </Panel>
      )}

      {d.builder && (
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              Waiting for you
              {d.waiting.length > 0 && (
                <span className="min-w-5 rounded-full bg-brand-palette-100 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-brand-palette-800">
                  {d.waiting.length}
                </span>
              )}
            </span>
          }
          hint="What Members made. It works for its maker now; once you approve it, it is there for everyone on the team."
        >
          {d.waiting.length === 0 ? (
            <Empty>Nothing waiting.</Empty>
          ) : (
            <ul className={ROWS}>
              {d.waiting
                .map((c) => ({
                  ...c,
                  estimate:
                    d.extensions.find((x) => x.creation_id === c.id)
                      ?.estimate ?? undefined,
                }))
                .map((c) => (
                  <Row
                    key={c.id}
                    title={c.title}
                    marks={<Tag>{KIND_LABEL[c.kind]}</Tag>}
                    body={what(c)}
                    actions={
                      <>
                        <Act
                          label="Approve"
                          variant="primary"
                          url={C}
                          body={{ action: "approve", id: c.id }}
                        />
                        <Act
                          label="Send back"
                          url={C}
                          body={{ action: "send_back", id: c.id }}
                          ask="What should they change?"
                        />
                        <Act
                          label="Reject"
                          variant="ghost"
                          danger
                          url={C}
                          body={{ action: "reject", id: c.id }}
                          confirm="Reject it? Its maker keeps it as their own draft."
                        />
                      </>
                    }
                  >
                    <span className={MUTED}>
                      From {c.maker_name ?? c.maker_email} · {day(c.updated_at)}
                    </span>
                    {c.tried &&
                      (c.tried.rows.length ? (
                        <div className="mt-1 flex flex-col gap-1.5">
                          <div className={TABLE_FRAME}>
                            <table className={cn(TABLE, "min-w-140")}>
                              <thead className={THEAD}>
                                <tr>
                                  {columnsOf(c.tried.rows)
                                    .slice(0, 6)
                                    .map((k) => (
                                      <th
                                        key={k}
                                        className={cn(TH, "py-2 text-xs")}
                                      >
                                        {k.replace(/_/g, " ")}
                                      </th>
                                    ))}
                                </tr>
                              </thead>
                              <tbody>
                                {c.tried.rows.slice(0, 5).map((r, i) => (
                                  <tr key={i} className={TR}>
                                    {columnsOf(c.tried!.rows)
                                      .slice(0, 6)
                                      .map((k) => (
                                        <td
                                          key={k}
                                          className={cn(TD, "py-2 text-xs")}
                                        >
                                          {cellOf(k, r[k])}
                                        </td>
                                      ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <span className={MUTED}>
                            Tried on your data
                            {c.tried.window
                              ? `, ${c.tried.window.from} to ${c.tried.window.to}`
                              : ""}
                          </span>
                        </div>
                      ) : (
                        <span className={MUTED}>
                          Tried on your data: {c.tried.message ?? "no rows"}
                        </span>
                      ))}
                  </Row>
                ))}
            </ul>
          )}
        </SectionCard>
      )}

      <SectionCard
        title={`What ${client} changed`}
        hint={`Settings your team changed from Fair's ${role.codename}. A new Fair release never touches them.${d.builder ? " Change more on the Dashboard (Customise, Why this level?) or by asking CeMO in Builder mode." : ""}`}
      >
        {d.changes.length === 0 ? (
          <Empty>
            Nothing yet: your team runs Fair&apos;s {role.codename} as released.
          </Empty>
        ) : (
          <Table
            min="min-w-[720px]"
            head={
              <>
                <th className={TH}>Setting</th>
                <th className={TH}>Fair&apos;s</th>
                <th className={TH}>{client}&apos;s</th>
                <th className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </>
            }
          >
            {d.changes.map((c) => (
              <tr key={c.path} className={TR}>
                <td className={TD}>{c.label}</td>
                <td className={cn(TD, "text-gray-500")}>{show(c.fair)}</td>
                <td className={TD}>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <b className="font-semibold text-gray-900">{show(c.to)}</b>
                    <MadeBy badge={client} />
                  </span>
                </td>
                <td className={cn(TD, "text-right")}>
                  {d.builder && (
                    <span className="inline-flex flex-wrap justify-end gap-2">
                      <Act
                        label="Back to Fair's"
                        url={P}
                        body={{
                          action: "apply",
                          changes: { [c.path]: null },
                          note: `Back to Fair's: ${c.label}`,
                        }}
                        confirm="Go back to Fair's setting for everyone?"
                      />
                      {suggested.has(c.path) ? (
                        sentToFair
                      ) : (
                        <Act
                          label="Suggest to Fair"
                          variant="ghost"
                          url={P}
                          body={{
                            action: "suggest",
                            kind: "setting",
                            ref: c.path,
                          }}
                          ask="Why should every client have this? (one line for Fair's role owners)"
                          done="Sent to Fair"
                        />
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </SectionCard>

      <div className={TWO}>
        <SectionCard
          title="Skills"
          hint="Analyses your team made. CeMO uses them in Chats, and they are under + in the composer."
        >
          {live(["skill"]).length === 0 ? (
            <Empty>
              None yet. Ask CeMO: &quot;make me a skill that shows complaints by
              topic every week&quot;.
            </Empty>
          ) : (
            <ul className={ROWS}>{live(["skill"]).map((c) => row(c))}</ul>
          )}
        </SectionCard>
        <SectionCard
          title="Deck templates"
          hint="Under Decks → New deck, after Fair's. Save one from any deck (⋯ → Save as template), change one from a deck (Edit → also change the template, or @CeMO in a slide comment), or ask CeMO in Chats."
        >
          {live(["deck_template"]).length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <ul className={ROWS}>
              {live(["deck_template"]).map((c) => row(c))}
            </ul>
          )}
        </SectionCard>
      </div>

      {role.id === "pr" && (
        <SectionCard
          id="case-words"
          title="Case words"
          hint={`The words the dashboard, the crisis slides and the chronology count: brands named beside you and boycott calls. Words are counted in the database, so they cost nothing.${topics.length ? ` Topics comments are labelled with: ${topics.join(", ")}. For a topic of your own, ask CeMO ("add a topic Halal certification: halal, sertifikat, MUI"): by words it is free; CeMO reading each comment is priced before anything runs.` : ""}`}
        >
          <CaseWords builder={d.builder} />
        </SectionCard>
      )}

      <SectionCard
        id="extensions"
        title="Data extensions"
        hint={
          <>
            Your own data on top of Fair&apos;s, for this workspace only:
            grouped and filtered as <code className="font-mono">ext_name</code>{" "}
            in analyses, skills and decks. The core data never changes. Ask
            CeMO: &quot;add a Persona table&quot;.
          </>
        }
      >
        {extensions.length === 0 ? (
          <Empty>None yet.</Empty>
        ) : (
          <ul className={ROWS}>
            {extensions.map((x) => {
              const total = x.counts.reduce((a, c) => a + c.n, 0);
              const c = d.creations.find((y) => y.id === x.creation_id);
              return (
                <Row
                  key={x.id}
                  title={x.name}
                  marks={
                    <>
                      <MadeBy
                        badge={client}
                        by={`${x.maker_name ?? x.maker_email}${x.approver ? `, approved by ${x.approver}` : ""}`}
                      />
                      <Tag>
                        ext_{x.key} · on {x.target}s ·{" "}
                        {x.source === "cemo"
                          ? "CeMO reads each"
                          : x.source === "rule"
                            ? "keyword rules, daily"
                            : "from a file"}
                      </Tag>
                    </>
                  }
                  body={
                    <>
                      {x.status === "filling"
                        ? `Filling: ${(x.progress?.done ?? 0).toLocaleString("en-US")} of ${(x.progress?.total ?? 0).toLocaleString("en-US")} read`
                        : x.status === "approved"
                          ? "Approved; filling starts within minutes"
                          : `${total.toLocaleString("en-US")} ${x.target}s read`}
                      {x.progress?.credits
                        ? ` · ${Math.round(Number(x.progress.credits)).toLocaleString("en-US")} credits so far`
                        : ""}
                    </>
                  }
                  actions={
                    d.builder ? (
                      <>
                        {x.source === "file" && <UploadValues defId={x.id} />}
                        {c && c.status === "approved" && (
                          <Act
                            label="Remove"
                            variant="ghost"
                            danger
                            url={C}
                            body={{ action: "remove", id: c.id }}
                            confirm={`Remove ${x.name} and delete its values for everyone? Skills that use it will say it is gone.`}
                          />
                        )}
                      </>
                    ) : undefined
                  }
                >
                  {x.counts.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {x.counts.map((k) => (
                        <Tag key={k.value}>
                          {k.value} · {k.n.toLocaleString("en-US")}
                        </Tag>
                      ))}
                    </span>
                  )}
                  {x.progress?.error && (
                    <p
                      role="alert"
                      className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"
                    >
                      {String(x.progress.error)}
                    </p>
                  )}
                </Row>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="CeMO's rules and memory"
        hint="CeMO reads these on every message, under the product's own rules: they shape tone, naming and drafts, never a number. A correction about the data itself goes to Fair's data team."
      >
        {live(["rule", "fact", "term"]).length > 0 && (
          <ul className={ROWS}>
            {live(["rule", "fact", "term"]).map((c) => row(c))}
          </ul>
        )}
        <MemoryForm builder={d.builder} />
      </SectionCard>

      {mine.length > 0 && (
        <SectionCard
          title="Yours, not shared yet"
          hint="What you made. It works for you now; it reaches everyone once a Builder approves it."
        >
          <ul className={ROWS}>
            {mine.map((c) => (
              <Row
                key={c.id}
                title={c.title}
                marks={
                  <>
                    <StatusPill tone={STATUS_TONE[c.status] ?? "neutral"}>
                      {STATUS[c.status]}
                    </StatusPill>
                    <Tag>{KIND_LABEL[c.kind]}</Tag>
                  </>
                }
                body={what(c)}
                actions={
                  <>
                    {(c.status === "draft" || c.status === "sent_back") && (
                      <Act
                        label={
                          c.status === "sent_back"
                            ? "Send again"
                            : d.builder
                              ? "Add for everyone"
                              : "Send to your Builder"
                        }
                        variant="primary"
                        url={C}
                        body={{ action: "submit", id: c.id }}
                      />
                    )}
                    {c.status !== "rejected" && (
                      <Act
                        label="Discard"
                        variant="ghost"
                        url={C}
                        body={{
                          action: c.status === "waiting" ? "remove" : "discard",
                          id: c.id,
                        }}
                      />
                    )}
                  </>
                }
              >
                {c.status === "sent_back" && c.note && (
                  <p className={NOTE}>
                    {c.approver}: {c.note}
                  </p>
                )}
              </Row>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title="History"
        hint={`Every change to ${client}'s ${role.codename}, newest first.`}
      >
        {historyRows.length === 0 && removed.length === 0 ? (
          <Empty>No changes yet.</Empty>
        ) : (
          <ul className={ROWS}>
            {historyRows.map((h) => (
              <li
                key={h.version}
                className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4"
              >
                <span className="w-28 shrink-0 text-xs tabular-nums text-gray-500">
                  {day(h.created_at)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm">
                    <b className="font-semibold text-gray-900">
                      {h.note ?? "Changed"}
                    </b>{" "}
                    <span className={MUTED}>by {h.author ?? "Fair"}</span>
                  </span>
                  {h.lines.length > 0 && (
                    <ul className="m-0 list-disc space-y-0.5 pl-5 text-sm text-gray-600">
                      {h.lines.map((l) => (
                        <li key={l.path}>
                          {l.label}: {show(l.from)} → {show(l.to)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className="shrink-0">
                  {h.undone_by ? (
                    <StatusPill tone="neutral">Undone</StatusPill>
                  ) : (
                    d.builder &&
                    h.lines.length > 0 &&
                    !/^undo v/.test(h.note ?? "") && (
                      <Act
                        label="Undo"
                        variant="ghost"
                        danger
                        url={P}
                        body={{ action: "undo", version: h.version }}
                        confirm="Undo this change for everyone?"
                      />
                    )
                  )}
                </span>
              </li>
            ))}
            {removed.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4"
              >
                <span className="w-28 shrink-0 text-xs tabular-nums text-gray-500">
                  {day(c.updated_at)}
                </span>
                <b className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
                  Removed {KIND_LABEL[c.kind].toLowerCase()} &quot;{c.title}
                  &quot;
                </b>
                <span className="shrink-0">
                  {d.builder && (
                    <Act
                      label="Bring back"
                      url={C}
                      body={{ action: "restore", id: c.id }}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {d.suggestions.length > 0 && (
        <SectionCard
          title="Sent to Fair"
          hint={`What your team suggested to Fair's ${role.codename} owners, and what they said.`}
        >
          <ul className={ROWS}>
            {d.suggestions.map((s) => {
              const st = SUGGESTION[s.status] ?? {
                label: "Not for now",
                tone: "neutral" as PillTone,
              };
              return (
                <Row
                  key={s.id}
                  title={
                    s.ref_kind === "creation"
                      ? (s.title ?? "A creation")
                      : `${POLICY_HELP[s.ref]?.label ?? s.ref}: ${show(s.value)}`
                  }
                  marks={<StatusPill tone={st.tone}>{st.label}</StatusPill>}
                  body={s.note}
                >
                  {s.fair_note && <p className={NOTE}>Fair: {s.fair_note}</p>}
                </Row>
              );
            })}
          </ul>
        </SectionCard>
      )}

      <p className={MUTED}>
        Want something only Fair can change (how a number is counted, the brands
        tracked)?{" "}
        <Link
          href="/data"
          className="font-semibold text-brand-palette-700 underline-offset-2 hover:underline"
        >
          Data and settings
        </Link>{" "}
        or ask your Fair contact.
      </p>
    </section>
  );
}
