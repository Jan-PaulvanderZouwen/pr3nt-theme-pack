"use client";
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, Mail, Share2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
type Row = Record<string, any>;
export default function PortalShare({ project }: { project: Row }) {
  const [open, setOpen] = useState(false);
  return <><button className="outline portal-share-button" onClick={() => setOpen(true)}><Share2 size={16} />Portaal delen</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="app-dialog portal-share-dialog"><DialogHeader><DialogTitle>Deel het klantportaal</DialogTitle><DialogDescription>{project.title}</DialogDescription></DialogHeader><PortalSharingPanel project={project} /></DialogContent></Dialog></>;
}
export function PortalSharingPanel({ project }: { project: Row }) {
  const [email, setEmail] = useState(""), [invites, setInvites] = useState<Row[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl(`${location.origin}/portaal/${project.id}`);
    void fetch(`/api/workspace?project=${project.id}`).then(async response => {
      const value = await response.json(); if (!response.ok || !value.owner) throw Error(value.error || "Alleen de opdrachtgever kan klanten uitnodigen.");
      if (active) setInvites(value.invites);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [project.id]);
  const post = async (body: Row) => {
    const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, project: project.id }) });
    const value = await response.json(); if (!response.ok) throw Error(value.error); return value;
  };
  const reload = async () => { const response = await fetch(`/api/workspace?project=${project.id}`); const value = await response.json(); if (!response.ok) throw Error(value.error); setInvites(value.invites); };
  const copy = async (text: string, success = "Portaallink gekopieerd") => {
    try { await navigator.clipboard.writeText(text); toast.success(success); }
    catch { toast.error("Selecteer de link hieronder en kopieer hem handmatig."); }
  };
  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true);
    try {
      const result = await post({ op: "invite", email: email.trim() }); setUrl(location.origin + result.url); await reload();
      try { await navigator.clipboard.writeText(location.origin + result.url); toast.success("Klant heeft toegang. Portaallink gekopieerd."); }
      catch { toast.success("Klant heeft toegang. Kopieer hieronder de portaallink."); }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const text = `Je kunt de voortgang, bestanden en berichten van ${project.title} bekijken in je klantportaal:\n\n${url}\n\nLog in met het e-mailadres waarop je bent uitgenodigd. Heb je nog geen account? Registreer je met dat adres en bevestig je e-mail.`;
  if (error) return <p role="alert" className="mailbox-error">{error}</p>;
  return <div className="portal-sharing-panel">
    <p>Geef je klant toegang en deel de link. De klant komt na het inloggen meteen bij dit project.</p>
    <form className="portal-invite-form" onSubmit={invite}><label className="field"><span>E-mailadres van je klant</span><input required type="email" maxLength={200} autoComplete="email" placeholder="klant@bedrijf.nl" value={email} onChange={e => setEmail(e.target.value)} /></label><button className="primary" disabled={busy || loading}>{busy ? <Loader2 size={16} className="spin" /> : <Share2 size={16} />}Toegang geven & link kopiëren</button></form>
    <div className="portal-link-field"><label className="field"><span>Portaallink</span><input readOnly value={url} onFocus={e => e.currentTarget.select()} /></label><button className="outline" disabled={!url} onClick={() => void copy(url)}><Copy size={16} />Link kopiëren</button></div>
    <div className="portal-share-options"><button className="text-button" onClick={() => void copy(text, "Uitnodigingstekst gekopieerd")}><Copy size={15} />Uitnodiging kopiëren</button><a className="text-button" href={`mailto:${encodeURIComponent(email || invites.find(i => !i.revoked)?.email || "")}?subject=${encodeURIComponent(`Jouw klantportaal · ${project.title}`)}&body=${encodeURIComponent(text)}`}><Mail size={15} />Open in e-mail</a><a className="text-button" href={url || undefined} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Bekijken</a></div>
    <div className="portal-invite-list"><h3>Klanten met toegang</h3>{loading ? <p className="muted">Toegang laden…</p> : !invites.length ? <p className="muted">Voeg hierboven het klantadres toe.</p> : invites.map(i => <div className="invite-row" key={i.id}><span>{i.email}</span><span className="tag">{i.revoked ? "Ingetrokken" : "Toegang"}</span>{!i.revoked && <button className="icon-button danger" aria-label={`Toegang intrekken voor ${i.email}`} disabled={busy} onClick={async () => { if (busy) return; setBusy(true); try { await post({ op: "revoke", invite: i.id }); await reload(); toast.success("Toegang ingetrokken"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}><Trash2 size={15} /></button>}</div>)}</div>
    <p className="portal-share-note">De link werkt alleen na inloggen met een toegestaan e-mailadres. Klanten zien voortgang, gedeelde bestanden en klantgesprekken.</p>
  </div>;
}
