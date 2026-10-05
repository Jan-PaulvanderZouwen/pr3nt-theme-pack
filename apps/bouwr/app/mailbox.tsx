"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, CheckCheck, ChevronDown, ExternalLink, FileEdit, Inbox, Mail, MailOpen, MessageSquare, Paperclip, Plus, RefreshCw, Reply, Save, Search, Send, Settings2, Star, Trash2, Unplug } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

type Row = Record<string, any>;
type Composer = { kind: "project" | "outlook"; project?: string; channel?: string; recipient: string; subject: string; body: string; id?: string; replyId?: string; remoteDraftId?: string; requestId: string };
const folders = [{ id: "inbox", label: "Postvak IN", Icon: Inbox }, { id: "starred", label: "Met ster", Icon: Star }, { id: "sent", label: "Verzonden", Icon: Send }, { id: "drafts", label: "Concepten", Icon: FileEdit }, { id: "archive", label: "Archief", Icon: Archive }];
const stamp = (value: string) => value ? new Date(value).toLocaleDateString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nieuw gesprek";
export default function Mailbox({ user, workspaceMutate, openProject }: { user: Row; workspaceMutate: (body: Row) => Promise<Row>; openProject: (p: Row) => void }) {
  const [data, setData] = useState<Row | null>(null), [error, setError] = useState("");
  const [folder, setFolder] = useState("inbox"), [source, setSource] = useState("all"), [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null), [messages, setMessages] = useState<Row[]>([]), [external, setExternal] = useState<Row | null>(null);
  const [reading, setReading] = useState(false), [busy, setBusy] = useState(false), [syncing, setSyncing] = useState(false), [settings, setSettings] = useState(false);
  const readRequest = useRef(0);
  const [composer, setComposer] = useState<Composer | null>(null);
  const post = useCallback(async (body: Row) => {
    const response = await fetch("/api/mailbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json(); if (!response.ok) throw Error(value.error || "Mailboxactie mislukt"); return value as Row;
  }, []);
  const load = useCallback(async () => { try { const response = await fetch("/api/mailbox"); const value = await response.json(); if (!response.ok) throw Error(value.error); setData(value); setError(""); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30000); return () => clearInterval(timer); }, [load]);
  const connected = !!data?.outlook?.connection;
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => { if (document.visibilityState !== "visible") return; void post({ op: "sync" }).then(load).catch(() => {}); }, 60000);
    return () => clearInterval(timer);
  }, [connected, post, load]);
  const action = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const sync = async () => { if (syncing) return; setSyncing(true); try { const result = await post({ op: "sync" }); await load(); toast.success(result.pending ? "Bijgewerkt. Oudere berichten worden stapsgewijs opgehaald." : "Outlook is bijgewerkt"); } catch (e) { toast.error((e as Error).message); } finally { setSyncing(false); } };
  const entries: Row[] = [
    ...(data?.threads || []).map((t: Row) => ({ ...t, key: "project:" + t.id, isDraft: false })),
    ...(data?.external || []).map((m: Row) => ({ ...m, key: "outlook:" + m.id, kind: "outlook", sender: m.sender_name || m.sender, unread: !m.is_read, archived: m.folder === "archive", sent: m.folder === "sentitems", isDraft: m.folder === "drafts" })),
    ...(data?.drafts || []).map((d: Row) => ({ ...d, key: "draft:" + d.id, isDraft: true, localDraft: true, preview: d.body, received: d.updated, unread: false, sender: "Concept", subject: d.subject || "(geen onderwerp)" })),
  ];
  const inFolder = (entry: Row, f: string) => f === "drafts" ? entry.isDraft : !entry.isDraft && (f === "starred" ? !!entry.starred : f === "archive" ? !!entry.archived : f === "sent" ? !!entry.sent : !entry.archived && (entry.kind === "project" || entry.folder === "inbox"));
  const filtered = entries.filter(entry => inFolder(entry, folder) && (source === "all" || entry.kind === source) && `${entry.subject} ${entry.sender} ${entry.preview} ${entry.client || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (b.received || "").localeCompare(a.received || ""));
  const defaultThread = data?.threads?.[0];
  const begin = (entry?: Row) => {
    if (entry?.localDraft) { setComposer({ id: entry.id, kind: entry.kind, project: entry.project || undefined, channel: entry.channel || undefined, subject: entry.subject || "", body: entry.body || "", replyId: entry.reply_id || undefined, recipient: entry.recipient || "", requestId: crypto.randomUUID() }); return; }
    if (entry?.kind === "outlook") {
      const current = external && external.id === entry.id ? external : entry;
      const replies = (() => { try { return JSON.parse(current.reply_to || "[]"); } catch { return []; } })();
      const recipients = (() => { try { return JSON.parse(current.recipients || "[]"); } catch { return []; } })();
      setComposer({ kind: "outlook", recipient: entry.isDraft ? recipients[0]?.emailAddress?.address || "" : replies[0]?.emailAddress?.address || current.sender || "", subject: entry.isDraft ? current.subject : /^re:/i.test(current.subject) ? current.subject : "Re: " + current.subject, body: entry.isDraft ? current.body || "" : "", remoteDraftId: entry.isDraft ? current.id : undefined, replyId: entry.isDraft ? undefined : current.id, requestId: crypto.randomUUID() }); return;
    }
    const thread = entry?.kind === "project" ? entry : defaultThread;
    setComposer({ kind: thread ? "project" : "outlook", project: thread?.project, channel: thread?.channel || "internal", recipient: "", subject: thread?.subject || "", body: "", requestId: crypto.randomUUID() });
  };
  const open = async (entry: Row) => {
    if (entry.localDraft) { begin(entry); return; }
    const request = ++readRequest.current;
    setSelected(entry); setMessages([]); setExternal(null); setReading(true);
    try {
      const response = await fetch("/api/mailbox?" + (entry.kind === "project" ? "thread=" : "external=") + encodeURIComponent(entry.id));
      const value = await response.json(); if (!response.ok) throw Error(value.error);
      if (request !== readRequest.current) return;
      if (entry.kind === "project") { setMessages(value.messages); const last = value.messages.at(-1); if (last) await post({ op: "threadState", thread: entry.id, readUntil: last.created }); }
      else { setExternal(value.message); if (!entry.isDraft && entry.unread) await post({ op: "externalState", id: entry.id, read: true }); }
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { if (request === readRequest.current) setReading(false); }
  };
  useEffect(() => {
    if (!selected) return;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/mailbox?" + (selected.kind === "project" ? "thread=" : "external=") + encodeURIComponent(selected.id));
        const value = await response.json();
        if (!active || !response.ok) return;
        if (selected.kind === "project") {
          setMessages(value.messages);
          const last = value.messages.at(-1);
          if (last) await post({ op: "threadState", thread: selected.id, readUntil: last.created });
        } else setExternal(value.message);
      } catch { /* The list exposes connection errors; retain the currently readable message. */ }
    };
    const timer = setInterval(() => void refresh(), 25000);
    return () => { active = false; clearInterval(timer); };
  }, [selected?.id, selected?.kind, post]);
  const state = async (entry: Row, patch: Row) => { await post(entry.kind === "project" ? { op: "threadState", thread: entry.id, ...patch } : { op: "externalState", id: entry.id, ...patch }); await load(); setSelected(current => current?.key === entry.key ? { ...current, ...patch } : current); };
  const saveDraft = async () => {
    if (!composer) return;
    const result = await post({ op: composer.remoteDraftId ? "saveOutlookDraft" : "saveDraft", ...composer }); setComposer(current => current ? { ...current, ...(result.id ? { id: result.id } : {}) } : null); await load(); toast.success("Concept opgeslagen");
  };
  const send = async () => {
    if (!composer?.body.trim()) throw Error("Schrijf eerst je bericht.");
    if (composer.kind === "project") {
      if (!composer.project || !composer.channel) throw Error("Kies een projectgesprek.");
      await workspaceMutate({ op: "chat", project: composer.project, channel: composer.channel, body: composer.body.trim(), requestId: composer.requestId });
      if (composer.id) await post({ op: "deleteDraft", id: composer.id });
    } else await post({ op: "sendOutlook", ...composer, draftId: composer.id });
    setComposer(null); await load(); if (selected?.kind === "project") await open(selected);
    toast.success(composer.kind === "project" ? "Bericht geplaatst" : "Bericht aangeboden aan Outlook voor verzending");
  };
  return <div className="mailbox">
    <div className="mailbox-topbar"><div><span className="mailbox-title"><Mail size={20} /> Mijn mailbox</span><small>{connected ? data?.outlook.connection.email : "Projectberichten"}</small></div><div className="mailbox-top-actions">{connected && <button className="outline" disabled={syncing} onClick={sync}><RefreshCw size={16} className={syncing ? "spin" : ""} />{syncing ? "Synchroniseren…" : "Synchroniseren"}</button>}<button className="icon-button" aria-label="Mailboxinstellingen" title="Outlook-koppeling" onClick={() => setSettings(true)}><Settings2 size={19} /></button><button className="primary" onClick={() => begin()} disabled={!defaultThread && !connected}><Plus size={17} /> Nieuw bericht</button></div></div>
    {error && <div className="mailbox-error" role="alert">{error}<button className="text-button" onClick={() => void load()}>Opnieuw proberen</button></div>}
    <div className={`mailbox-layout ${selected ? "has-selection" : ""}`}>
      <aside className="mailbox-folders"><span className="mailbox-folder-label">POSTVAKKEN</span>{folders.map(({ id, label, Icon }) => { const count = entries.filter(e => inFolder(e, id) && (source === "all" || e.kind === source)).length; return <button key={id} className={folder === id ? "active" : ""} onClick={() => { readRequest.current++; setReading(false); setFolder(id); setSelected(null); }}><Icon size={18} /><span>{label}</span>{count > 0 && <small>{count}</small>}</button>; })}<div className="mailbox-sources"><span className="mailbox-folder-label">WEERGEVEN</span>{[{ id: "all", label: "Alles" }, { id: "project", label: "Projectgesprekken" }, { id: "outlook", label: "Outlook" }].map(v => <button key={v.id} className={source === v.id ? "active" : ""} onClick={() => { readRequest.current++; setReading(false); setSource(v.id); setSelected(null); }}><span className={`mail-source-dot ${v.id}`} />{v.label}</button>)}</div><button className="mailbox-connect-link" onClick={() => setSettings(true)}><Mail size={17} />{connected ? "Outlook beheren" : "Outlook koppelen"}</button></aside>
      <section className="mailbox-list"><div className="mailbox-list-heading"><h2>{folders.find(f => f.id === folder)?.label}</h2><span>{filtered.length}</span></div><label className="mailbox-search"><Search size={17} /><input aria-label="Berichten zoeken" placeholder="Zoeken in berichten…" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="mailbox-message-list">{filtered.map(entry => <div key={entry.key} className={`mailbox-list-item ${selected?.key === entry.key ? "selected" : ""} ${entry.unread ? "unread" : ""}`}><button className="mailbox-item-main" onClick={() => void open(entry)}><span className="mailbox-item-top"><b>{entry.sender || "Concept"}</b><small>{stamp(entry.received)}</small></span><strong>{entry.subject}</strong><p>{entry.preview}</p><span className="mailbox-item-meta"><span className={entry.kind}>{entry.kind === "project" ? entry.channel === "client" ? "Klantgesprek" : "Developer" : "Outlook"}</span>{entry.has_attachments ? <Paperclip size={12} /> : null}{entry.unread ? <i /> : null}</span></button>{!entry.isDraft && <button className={`mailbox-star ${entry.starred ? "starred" : ""}`} aria-label={entry.starred ? "Ster verwijderen" : "Met ster markeren"} onClick={() => action(() => state(entry, { starred: !entry.starred }))}><Star size={15} fill={entry.starred ? "currentColor" : "none"} /></button>}</div>)}{!filtered.length && <div className="mailbox-empty-list"><Inbox size={26} /><b>{data ? "Geen berichten in dit postvak" : "Mailbox laden…"}</b><p>{folder === "drafts" ? "Opgeslagen concepten verschijnen hier." : source === "outlook" && !connected ? "Koppel Outlook om je e-mail hier te bekijken." : "Kies een ander postvak of start een projectgesprek."}</p></div>}</div></section>
      <section className="mailbox-reader">{!selected ? <div className="mailbox-reader-empty"><span><MailOpen size={35} /></span><h2>Een korte lijn begint hier.</h2><p>Selecteer een bericht om het gesprek te lezen en te reageren.</p>{!connected && <button className="outline" onClick={() => setSettings(true)}><Mail size={16} /> Outlook koppelen</button>}</div> : <>
        <div className="mailbox-reader-tools"><button className="icon-button mailbox-back" aria-label="Terug naar berichten" onClick={() => setSelected(null)}><ArrowLeft size={18} /></button><span className={`mailbox-reader-channel ${selected.kind}`}>{selected.kind === "project" ? selected.channel === "client" ? "Klantgesprek" : "Developergesprek" : "Outlook"}</span><div>{!selected.isDraft && <><button className="icon-button" aria-label={selected.archived ? "Terug naar postvak IN" : "Archiveren"} onClick={() => action(() => state(selected, { archived: !selected.archived }))}><Archive size={17} /></button><button className="icon-button" aria-label="Ongelezen markeren" onClick={() => action(() => state(selected, selected.kind === "project" ? { unread: true } : { read: false }))}><Mail size={17} /></button><button className="icon-button" aria-label={selected.starred ? "Ster verwijderen" : "Met ster markeren"} onClick={() => action(() => state(selected, { starred: !selected.starred }))}><Star size={17} fill={selected.starred ? "currentColor" : "none"} /></button></>}{selected.kind === "project" && <button className="text-button" onClick={() => openProject({ id: selected.project })}>Project bekijken <ExternalLink size={14} /></button>}</div></div>
        <div className="mailbox-reader-heading"><h2>{selected.subject}</h2><p>{selected.kind === "project" ? selected.client : external?.sender}</p></div><div className="mailbox-reader-body">{reading ? <p className="muted">Gesprek laden…</p> : selected.kind === "project" ? messages.length ? messages.map(message => <article className={`mail-message ${message.author === user.id ? "mine" : ""}`} key={message.id}><header><span className="mail-sender-avatar">{String(message.name || "B").slice(0, 1).toUpperCase()}</span><div><b>{message.name}</b><small>{message.email}</small></div><time>{stamp(message.created)}</time></header><div className="mail-message-text">{message.body}</div></article>) : <div className="mailbox-start-conversation"><MessageSquare size={24} /><h3>Start het gesprek</h3><p>Je bericht komt alleen bij de deelnemers van dit projectgesprek terecht.</p></div> : external && <article className="mail-message"><header><span className="mail-sender-avatar">{String(external.sender_name || external.sender || "M").slice(0, 1).toUpperCase()}</span><div><b>{external.sender_name || external.sender}</b><small>{external.sender}</small></div><time>{stamp(external.received)}</time></header><div className="mail-message-text">{external.body}</div>{external.has_attachments > 0 && <p className="mail-attachments-note"><Paperclip size={16} />Dit bericht heeft bijlagen. Open Outlook om ze te bekijken.</p>}{/^https:\/\/(outlook\.office\.com|outlook\.office365\.com|outlook\.live\.com)\//i.test(external.web_url || "") && <a className="text-button" href={external.web_url} target="_blank" rel="noopener noreferrer">Open in Outlook <ExternalLink size={14} /></a>}</article>}</div>
        <div className="mailbox-reply-footer"><button className="outline" disabled={reading || busy} onClick={() => begin(selected)}>{selected.isDraft ? <FileEdit size={16} /> : <Reply size={16} />}{selected.isDraft ? "Concept bewerken" : "Reageren"}</button><small>{selected.kind === "project" ? "Binnen dit projectgesprek" : `Verzenden via ${data?.outlook.connection?.email || "Outlook"}`}</small></div>
      </>}</section>
    </div>
    <Dialog open={!!composer} onOpenChange={open => { if (!open && !busy) { if (composer?.body.trim() || composer?.id || composer?.remoteDraftId) void action(async () => { await saveDraft(); setComposer(null); }); else setComposer(null); } }}><DialogContent className="app-dialog mail-compose-dialog"><DialogHeader><DialogTitle>{composer?.replyId ? "Reageren op bericht" : composer?.id || composer?.remoteDraftId ? "Concept bewerken" : "Nieuw bericht"}</DialogTitle><DialogDescription>{composer?.kind === "outlook" ? `Verzenden vanuit ${data?.outlook.connection?.email || "Outlook"}` : "Deelnemers van het gekozen projectgesprek"}</DialogDescription></DialogHeader>{composer && <form onSubmit={e => { e.preventDefault(); void action(send); }}>
      {!composer.replyId && !composer.remoteDraftId && <label className="field"><span>Versturen via</span><select value={composer.kind} onChange={e => setComposer({ ...composer, kind: e.target.value as Composer["kind"], subject: e.target.value === "project" ? defaultThread?.subject || "" : "", project: defaultThread?.project, channel: defaultThread?.channel })}><option value="project" disabled={!defaultThread}>Projectgesprek</option><option value="outlook" disabled={!connected}>Outlook-mailbox</option></select></label>}
      {composer.kind === "project" ? <label className="field"><span>Project & gesprek</span><select required value={`${composer.project || ""}:${composer.channel || "internal"}`} onChange={e => { const thread = data?.threads.find((t: Row) => t.id === e.target.value); if (thread) setComposer({ ...composer, project: thread.project, channel: thread.channel, subject: thread.subject }); }}>{(data?.threads || []).map((t: Row) => <option key={t.id} value={t.id}>{t.subject} · {t.channel === "client" ? "Klantgesprek" : "Developer"}</option>)}</select></label> : <><label className="field"><span>Aan</span><input required type="email" maxLength={250} readOnly={!!composer.replyId} value={composer.recipient} onChange={e => setComposer({ ...composer, recipient: e.target.value })} /></label><label className="field"><span>Onderwerp</span><input required maxLength={250} readOnly={!!composer.replyId} value={composer.subject} onChange={e => setComposer({ ...composer, subject: e.target.value })} /></label></>}
      <label className="field"><span>Bericht</span><textarea required autoFocus rows={10} maxLength={composer.kind === "project" ? 3000 : 20000} value={composer.body} placeholder="Schrijf je bericht…" onChange={e => setComposer({ ...composer, body: e.target.value })} /></label><div className="mail-compose-actions"><div><button type="button" className="text-button" disabled={busy} onClick={() => action(saveDraft)}><Save size={16} />Concept opslaan</button>{composer.id && <button type="button" className="icon-button danger" aria-label="Concept verwijderen" disabled={busy} onClick={() => action(async () => { await post({ op: "deleteDraft", id: composer.id }); setComposer(null); await load(); })}><Trash2 size={16} /></button>}</div><button className="primary" disabled={busy}><Send size={16} />{busy ? "Verwerken…" : "Versturen"}</button></div>
    </form>}</DialogContent></Dialog>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="app-dialog mail-settings-dialog"><DialogHeader><DialogTitle>Outlook bij je werkplek</DialogTitle><DialogDescription>Lees je mail en reageer vanuit Bouwr met jouw eigen Microsoft-mailbox.</DialogDescription></DialogHeader>{connected ? <><div className="outlook-connected"><span className="outlook-brand">O</span><div><b>{data?.outlook.connection.email}</b><small>Gekoppeld aan jouw account</small></div><CheckCheck size={22} /></div><p>Postvak IN, Verzonden, Concepten en Archief worden gesynchroniseerd. Gelezen, sterren en archiveren worden ook in Outlook bijgewerkt. Terwijl je deze mailbox open hebt, wordt iedere minuut op wijzigingen gecontroleerd.</p><div className="dialog-actions"><button className="outline" disabled={busy} onClick={() => action(async () => { await post({ op: "disconnect" }); await load(); setSelected(null); toast.success("Outlook ontkoppeld"); })}><Unplug size={16} />Ontkoppelen</button><button className="primary" disabled={syncing} onClick={sync}><RefreshCw size={16} />Synchroniseren</button></div></> : <><div className="outlook-connection-info"><span className="outlook-brand">O</span><div><b>Microsoft 365 & Outlook.com</b><p>Je geeft toestemming om mail te lezen, te beheren en te versturen. Mail wordt pas verstuurd wanneer jij op Versturen klikt.</p></div></div>{data?.outlook.configured ? <button className="primary" onClick={() => window.location.assign("/api/outlook/connect")}>Outlook-account koppelen</button> : <div className="outlook-setup-note"><b>Eenmalig instellen door de beheerder</b><p>Registreer Bouwr in Microsoft Entra en stel de clientgegevens op de VPS in. Daarna kunnen developers hun eigen mailbox koppelen.</p><a href="https://entra.microsoft.com" target="_blank" rel="noopener noreferrer">Microsoft Entra openen <ExternalLink size={14} /></a></div>}<p className="config-hint">Deze koppeling ondersteunt de eigen Microsoft-mailbox. Gedeelde mailboxen en andere mailproviders vallen buiten deze eerste koppeling.</p></>}</DialogContent></Dialog>
  </div>;
}
