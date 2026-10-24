import { registry } from "@/skills/registry";
import { workspaceStats } from "@/ui/stats";
import { SkillDb } from "@/skills/db";
import { loadContext } from "@/skills/params";
import { fmtNum } from "@/ui/format";
import { ClientBrand } from "@/ui/ClientBrand";
import { getWorkspace } from "@/workspace/store";
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import Link from "next/link";
import { PLATFORM_LABEL } from "@/skills/common";
import { captionStatus } from "@/captions/run";
import { CaptionReading } from "@/ui/CaptionReading";
import { Bar, Tag } from "@/ui/dashboard/parts";
import { IconBriefcase, IconDocument, IconMessages, IconProfile2User } from "@/ui/kit/icons";
import { PageHeader } from "@/ui/kit/PageHeader";
import { Panel, SectionCard } from "@/ui/kit/Section";
import { StatRow, StatTile } from "@/ui/kit/StatTile";
import { StatusPill } from "@/ui/kit/StatusPill";
import { EMPTY_ROW, SUB, TD, TD_NUM, TH, TH_NUM, TR, Table } from "@/ui/kit/Table";

export const dynamic = "force-dynamic";

const PANEL_TEXT = "text-sm leading-relaxed text-gray-600";
const PANEL_FOOT = "mt-auto text-xs text-gray-500";

