"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCheck, ChevronDown, ChevronUp, GripVertical, Layers, Link2, Maximize2, Pencil, Plus, Save, Settings2, StickyNote, Trash2, Wallet, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DashboardWidget, dashboardSchema, defaultWidgets, widgetKinds, widgetLabels } from "@/lib/dashboard";
import { toast } from "sonner";

type Row = Record<string, any>;
const money = (v: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v / 100);
const date = (v: string) => new Date(v).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
const statusNames: Record<string, string> = { open: "Open", progress: "In uitvoering", review: "Review", completed: "Opgeleverd" };

export default function DashboardEditor({ widgets: stored, projects, notifications, openProject, navigate, expandActivity, onSave }: {
  widgets?: DashboardWidget[]; projects: Row[]; notifications: Row[]; openProject: (p: Row) => void;
  navigate: (page: string) => void; expandActivity: () => void; onSave: (widgets: DashboardWidget[]) => Promise<void>;
}) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(stored || defaultWidgets());
  const [editing, setEditing] = useState(false), [saving, setSaving] = useState(false), [palette, setPalette] = useState(false);
  const [editor, setEditor] = useState<DashboardWidget | null>(null), [dragging, setDragging] = useState<string | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [linkText, setLinkText] = useState("");
  useEffect(() => { if (!editing) setWidgets(stored || defaultWidgets()); }, [stored, editing]);
  const reorder = (id: string, target: string) => setWidgets(items => {
    const from = items.findIndex(w => w.id === id), to = items.findIndex(w => w.id === target);
    if (from < 0 || to < 0 || from === to) return items;
    const next = [...items]; next.splice(to, 0, next.splice(from, 1)[0]); return next;
  });
  const move = (id: string, offset: number) => {
    const index = widgets.findIndex(w => w.id === id), target = widgets[index + offset];
    if (target) reorder(id, target.id);
  };
  const edit = (w: DashboardWidget) => { setEditor({ ...w }); setLinkText(w.links.map(link => `${link.label} | ${link.url}`).join("\n")); };
  const add = (kind: DashboardWidget["kind"]) => {
    const w: DashboardWidget = { id: crypto.randomUUID(), kind, title: widgetLabels[kind], width: "small", content: "", links: [] };
    setWidgets(items => [...items, w]); setPalette(false); edit(w);
  };
  const render = (w: DashboardWidget) => {
    const active = projects.filter(p => p.status !== "completed"), reviews = projects.filter(p => p.status === "review");
    if (w.kind === "summary") return <div className="widget-metrics">{[
      { label: "Actieve projecten", value: active.length, Icon: Layers, page: "Mijn projecten" },
      { label: "Projectwaarde", value: money(active.reduce((v, p) => v + (p.budget || 0), 0)), Icon: Wallet, page: "Betalingen" },
      { label: "Klaar voor review", value: reviews.length, Icon: CheckCheck, page: "Mijn projecten" },
      { label: "Opgeleverd", value: projects.filter(p => p.status === "completed").length, Icon: Layers, page: "Mijn projecten" },
    ].map(({ label, value, Icon, page }) => <button key={label} onClick={() => !editing && navigate(page)}><span><Icon size={17} />{label}</span><strong>{value}</strong></button>)}</div>;
    if (w.kind === "pipeline") return <div className="widget-pipeline-body">{Object.entries(statusNames).map(([key, label]) => <button className={key} key={key} onClick={() => !editing && navigate("Mijn projecten")}><span>{label}</span><strong>{projects.filter(p => p.status === key).length.toString().padStart(2, "0")}</strong><i style={{ width: `${Math.max(5, projects.filter(p => p.status === key).length / Math.max(projects.length, 1) * 100)}%` }} /></button>)}</div>;
    if (w.kind === "projects" || w.kind === "review") {
      const rows = w.kind === "review" ? reviews : active;
      return <div className="widget-project-list">{rows.slice(0, w.width === "small" ? 3 : 5).map(p => <button key={p.id} onClick={() => !editing && openProject(p)}><span className={`widget-project-dot ${p.status}`} /><span><b>{p.title}</b><small>{p.client || p.category} · {statusNames[p.status]}</small></span><span className="widget-percent">{p.progress}%</span></button>)}{!rows.length && <WidgetEmpty text={w.kind === "review" ? "Er staat nog geen werk klaar voor review." : "Je lopende projecten verschijnen hier."} />}</div>;
    }
    if (w.kind === "activity") return <div className="widget-activity-list">{notifications.slice(0, 4).map(n => <button key={n.id} onClick={() => { const p = projects.find(p => p.id === n.project); if (!editing && p) openProject(p); }}><span className={!n.read ? "unread" : ""} /><div><p>{n.body}</p><small>{date(n.created)}</small></div></button>)}{!notifications.length && <WidgetEmpty text="Nieuwe updates verschijnen hier." />}</div>;
    if (w.kind === "deadlines") return <div className="widget-deadline-list">{[...active].filter(p => p.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 4).map(p => <button key={p.id} onClick={() => !editing && openProject(p)}><CalendarDays size={18} /><span><b>{p.title}</b><small className={p.deadline < new Date().toLocaleDateString("sv-SE") ? "overdue" : ""}>{date(p.deadline)}</small></span></button>)}{!active.length && <WidgetEmpty text="Voeg een project toe om deadlines te volgen." />}</div>;
    if (w.kind === "notes") return <div className="widget-note">{w.content || <span className="muted">Klik op bewerken om een notitie toe te voegen.</span>}</div>;
    return <div className="widget-link-list">{w.links.map((link, i) => <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"><Link2 size={16} />{link.label}</a>)}{!w.links.length && <WidgetEmpty text="Voeg jouw veelgebruikte links toe." />}</div>;
  };
  return <div className="personal-dashboard">
    <div className="dashboard-toolbar"><div><span className="dashboard-personal-label"><Layers size={16} /> Mijn overzicht</span>{editing && <p>Versleep een widget met het handvat of gebruik de pijlen.</p>}</div><div className="dashboard-actions">{editing ? <>
      <button className="outline" disabled={saving || widgets.length >= 24} onClick={() => setPalette(true)}><Plus size={16} /> Widget toevoegen</button>
      <button className="text-button" disabled={saving} onClick={() => { setEditing(false); setWidgets(stored || defaultWidgets()); }}><X size={16} /> Annuleren</button>
      <button className="primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(dashboardSchema.parse(widgets)); setEditing(false); toast.success("Jouw overzicht is opgeslagen"); } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); } }}><Save size={16} />{saving ? "Opslaan…" : "Opslaan"}</button>
    </> : <button className="outline" onClick={() => setEditing(true)}><Pencil size={16} /> Overzicht bewerken</button>}</div></div>
    <div className={`dashboard-widgets ${editing ? "is-editing" : ""}`}>
      {widgets.map((w, index) => <section key={w.id} data-widget={w.id} className={`dashboard-widget widget-${w.kind} width-${w.width} ${dragging === w.id ? "is-dragging" : ""}`}>
        <header>{editing && <button className="widget-grip icon-button" aria-label={`${w.title} verslepen; gebruik pijl omhoog of omlaag`} onKeyDown={e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); move(w.id, e.key === "ArrowUp" ? -1 : 1); } }}
          onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: w.id, x: e.clientX, y: e.clientY, moved: false }; }}
          onPointerMove={e => { if (!drag.current) return; if (Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 6) { drag.current.moved = true; setDragging(w.id); } }}
          onPointerUp={e => { if (drag.current?.moved) { const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-widget]")?.getAttribute("data-widget"); if (target) reorder(w.id, target); } drag.current = null; setDragging(null); }}
          onPointerCancel={() => { drag.current = null; setDragging(null); }}><GripVertical size={18} /></button>}
          <h2>{w.title}</h2><div className="widget-header-actions">{editing ? <>
            <button className="icon-button" aria-label={`${w.title} omhoog`} disabled={index === 0} onClick={() => move(w.id, -1)}><ChevronUp size={16} /></button>
            <button className="icon-button" aria-label={`${w.title} omlaag`} disabled={index === widgets.length - 1} onClick={() => move(w.id, 1)}><ChevronDown size={16} /></button>
            <button className="icon-button" aria-label={`${w.title} instellen`} onClick={() => edit(w)}><Settings2 size={16} /></button>
            <button className="icon-button danger" aria-label={`${w.title} verwijderen`} onClick={() => setWidgets(items => items.filter(item => item.id !== w.id))}><Trash2 size={16} /></button>
          </> : w.kind === "activity" ? <button className="icon-button" aria-label="Activiteit uitbreiden" onClick={expandActivity}><Maximize2 size={16} /></button> : w.kind === "notes" || w.kind === "links" ? <button className="icon-button" aria-label={`${w.title} bewerken`} onClick={() => { setEditing(true); edit(w); }}><Pencil size={16} /></button> : null}</div>
        </header><div className="widget-content">{render(w)}</div>
        {w.kind === "activity" && !editing && <button className="widget-footer" onClick={expandActivity}>Bekijk alle activiteiten</button>}
      </section>)}
      {!widgets.length && <div className="widget-empty-board"><Layers size={28} /><h2>Maak ruimte voor jouw werk.</h2><p>Voeg widgets toe om je eigen overzicht samen te stellen.</p><button className="primary" onClick={() => { setEditing(true); setPalette(true); }}><Plus size={16} /> Widget toevoegen</button></div>}
    </div>
    <Dialog open={palette} onOpenChange={setPalette}><DialogContent className="app-dialog widget-dialog"><DialogHeader><DialogTitle>Wat wil je in je overzicht?</DialogTitle><DialogDescription>Kies een widget en zet hem waar jij wilt.</DialogDescription></DialogHeader><div className="widget-palette">{widgetKinds.map(kind => <button key={kind} onClick={() => add(kind)}><span>{kind === "notes" ? <StickyNote size={22} /> : kind === "links" ? <Link2 size={22} /> : <Layers size={22} />}</span><b>{widgetLabels[kind]}</b><small>{kind === "notes" ? "Een eigen notitie of geheugensteuntje" : kind === "links" ? "Jouw veelgebruikte websites" : "Gegevens uit jouw projecten"}</small><Plus size={16} /></button>)}</div></DialogContent></Dialog>
    <Dialog open={!!editor} onOpenChange={open => !open && setEditor(null)}><DialogContent className="app-dialog widget-dialog"><DialogHeader><DialogTitle>Widget instellen</DialogTitle><DialogDescription>Naam, formaat en inhoud van deze widget.</DialogDescription></DialogHeader>{editor && <form onSubmit={e => { e.preventDefault(); try {
      const links = editor.kind === "links" ? linkText.split("\n").filter(line => line.trim()).map(line => { const i = line.indexOf("|"); return { label: line.slice(0, i).trim(), url: line.slice(i + 1).trim() }; }) : editor.links;
      const next = dashboardSchema.parse([{ ...editor, links }])[0]; setWidgets(items => items.map(w => w.id === next.id ? next : w)); setEditor(null);
    } catch { toast.error("Controleer de naam en links. Gebruik: Naam | https://website.nl"); } }}>
      <label className="field"><span>Naam</span><input required maxLength={80} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} /></label>
      <label className="field"><span>Formaat</span><select value={editor.width} onChange={e => setEditor({ ...editor, width: e.target.value as DashboardWidget["width"] })}><option value="small">Compact · één kolom</option><option value="medium">Ruim · twee kolommen</option><option value="wide">Volledige breedte</option></select></label>
      {editor.kind === "notes" && <label className="field"><span>Notitie</span><textarea rows={7} maxLength={3000} value={editor.content} onChange={e => setEditor({ ...editor, content: e.target.value })} /></label>}
      {editor.kind === "links" && <label className="field"><span>Links · één per regel</span><textarea rows={6} value={linkText} placeholder={"GitHub | https://github.com\nHosting | https://www.transip.nl"} onChange={e => setLinkText(e.target.value)} /><small>Naam | https://website.nl · maximaal 12 links</small></label>}
      <div className="dialog-actions"><button type="button" className="outline" onClick={() => setEditor(null)}>Sluiten</button><button className="primary">Toepassen</button></div>
    </form>}</DialogContent></Dialog>
    <span className="sr-only" role="status" aria-live="polite">{dragging ? "Widget wordt versleept" : editing ? "Overzicht bewerken" : "Overzicht"}</span>
  </div>;
}
function WidgetEmpty({ text }: { text: string }) { return <p className="widget-empty">{text}</p>; }
