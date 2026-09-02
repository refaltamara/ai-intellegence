import { SkillsGrid, type SkillCard } from "@/ui/SkillsGrid";
import { registry } from "@/skills/registry";
import { impls } from "@/skills/index";

export default function SkillsPage() {
  const cards: SkillCard[] = registry.skills.map((s) => ({ name: s.name, layer: s.layer, title: s.title, description: s.description, example: s.example, first_release: !!s.first_release, available: !!impls[s.name], phase: String(s.phase) }));
  const layers = Object.entries(registry.layers).map(([key, v]) => ({ key, title: v.title, blurb: v.blurb }));
  const available = cards.filter((c) => c.available).length;
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Skills</h1><span className="meta">{cards.length} skills · {layers.length} data layers · {available} runnable now</span></div>
        <span className="pill blue">Type / in Ask to use any skill</span>
      </div>
      <div className="wrap wide">
        <SkillsGrid cards={cards} layers={layers} />
      </div>
    </section>
  );
}