export default async function DataPage() {
  const ws = await currentWorkspaceId();
  const [s, ctx, actor, cfg] = await Promise.all([workspaceStats(ws), loadContext(new SkillDb(), ws), currentActor(), getWorkspace(ws)]);
  const canEdit = !!actor && can(actor, "workspace.data", { workspace: ws });
  const captions = cfg?.kind === "profile" ? null : await captionStatus(ws);
  const pct = (a: number, b: number) => Math.round((a / b) * 100);
  const platformName = (p: string) => PLATFORM_LABEL[p] ?? p;
  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-10 md:px-6">
      <PageHeader title="Data" subtitle={`${cfg?.category_label ?? ws} · What every answer is built from`}
        actions={<StatusPill tone="live">Last load {s.last_load ?? "–"} WIB · data through {s.freshness}</StatusPill>} />

      <ClientBrand brands={ctx.brands.map((b) => ({ id: b.id, name: b.name }))} current={ctx.clientBrandId} canEdit={canEdit} productName={cfg?.assistant_name ?? "CeMO"} kind={cfg?.kind ?? "category"} />

      <StatRow n={4}>
        <StatTile icon={IconBriefcase} label="Brands tracked" value={fmtNum(s.brands)} sub={`${ctx.brands.filter((b) => b.tiktok_handle && b.instagram_handle).length} on both platforms`} />
        <StatTile icon={IconProfile2User} label="Creators" value={fmtNum(s.creators)} sub="with brand history and performance" />
        <StatTile icon={IconDocument} label="Post rows" value={fmtNum(s.posts)} sub={`${fmtNum(s.unique_posts)} unique posts`} />
        <StatTile icon={IconMessages} label="Comments" value={fmtNum(s.comments)} sub={s.comments ? (s.comments_labelled === s.comments ? "all with sentiment" : `${fmtNum(s.comments_labelled)} with sentiment so far`) : "none loaded"} />
      </StatRow>

      <SectionCard title="What is loaded" hint="Each layer of data and the analyses it powers.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {s.per_platform.map((p) => (
            <Panel key={p.platform} title={platformName(p.platform)}>
              <p className={PANEL_TEXT}>{fmtNum(p.posts)} posts from {fmtNum(p.creators)} {cfg?.subject_noun ?? "creators"}, {p.first_month} to {p.last_month}. {cfg?.kind === "profile" ? "Keyword capture around the subject plus the subject's own posts." : p.platform === "tiktok" ? "Keyword capture plus owned accounts; shoppable-link flag recorded." : "Tag-based capture; no owned posts, no shares or saves."}</p>
              <p className={PANEL_FOOT}>Powers {registry.skills.filter((k) => !k.platforms || k.platforms.includes(p.platform)).filter((k) => k.phase === 1).length} analyses</p>
            </Panel>
          ))}
          {captions && <CaptionReading status={captions} canEdit={canEdit} />}
          {s.comments ? (
            <Panel title="Comments">
              <p className={PANEL_TEXT}>{fmtNum(s.comments)} comments under every post, {s.comments_labelled === s.comments ? "all with a sentiment label" : `${fmtNum(s.comments_labelled)} with a sentiment label so far (labelling runs in the background)`}. Powers sentiment over time, what people are saying, who is driving it and seeding detection.</p>
              <p className={PANEL_FOOT}>Sentiment: positive, neutral, negative</p>
            </Panel>
          ) : (
            <Panel title="Comments, snapshots, Threads and X" className="bg-gray-50">
              <p className={PANEL_TEXT}>Not loaded. Comment-layer, audience, velocity, forecast and narrative skills report themselves as unavailable until these land.</p>
              <p className={PANEL_FOOT}>Phase 1b and Phase 2</p>
            </Panel>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Capture coverage per month" hint="Days with at least one post captured. A partial month has gaps.">
        <Table min="min-w-[640px]" head={<><th className={TH}>Platform</th><th className={TH}>Month</th><th className={TH_NUM}>Posts</th><th className={TH_NUM}>Days captured</th><th className={TH}>Coverage</th></>}>
          {s.per_month.map((m) => {
            const full = m.days_captured >= m.days_in_month;
            return (
              <tr key={m.platform + m.month} className={TR}>
                <td className={TD}>{platformName(m.platform)}</td>
                <td className={TD}>{m.month}</td>
                <td className={TD_NUM}>{fmtNum(m.posts)}</td>
                <td className={TD_NUM}>{m.days_captured}/{m.days_in_month}</td>
                <td className={TD}>
                  <span className="flex items-center gap-3">
                    <span className="w-32 shrink-0"><Bar pct={pct(m.days_captured, m.days_in_month)} className={full ? "bg-green-600" : "bg-amber-500"} label={`${pct(m.days_captured, m.days_in_month)}% of days captured`} /></span>
                    <span className={full ? "text-xs text-gray-500" : "text-xs font-semibold text-amber-800"}>{full ? "full" : "partial"}</span>
                  </span>
                </td>
              </tr>
            );
          })}
          {s.per_month.length === 0 && <tr><td colSpan={5} className={EMPTY_ROW}>Nothing loaded yet. Coverage shows here after the first load.</td></tr>}
        </Table>
      </SectionCard>

      <SectionCard title="Recent loads" hint="The last twelve files loaded into this workspace, times in WIB.">
        <Table min="min-w-[720px]" head={<><th className={TH}>File</th><th className={TH}>Platform</th><th className={TH_NUM}>Rows in</th><th className={TH_NUM}>Loaded</th><th className={TH_NUM}>Rejected</th><th className={TH}>Finished</th></>}>
          {s.loads.map((l, i) => (
            <tr key={i} className={TR}>
              <td className={`${TD} max-w-80 truncate`} title={l.file}>{l.file}</td>
              <td className={TD}>{l.platform ? platformName(l.platform) : "–"}</td>
              <td className={TD_NUM}>{fmtNum(l.rows_in)}</td>
              <td className={TD_NUM}>{fmtNum(l.rows_loaded)}</td>
              <td className={TD_NUM}>{fmtNum(l.rows_rejected)}</td>
              <td className={`${TD} whitespace-nowrap`}>{l.finished_at ?? <StatusPill tone="waiting">Running</StatusPill>}</td>
            </tr>
          ))}
          {s.loads.length === 0 && <tr><td colSpan={6} className={EMPTY_ROW}>No loads yet. Fair&apos;s data team loads the first files.</td></tr>}
        </Table>
      </SectionCard>

      <SectionCard title="Brands in this workspace" hint="Open one to see what was collected about it.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ctx.brands.map((b) => (
            <Link key={b.id} href={`/data/${b.id}`} title={b.id}
              className="flex min-h-11 flex-col gap-0.5 rounded-2xl border border-card-border bg-white p-4 transition-colors hover:border-brand-palette-300 hover:bg-brand-palette-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600">
              <span className="flex items-center gap-2">
                <b className="truncate text-sm font-semibold text-gray-900">{b.name}</b>
                {b.is_client && <Tag tone="brand">Client</Tag>}
              </span>
              <span className={SUB}>{b.tiktok_handle && b.instagram_handle ? "TikTok + Instagram" : b.tiktok_handle ? "TikTok" : "Instagram"}</span>
            </Link>
          ))}
        </div>
      </SectionCard>
    </section>
  );
}
