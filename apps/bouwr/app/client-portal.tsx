"use client";
import LogoutButton from "./logout-button";
import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  LockKeyhole,
  MessageSquare,
  Folder,
  Send,
  FileText,
  CheckCheck,
  ChevronRight,
  Loader2,
  LogOut,
  Calendar,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";
type Row = Record<string, any>;
export default function ClientPortal({
  projects,
  user,
  initialProject,
  onBack,
}: {
  projects: Row[];
  user: Row;
  initialProject?: string;
  onBack: () => void;
}) {
  const [project, setProject] = useState(
      initialProject || projects[0]?.id || "",
    ),
    [detail, setDetail] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!project) return;
    try {
      const r = await fetch("/api/workspace?project=" + project);
      const d = (await r.json()) as Row;
      if (!r.ok) throw Error(d.error);
      setDetail(d);
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setDetail(null);
    }
  }, [project]);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);
  const brand = detail?.brand?.brand || {
    name: "Jouw klantportaal",
    color: "#175cff",
    logo: "",
  };
  const p = detail?.project;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "chat",
          project,
          channel: "client",
          body: text,
        }),
      });
      const d = (await r.json()) as Row;
      if (!r.ok) throw Error(d.error);
      setText("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="client-shell"
      style={
        {
          "--client-color": brand.color,
          "--primary": brand.color,
        } as React.CSSProperties
      }
    >
      <Toaster richColors />
      <header className="client-header">
        <div className="client-brand">
          {brand.logo ? (
            <img src={brand.logo} alt={brand.name} />
          ) : (
            <span>{brand.name[0]}</span>
          )}
          <b>{brand.name}</b>
        </div>
        <div className="client-header-actions">
          <span>
            <LockKeyhole size={14} /> Beveiligd klantportaal
          </span>
          {user.role !== "client" && <button onClick={onBack}>Werkplek</button>}
          <LogoutButton />
        </div>
      </header>
      <main className="client-main">
        <div className="client-intro">
          <div className="eyebrow">JOUW PROJECTEN</div>
          <h1>Goed om je te zien, {user.name?.split(" ")[0]}.</h1>
          <p>Alle voortgang, bestanden en gesprekken op één plek.</p>
        </div>
        <nav className="client-projects" aria-label="Project kiezen">
          {projects.map((p) => (
            <button
              key={p.id}
              className={project === p.id ? "active" : ""}
              onClick={() => setProject(p.id)}
            >
              <Globe size={16} />
              {p.title}
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={load}>Opnieuw proberen</button>
          </div>
        )}
        {!projects.length && (
          <section className="panel">
            <Folder size={27} />
            <h2>Nog geen gedeelde projecten.</h2>
            <p>
              Je developer kan een project met het e-mailadres van jouw account
              delen. Daarna verschijnt het hier.
            </p>
          </section>
        )}
        {project && !p && !error && (
          <div className="loading-detail">
            <Loader2 className="spin" /> Project laden…
          </div>
        )}
        {p && (
          <>
            <section className="client-progress-card">
              <div className="between">
                <div>
                  <span className="tag">{p.category}</span>
                  <h2>{p.title}</h2>
                </div>
                <span className="status progress">
                  {
                    {
                      open: "Opdracht voorbereiden",
                      progress: "In uitvoering",
                      review: "Klaar voor review",
                      completed: "Opgeleverd",
                    }[p.status as string]
                  }
                </span>
              </div>
              <div className="client-progress-value">
                <b>
                  {p.progress}
                  <small>%</small>
                </b>
                <span>van je project afgerond</span>
              </div>
              <Progress value={p.progress} />
              <div className="client-milestones">
                {["Briefing", "Design", "Bouw", "Oplevering"].map(
                  (label, i) => (
                    <span
                      key={label}
                      className={
                        p.progress >= [10, 30, 60, 100][i] ? "done" : ""
                      }
                    >
                      <CheckCheck size={17} />
                      {label}
                    </span>
                  ),
                )}
              </div>
              <p className="client-deadline">
                <Calendar size={15} /> Gewenste oplevering:{" "}
                {new Date(p.deadline).toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </section>
            <Tabs defaultValue="chat" className="client-content-tabs">
              <TabsList>
                <TabsTrigger value="chat">
                  <MessageSquare size={16} /> Jouw gesprek
                </TabsTrigger>
                <TabsTrigger value="files">
                  <Folder size={16} /> Gedeelde bestanden ({detail.files.length}
                  )
                </TabsTrigger>
                <TabsTrigger value="brief">De opdracht</TabsTrigger>
              </TabsList>
              <TabsContent value="chat">
                <section className="panel">
                  <h2>Een korte lijn met je developer.</h2>
                  <p>
                    Heb je een vraag of feedback? Laat hier een bericht achter.
                  </p>
                  <div className="client-chat">
                    {detail.messages
                      .filter((m: Row) => m.channel === "client")
                      .map((m: Row) => (
                        <div
                          className={
                            "client-message " +
                            (m.author === user.id ? "own" : "")
                          }
                          key={m.id}
                        >
                          <b>
                            {m.name}
                            <small>
                              {new Date(m.created).toLocaleString("nl-NL", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </small>
                          </b>
                          <p>{m.body}</p>
                        </div>
                      ))}
                    {!detail.messages.length && (
                      <p className="muted">
                        Start een gesprek met jouw developer.
                      </p>
                    )}
                  </div>
                  <form className="chat-compose" onSubmit={send}>
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      required
                      maxLength={3000}
                      placeholder="Schrijf een bericht…"
                    />
                    <button
                      className="primary"
                      disabled={busy}
                      aria-label="Bericht versturen"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </section>
              </TabsContent>
              <TabsContent value="files">
                <section className="panel">
                  <h2>Alles bij elkaar.</h2>
                  <p>De bestanden die jouw developer met je heeft gedeeld.</p>
                  {detail.files.map((f: Row) => (
                    <a
                      className="file-row"
                      href={"/api/workspace?download=" + f.id}
                      key={f.id}
                    >
                      <FileText size={22} />
                      <span>
                        <b>{f.name}</b>
                        <small>
                          {f.folder} · {Math.ceil(f.size / 1024)} KB
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </a>
                  ))}
                  {!detail.files.length && (
                    <p className="muted">Er zijn nog geen bestanden gedeeld.</p>
                  )}
                </section>
              </TabsContent>
              <TabsContent value="brief">
                <section className="panel">
                  <h2>De opdracht</h2>
                  <p className="briefing-copy">{p.description}</p>
                </section>
              </TabsContent>
            </Tabs>
          </>
        )}
        <footer className="client-footer">
          <LockKeyhole size={12} /> Alleen toegankelijk voor jouw projectteam.
        </footer>
      </main>
    </div>
  );
}
