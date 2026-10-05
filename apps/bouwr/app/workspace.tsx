"use client";
import { useEffect, useState, useCallback } from "react";
import ClientPortal from "./client-portal";
import HelpCenter from "./help-center";
import LogoutButton from "./logout-button";
import {
  LayoutDashboard,
  Layers,
  Store,
  FileStack,
  MessageSquare,
  Users,
  Wallet,
  Settings,
  Search,
  Bell,
  Plus,
  Maximize2,
  ChevronRight,
  MoreHorizontal,
  Check,
  CheckCheck,
  LockKeyhole,
  Folder,
  FileText,
  Upload,
  Globe,
  Code2,
  ShoppingBag,
  PanelTop,
  ExternalLink,
  HelpCircle,
  LogOut,
  LayoutGrid,
  List,
  Calendar,
  ShieldCheck,
  ArrowUpRight,
  Building2,
  Palette,
  Send,
  Copy,
  Link2,
  Play,
  CircleCheck,
  Loader2,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { defaultTemplates, standards, folders } from "@/lib/standards";
type Data = Record<string, any>;
type Identity = { id: string; email: string; name: string } | null;
const money = (c = 0) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(c / 100);
const date = (s: string) =>
  s
    ? new Date(s).toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "short",
      })
    : "—";
const statuses: Record<string, string> = {
  open: "Open voor biedingen",
  progress: "In uitvoering",
  review: "Klaar voor review",
  completed: "Opgeleverd",
};
const categoryIcon: Record<string, typeof Globe> = {
  Website: Globe,
  WordPress: PanelTop,
  Shopify: ShoppingBag,
  Webapp: Code2,
};
const examples: Data[] = [
  {
    id: "demo-1",
    title: "Nieuwe website voor Studio Noord",
    client: "Studio Noord",
    description:
      "Een frisse, snelle website voor een interieurstudio. Vijf pagina’s, portfolio, contactformulier en een eenvoudig te beheren CMS.",
    category: "WordPress",
    budget: 245000,
    deadline: "2026-10-23",
    status: "progress",
    progress: 68,
    hosting: "Eigen hosting",
    contact: 0,
    owner: "demo",
    executor: "example",
    checklist: defaultTemplates[1].checklist.map((c, i) => ({
      ...c,
      done: i < 17,
    })),
    payment_mode: "platform",
    color: "orange",
  },
  {
    id: "demo-2",
    title: "Shopify webshop · Atelier Maan",
    client: "Atelier Maan",
    description:
      "Een minimalistische webshop met productvarianten, iDEAL en een koppeling met voorraadbeheer.",
    category: "Shopify",
    budget: 380000,
    deadline: "2026-11-06",
    status: "open",
    progress: 0,
    hosting: "Hosting uitvoerder",
    contact: 0,
    owner: "demo",
    checklist: defaultTemplates[2].checklist,
    payment_mode: "platform",
    color: "purple",
  },
  {
    id: "demo-3",
    title: "Klantportaal voor Van Dijk",
    client: "Van Dijk Advies",
    description:
      "Een veilig klantportaal met documenten, statusupdates en een eigen huisstijl.",
    category: "Webapp",
    budget: 520000,
    deadline: "2026-10-15",
    status: "review",
    progress: 95,
    hosting: "Eigen hosting",
    contact: 1,
    owner: "demo",
    executor: "example",
    checklist: defaultTemplates[3].checklist.map((c, i) => ({
      ...c,
      done: i < 24,
    })),
    payment_mode: "platform",
    color: "blue",
  },
  {
    id: "demo-4",
    title: "Website redesign · Bloom",
    client: "Bloom Flowers",
    description:
      "Een nieuwe website met een boekingsformulier en aandacht voor lokale vindbaarheid.",
    category: "Website",
    budget: 175000,
    deadline: "2026-10-28",
    status: "progress",
    progress: 32,
    hosting: "Eigen hosting",
    contact: 0,
    owner: "demo",
    executor: "example",
    checklist: defaultTemplates[0].checklist.map((c, i) => ({
      ...c,
      done: i < 7,
    })),
    payment_mode: "platform",
    color: "green",
  },
  {
    id: "demo-5",
    title: "Landingpage voor Ronde",
    client: "Ronde Studio",
    description: "Een compacte campagnepagina met conversiegerichte content.",
    category: "Website",
    budget: 95000,
    deadline: "2026-10-01",
    status: "completed",
    progress: 100,
    hosting: "Hosting uitvoerder",
    contact: 0,
    owner: "demo",
    executor: "example",
    checklist: defaultTemplates[0].checklist.map((c) => ({ ...c, done: true })),
    payment_mode: "platform",
    color: "pink",
  },
];
const demoBids = [
  {
    id: "db1",
    name: "Emma de Vries",
    company: "Studio Emma",
    amount: 320000,
    days: 14,
    message:
      "Ik bouw een snel, toegankelijk Shopify-thema dat je zelf eenvoudig kunt beheren.",
    status: "pending",
  },
  {
    id: "db2",
    name: "Daan Vermeer",
    company: "Vermeer Digital",
    amount: 355000,
    days: 18,
    message:
      "Inclusief voorraadkoppeling, testbestelling en een overdrachtssessie.",
    status: "pending",
  },
];
const navigation = [
  { name: "Overzicht", icon: LayoutDashboard },
  { name: "Mijn projecten", icon: Layers },
  { name: "Marktplaats", icon: Store },
  { name: "Templates", icon: FileStack },
  { name: "Berichten", icon: MessageSquare },
  { name: "Klantportaal", icon: Users },
  { name: "Betalingen", icon: Wallet },
];
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Pick({
  value,
  onChange,
  values,
}: {
  value: string;
  onChange: (v: string) => void;
  values: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="pick">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`status ${status}`}>
      <span />
      {statuses[status] || status}
    </span>
  );
}
function Mark({ category }: { category: string }) {
  const I = categoryIcon[category] || Globe;
  return (
    <span className={`project-mark ${category.toLowerCase()}`}>
      <I size={21} />
    </span>
  );
}
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span className={`avatar ${small ? "small" : ""}`}>
      {(name || "B")
        .split(/\s/)
        .slice(0, 2)
        .map((x) => x[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
export default function Workspace({ identity }: { identity: Identity }) {
  const [data, setData] = useState<Data | null>(null),
    [demo, setDemo] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState("Overzicht"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("list"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState<Data | null>(null),
    [detail, setDetail] = useState<Data | null>(null),
    [busy, setBusy] = useState(false),
    [tour, setTour] = useState(-1),
    [notifyOpen, setNotifyOpen] = useState(false),
    [projectStep, setProjectStep] = useState(0),
    [templateId, setTemplateId] = useState("website"),
    [form, setForm] = useState<Data>({}),
    [editTemplate, setEditTemplate] = useState<Data | null>(null),
    [channel, setChannel] = useState("internal"),
    [text, setText] = useState(""),
    [progress, setProgress] = useState(0),
    [checks, setChecks] = useState<Data[]>([]),
    [folder, setFolder] = useState(folders[0]),
    [clientFile, setClientFile] = useState(false),
    [brand, setBrand] = useState<Data>({
      name: "J.P. van der Zouwen",
      color: "#175cff",
      logo: "",
    }),
    [vault, setVault] = useState<string | null>(null),
    [clientPortal, setClientPortal] = useState(false);
  const load = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    try {
      const r = await fetch("/api/workspace");
      const d = (await r.json()) as Data;
      if (!r.ok) throw Error(d.error);
      setData(d);
      if (d.registered) {
        setDemo(false);
        setBrand(d.user.brand);
      } else {
        setForm({ name: identity.name || "", company: "", role: new URLSearchParams(location.search).has("client") ? "client" : "developer" });
        setModal("register");
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [identity]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (data?.registered && !localStorage.getItem("bouwr-tour")) setTour(0);
  }, [data?.registered]);
  const projects: Data[] = demo ? examples : data?.projects || [],
    market: Data[] = demo
      ? [
          {
            ...examples[1],
            id: "demo-market",
            client: undefined,
            owner: "other",
          },
          {
            ...examples[0],
            id: "demo-market2",
            title: "WordPress website voor een architect",
            status: "open",
            progress: 0,
            owner: "other",
          },
        ]
      : data?.market || [];
  const templates: Data[] = demo
    ? defaultTemplates
    : data?.templates || defaultTemplates;
  const user = demo
    ? { name: "Jan-Paul", company: "J.P. van der Zouwen", role: "developer" }
    : data?.user || {};
  const client = user.role === "client";
  const mutate = async (body: Data) => {
    if (demo) throw Error("Registreer je om met je eigen projecten te werken.");
    const r = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as Data;
    if (!r.ok) throw Error(d.error);
    return d;
  };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const closeTour = () => {
    localStorage.setItem("bouwr-tour", "done");
    setTour(-1);
  };
  const openProject = async (p: Data) => {
    setSelected(p);
    setModal("project");
    setVault(null);
    setDetail(null);
    setChecks(p.checklist || []);
    setProgress(p.progress || 0);
    setChannel(client ? "client" : "internal");
    setForm({});
    if (demo) {
      setDetail({
        project: p,
        owner: p.owner === "demo",
        executor: false,
        member: false,
        canClientChat: true,
        bids: p.status === "open" ? demoBids : [],
        messages: [],
        files: [],
        invites: [],
        hasSecret: false,
      });
      return;
    }
    try {
      const r = await fetch("/api/workspace?project=" + p.id);
      const d = (await r.json()) as Data;
      if (!r.ok) throw Error(d.error);
      setDetail(d);
      setSelected(d.project);
      setChecks(d.project.checklist || []);
      setProgress(d.project.progress);
      setChannel(d.member && !d.owner && !d.executor ? "client" : "internal");
    } catch (e) {
      toast.error((e as Error).message);
      setModal("");
    }
  };
  const refreshProject = async () => {
    await load();
    if (selected) await openProject(selected);
  };
  useEffect(() => {
    if (!identity) return;
    const id = new URLSearchParams(location.search).get("project");
    if (id && data?.registered) {
      if (new URLSearchParams(location.search).has("client")) {
        setClientPortal(true);
      } else {
        openProject({ id, title: "Project" });
        setPage("Klantportaal");
      }
    }
  }, [data?.registered]);
  useEffect(() => {
    if (demo || !identity) return;
    const timer = setInterval(() => {
      load();
      if (modal === "project" && selected)
        fetch("/api/workspace?project=" + selected.id).then(async (r) => {
          if (r.ok) setDetail((await r.json()) as Data);
        });
    }, 25000);
    return () => clearInterval(timer);
  }, [demo, identity, modal, selected?.id, load]);
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    ctx.registerTool(
      {
        name: "open_project_creation",
        title: "Project aanmaken openen",
        description:
          "Opent het formulier voor een nieuwe developmentopdracht; slaat nog geen project op.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          if (!input || Object.keys(input as object).length)
            throw Error("Geen velden verwacht.");
          if (client) throw Error("Klanten kunnen geen projecten plaatsen.");
          setForm({});
          setProjectStep(0);
          setModal("create");
          return { opened: true };
        },
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [client]);
  const startCreate = (t = "website") => {
    setTemplateId(t);
    setForm({
      hosting: "Eigen hosting",
      category: templates.find((x) => x.id === t)?.category || "Website",
      paymentMode: "platform",
      contact: false,
    });
    setProjectStep(0);
    setModal("create");
  };
  const go = (p: string) => {
    setPage(p);
    setQuery("");
    setFilter("all");
  };
  const saveTemplate = () =>
    run(async () => {
      await mutate({ op: "saveTemplate", ...editTemplate });
      toast.success("Template opgeslagen");
      setModal("");
      await load();
    });
  const filtered = (page === "Marktplaats" ? market : projects).filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      `${p.title} ${p.client || ""} ${p.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const active = projects.filter((p) => p.status !== "completed"),
    review = projects.filter((p) => p.status === "review"),
    total = active.reduce((a, p) => a + (p.budget || 0), 0);
  const notifications: Data[] = demo
    ? [
        {
          id: "n1",
          project: "demo-3",
          body: "Van Dijk is klaar voor jouw review.",
          created: "2026-10-05T14:32:00",
          read: 0,
        },
        {
          id: "n2",
          project: "demo-2",
          body: "Emma de Vries heeft een nieuw bod gedaan.",
          created: "2026-10-05T13:05:00",
          read: 0,
        },
        {
          id: "n3",
          project: "demo-1",
          body: "Nieuwe ontwerpbestanden bij Studio Noord.",
          created: "2026-10-05T10:40:00",
          read: 0,
        },
      ]
    : data?.notifications || [];
  const initRegister = () => {
    setForm({
      name: identity?.name || "",
      company: "",
      role: new URLSearchParams(location.search).has("client")
        ? "client"
        : "developer",
    });
    setModal("register");
  };
  const headerTitle: Record<string, string> = {
    Overzicht: "Goed overzicht. Lekker doorbouwen.",
    "Mijn projecten": "Al je projecten, op één plek.",
    Marktplaats: "Vind je volgende opdracht.",
    Templates: "Goed werk begint met een goede basis.",
    Berichten: "Korte lijnen. Duidelijke afspraken.",
    Klantportaal: "Jouw merk. Jouw klantportaal.",
    Betalingen: "Grip op elke betaling.",
    Instellingen: "Maak Bouwr jouw werkplek.",
    Beheer: "Beheer van het platform.",
  };
  if (!demo && (client || clientPortal))
    return (
      <ClientPortal
        projects={projects}
        user={user}
        initialProject={
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("project") ||
              undefined
            : undefined
        }
        onBack={() => {
          setClientPortal(false);
        }}
      />
    );
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "246px" } as React.CSSProperties}
    >
      <Toaster position="bottom-right" richColors />
      <Sidebar className="bouwr-sidebar">
        <SidebarHeader className="brand-header">
          <button className="wordmark" onClick={() => go("Overzicht")}>
            bouwr<span>.</span>
          </button>
          <span className="workspace-label">Samen aan mooi werk.</span>
        </SidebarHeader>
        <SidebarContent>
          <div
            className="workspace-identity"
            title="Het bedrijf van jouw profiel"
          >
            <Building2 size={16} aria-hidden="true" />
            <span>{user.company || "Mijn werkplek"}</span>
          </div>
          <SidebarGroup>
            <SidebarGroupLabel className="nav-label">
              WERKPLEK
            </SidebarGroupLabel>
            <SidebarMenu>
              {navigation
                .filter(
                  (n) =>
                    !client ||
                    [
                      "Overzicht",
                      "Mijn projecten",
                      "Berichten",
                      "Klantportaal",
                    ].includes(n.name),
                )
                .map((n) => (
                  <SidebarMenuItem key={n.name}>
                    <SidebarMenuButton
                      isActive={page === n.name}
                      onClick={() => go(n.name)}
                      className="nav-item"
                    >
                      <n.icon size={19} />
                      <span>{n.name}</span>
                      {n.name === "Mijn projecten" && (
                        <span className="nav-count">{active.length}</span>
                      )}
                      {n.name === "Berichten" &&
                        notifications.filter((n) => !n.read).length > 0 && (
                          <span className="nav-dot" />
                        )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroup>
          <div className="sidebar-spacer" />
        </SidebarContent>
        <SidebarFooter className="side-footer">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="nav-item"
                onClick={() => go("Instellingen")}
                isActive={page === "Instellingen"}
              >
                <Settings size={19} />
                <span>Instellingen</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {data?.admin && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="nav-item"
                  onClick={() => go("Beheer")}
                >
                  <ShieldCheck size={19} />
                  <span>Beheer</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
          <div className="profile">
            <Avatar name={user.name || "B"} />
            <div>
              <b>{user.name || "Nieuwe gebruiker"}</b>
              <small>{client ? "Klant" : "Developer"}</small>
            </div>
            {identity && <LogoutButton />}
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="workspace-main">
        <header className={`topbar ${demo ? "example-topbar" : ""}`}>
          <div className="crumb">
            <SidebarTrigger className="mobile-toggle" />
            <span>Werkplek</span>
            <ChevronRight size={14} />
            <b>{page}</b>
          </div>
          <div className="top-actions">
            {demo && (
              <button className="outline profile-create" onClick={initRegister}>
                {loading ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Plus size={14} />
                )}
                {identity ? "Profiel aanmaken" : "Registreren / inloggen"}
              </button>
            )}
            <button
              className="icon-button notification-button"
              aria-label="Meldingen"
              onClick={() => {
                setNotifyOpen(!notifyOpen);
                if (!demo)
                  run(async () => {
                    await mutate({ op: "readNotifications" });
                    await load();
                  });
              }}
            >
              <Bell size={19} />
              {notifications.some((n) => !n.read) && <i />}
            </button>
            <Avatar name={user.name || "JP"} small />
          </div>
          {notifyOpen && (
            <div className="notification-popover">
              <h3>Meldingen</h3>
              {notifications.length ? (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setNotifyOpen(false);
                      const p = projects.find((p) => p.id === n.project);
                      if (p) openProject(p);
                    }}
                  >
                    <MessageSquare size={17} />
                    <span>
                      {n.body}
                      <small>{date(n.created)}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p>Je bent helemaal bij.</p>
              )}
            </div>
          )}
        </header>
        {error && (
          <div className="error-banner">
            {error} <button onClick={load}>Opnieuw proberen</button>
          </div>
        )}
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {demo
                  ? "VOORBEELDOMGEVING"
                  : page === "Overzicht"
                    ? `JOUW WERKPLEK · ${new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}`
                    : "DEVELOPMENT WORKSPACE"}
              </div>
              <h1>{headerTitle[page]}</h1>
              <p>
                {page === "Overzicht"
                  ? `Welkom${demo ? " terug" : ""}, ${user.name?.split(" ")[0] || "developer"}. ${review.length ? "Er staat werk klaar voor je review." : "Hier begint je volgende mooie project."}`
                  : page === "Templates"
                    ? "Herbruikbare standaarden voor elk type project. Pas ze aan naar jouw manier van werken."
                    : page === "Marktplaats"
                      ? "Bekijk open projecten en doe een voorstel dat bij jouw expertise past."
                      : page === "Klantportaal"
                        ? "Deel voortgang, bestanden en gesprekken in je eigen huisstijl."
                        : page === "Betalingen"
                          ? "Transparante bedragen, platformvergoeding en betaalstatus."
                          : "Alle details en acties binnen handbereik."}
              </p>
            </div>
            {!client && (
              <button className="primary" onClick={() => startCreate()}>
                <Plus size={18} /> Nieuw project
              </button>
            )}
          </div>
          {(page === "Overzicht" || page === "Mijn projecten") && (
            <>
              <section className="stats">
                {[
                  {
                    label: "Actieve projecten",
                    value: active.length,
                    icon: Layers,
                    caption: "Van briefing tot oplevering",
                    tone: "blue",
                  },
                  {
                    label: client ? "Afgeronde projecten" : "Projectwaarde",
                    value: client
                      ? projects.filter((p) => p.status === "completed").length
                      : money(total),
                    icon: client ? CircleCheck : Wallet,
                    caption: client
                      ? "Geaccepteerde opleveringen"
                      : "Waarde van actieve opdrachten",
                    tone: "purple",
                  },
                  {
                    label: "Klaar voor review",
                    value: review.length,
                    icon: CheckCheck,
                    caption: "Even jouw aandacht nodig",
                    tone: "orange",
                  },
                  {
                    label: "Opgeleverd",
                    value: projects.filter((p) => p.status === "completed")
                      .length,
                    icon: CircleCheck,
                    caption: "Mooi werk, afgerond",
                    tone: "green",
                  },
                ].map((s) => (
                  <div className="stat-card" key={s.label}>
                    <div>
                      <span>{s.label}</span>
                      <span className={`stat-icon ${s.tone}`}>
                        <s.icon size={19} />
                      </span>
                    </div>
                    <strong>{s.value}</strong>
                    <small>{s.caption}</small>
                  </div>
                ))}
              </section>
              {page === "Overzicht" && (
                <div className="overview-grid">
                  <div className="main-column">
                    <section className="pipeline-card">
                      <div className="section-heading">
                        <div>
                          <h2>Projectpipeline</h2>
                          <p>Elke opdracht een stap dichter bij oplevering.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => go("Mijn projecten")}
                        >
                          Alle projecten <ChevronRight size={16} />
                        </button>
                      </div>
                      <div className="pipeline">
                        {["open", "progress", "review", "completed"].map(
                          (s, i) => (
                            <button
                              key={s}
                              onClick={() => {
                                go("Mijn projecten");
                                setFilter(s);
                              }}
                              className={`pipeline-stage ${s}`}
                            >
                              <span className="stage-label">
                                <span className="stage-dot" />
                                {s === "open"
                                  ? "Open"
                                  : s === "progress"
                                    ? "In uitvoering"
                                    : s === "review"
                                      ? "Review"
                                      : "Opgeleverd"}
                              </span>
                              <b>
                                {projects
                                  .filter((p) => p.status === s)
                                  .length.toString()
                                  .padStart(2, "0")}
                              </b>
                              <div className="stage-bar">
                                <span
                                  style={{
                                    width: `${Math.max(8, (projects.filter((p) => p.status === s).length / Math.max(projects.length, 1)) * 100)}%`,
                                  }}
                                />
                              </div>
                              {i < 3 && (
                                <ChevronRight
                                  className="stage-chevron"
                                  size={16}
                                />
                              )}
                            </button>
                          ),
                        )}
                      </div>
                    </section>
                    <ProjectList
                      title={demo ? "Voorbeeldprojecten" : "Lopende projecten"}
                      items={projects
                        .filter((p) => p.status !== "completed")
                        .slice(0, 4)}
                      open={openProject}
                      all={() => go("Mijn projecten")}
                      client={client}
                    />
                    <div className="template-strip">
                      <div className="template-strip-icon">
                        <FileStack size={25} />
                      </div>
                      <div>
                        <h3>Begin met een voorsprong</h3>
                        <p>Een complete projectbriefing in een paar klikken.</p>
                      </div>
                      <button
                        className="outline"
                        onClick={() => go("Templates")}
                      >
                        Bekijk templates
                      </button>
                    </div>
                  </div>
                  <aside className="right-column">
                    <section className="review-card">
                      <div className="review-head">
                        <span>
                          <CheckCheck size={20} />
                        </span>
                        <span className="pill">
                          {review.length} PROJECT
                          {review.length !== 1 ? "EN" : ""}
                        </span>
                      </div>
                      <h2>Klaar voor jouw blik</h2>
                      <p>
                        {review.length
                          ? "De laatste puntjes op de i. Bekijk het werk en geef je feedback."
                          : "Zodra er werk klaarstaat voor review, zie je het hier."}
                      </p>
                      {review[0] && (
                        <>
                          <div className="review-project">
                            <Avatar name="Van Dijk" small />
                            <div>
                              <b>{review[0].title}</b>
                              <small>{review[0].progress}% afgerond</small>
                            </div>
                          </div>
                          <button
                            className="primary"
                            onClick={() => openProject(review[0])}
                          >
                            Project bekijken
                          </button>
                        </>
                      )}
                    </section>
                    <section className="activity-card">
                      <div className="section-heading">
                        <h2>Laatste activiteit</h2>
                        <button
                          className="icon-button"
                          aria-label="Laatste activiteit uitbreiden"
                          title="Activiteit uitbreiden"
                          onClick={() => setModal("activity")}
                        >
                          <Maximize2 size={17} />
                        </button>
                      </div>
                      <div className="activity-list">
                        {notifications.slice(0, 4).map((n, i) => (
                          <div className="activity" key={n.id}>
                            <span
                              className={`activity-icon ${["blue", "purple", "green"][i % 3]}`}
                            >
                              {i === 1 ? (
                                <Wallet size={15} />
                              ) : i === 2 ? (
                                <Upload size={15} />
                              ) : (
                                <Check size={15} />
                              )}
                            </span>
                            <div>
                              <p>{n.body}</p>
                              <small>{date(n.created)}</small>
                            </div>
                          </div>
                        ))}
                        {!notifications.length && (
                          <p className="muted">
                            Updates van je projecten verschijnen hier.
                          </p>
                        )}
                      </div>
                      <button
                        className="activity-expand"
                        onClick={() => setModal("activity")}
                      >
                        Bekijk activiteiten <ArrowUpRight size={15} />
                      </button>
                    </section>
                    <div className="security-note">
                      <LockKeyhole size={17} />
                      <p>
                        Hostinggegevens worden pas gedeeld met de gekozen
                        uitvoerder.
                      </p>
                    </div>
                  </aside>
                </div>
              )}
              {page === "Mijn projecten" && (
                <>
                  <Toolbar
                    query={query}
                    setQuery={setQuery}
                    filter={filter}
                    setFilter={setFilter}
                    view={view}
                    setView={setView}
                  />
                  {view === "list" ? (
                    <ProjectList
                      title="Projecten"
                      items={filtered}
                      open={openProject}
                      client={client}
                    />
                  ) : (
                    <Kanban items={filtered} open={openProject} />
                  )}
                </>
              )}
            </>
          )}
          {page === "Marktplaats" && (
            <>
              <div className="market-info">
                <Store size={21} />
                <div>
                  <b>Opdrachten van developers, voor developers.</b>
                  <span>
                    Bied op een project. Na acceptatie krijg je toegang tot de
                    volledige briefing en projectbestanden.
                  </span>
                </div>
              </div>
              <Toolbar
                query={query}
                setQuery={setQuery}
                filter={filter}
                setFilter={setFilter}
                view={view}
                setView={setView}
                market
              />
              <div className="market-grid">
                {filtered.map((p) => (
                  <article className="market-card" key={p.id}>
                    <div className="between">
                      <Mark category={p.category} />
                      <span className="tag">{p.category}</span>
                    </div>
                    <h2>{p.title}</h2>
                    <p>{p.description}</p>
                    <div className="market-meta">
                      <span>
                        <Calendar size={15} /> {date(p.deadline)}
                      </span>
                      <span>
                        <Globe size={15} />
                        {p.hosting}
                      </span>
                    </div>
                    <div className="market-bottom">
                      <div>
                        <small>Indicatief budget</small>
                        <b>{money(p.budget)}</b>
                      </div>
                      <button
                        className="outline"
                        onClick={() => openProject(p)}
                      >
                        Bekijk opdracht
                      </button>
                    </div>
                  </article>
                ))}
                {!filtered.length && (
                  <Empty text="Er zijn nog geen open opdrachten. Nieuwe projecten verschijnen hier zodra een developer ze plaatst." />
                )}
              </div>
            </>
          )}
          {page === "Templates" && (
            <>
              <div className="template-grid">
                {templates.map((t, i) => (
                  <article className="template-card" key={t.id}>
                    <div className={`template-visual t${i % 4}`}>
                      <div className="template-mini">
                        <div>
                          <span />
                          <span />
                        </div>
                        <strong>{t.category}</strong>
                        <i />
                        <i />
                        <i />
                        <span className="mini-checkbox">
                          <Check size={13} /> Projectstandaarden
                        </span>
                      </div>
                      <span className="template-visual-icon">
                        <FileStack size={31} />
                      </span>
                    </div>
                    <div className="template-card-body">
                      <span className="tag">
                        {defaultTemplates.some((x) => x.id === t.id)
                          ? "STANDAARD TEMPLATE"
                          : "MIJN TEMPLATE"}
                      </span>
                      <h2>{t.name}</h2>
                      <p>{t.description}</p>
                      <div className="template-meta">
                        <span>
                          <CheckCheck size={15} />
                          {t.checklist.length} controlepunten
                        </span>
                        <button
                          className="icon-button"
                          aria-label={`${t.name} aanpassen`}
                          onClick={() => {
                            setEditTemplate({
                              ...t,
                              name: defaultTemplates.some((x) => x.id === t.id)
                                ? t.name + " · eigen versie"
                                : t.name,
                            });
                            setModal("template");
                          }}
                        >
                          <Settings size={16} />
                        </button>
                      </div>
                      <button
                        className="outline"
                        onClick={() => startCreate(t.id)}
                      >
                        Gebruik template <Plus size={16} />
                      </button>
                    </div>
                  </article>
                ))}
                <button
                  className="add-template"
                  onClick={() => {
                    setEditTemplate({
                      name: "Mijn template",
                      description: "Mijn eigen projectstandaarden.",
                      category: "Website",
                      checklist: defaultTemplates[0].checklist,
                    });
                    setModal("template");
                  }}
                >
                  <span>
                    <Plus size={27} />
                  </span>
                  <h2>Jouw eigen basis</h2>
                  <p>Maak een template die precies past bij hoe jij werkt.</p>
                  <b>Template toevoegen</b>
                </button>
              </div>
              <section className="standards-card">
                <div className="section-heading">
                  <div>
                    <h2>Een stevig fundament voor elk project</h2>
                    <p>Deze standaarden zitten in elk bouwpakket.</p>
                  </div>
                  <ShieldCheck size={22} />
                </div>
                <div className="standards-grid">
                  {standards.map((s, i) => (
                    <div key={s.group}>
                      <span>0{i + 1}</span>
                      <h3>{s.group}</h3>
                      <p>{s.items.join(" · ")}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          {page === "Berichten" && (
            <div className="messages-overview">
              <div className="section-heading">
                <h2>Projectgesprekken</h2>
                <MessageSquare size={20} />
              </div>
              {projects.map((p) => (
                <button
                  className="conversation"
                  key={p.id}
                  onClick={() => openProject(p)}
                >
                  <Mark category={p.category} />
                  <div>
                    <b>{p.title}</b>
                    <small>
                      {p.client || "Projectgesprek"} · {statuses[p.status]}
                    </small>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ))}
              {!projects.length && (
                <Empty text="Gesprekken horen bij een project. Maak je eerste project aan om samen te werken." />
              )}
              <p className="conversation-note">
                <LockKeyhole size={16} /> Developerchat en klantgesprekken zijn
                apart afgeschermd.
              </p>
            </div>
          )}
          {page === "Klantportaal" && (
            <div className="portal-layout">
              <section className="portal-settings">
                <div className="section-heading">
                  <div>
                    <h2>
                      {client ? "Jouw projecten" : "Jouw white-label portaal"}
                    </h2>
                    <p>
                      {client
                        ? "Beveiligd gedeeld door jouw developer."
                        : "Geef je klanten een werkplek in jouw huisstijl."}
                    </p>
                  </div>
                  <Palette size={23} />
                </div>
                {!client && (
                  <>
                    <Field label="Naam van je portaal">
                      <input
                        value={brand.name}
                        onChange={(e) =>
                          setBrand({ ...brand, name: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Accentkleur">
                      <div className="color-picker">
                        <input
                          type="color"
                          value={brand.color}
                          onChange={(e) =>
                            setBrand({ ...brand, color: e.target.value })
                          }
                        />
                        <code>{brand.color}</code>
                      </div>
                    </Field>
                    <Field label="Logo" hint="PNG, JPG of WebP · maximaal 1 MB">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 1000000) {
                            toast.error("Kies een logo van maximaal 1 MB.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () =>
                            setBrand({
                              ...brand,
                              logo: reader.result as string,
                            });
                          reader.readAsDataURL(f);
                        }}
                      />
                    </Field>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await mutate({ op: "saveBrand", ...brand });
                          await load();
                          toast.success("Huisstijl opgeslagen");
                        })
                      }
                    >
                      Huisstijl opslaan
                    </button>
                    <div className="info-note">
                      <LockKeyhole size={18} />
                      <p>
                        Je deelt toegang per project met het e-mailadres van je
                        klant. Een link geeft op zichzelf geen toegang.
                      </p>
                    </div>
                  </>
                )}
                <h3 className="project-select-title">
                  {client ? "Beschikbare projecten" : "Klanttoegang beheren"}
                </h3>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="portal-project-button"
                    onClick={() => openProject(p)}
                  >
                    <span>{p.title}</span>
                    <ChevronRight size={16} />
                  </button>
                ))}
                {!projects.length && (
                  <p className="muted">Nog geen gedeelde projecten.</p>
                )}
              </section>
              <section
                className="portal-preview"
                style={{ "--brand-color": brand.color } as React.CSSProperties}
              >
                <div className="browser-bar">
                  <i />
                  <i />
                  <i />
                  <span>
                    <LockKeyhole size={11} /> klantportaal
                  </span>
                </div>
                <div className="portal-preview-body">
                  <div className="portal-brand">
                    {brand.logo ? (
                      <img src={brand.logo} alt={brand.name} />
                    ) : (
                      <span className="portal-letter">
                        {brand.name?.[0] || "J"}
                      </span>
                    )}
                    <b>{brand.name}</b>
                    <span className="tag">KLANTPORTAAL</span>
                  </div>
                  <h2>Goed om je te zien.</h2>
                  <p>Volg hier de voortgang van jouw project.</p>
                  <div className="preview-project">
                    <div className="between">
                      <b>{projects[0]?.title || "Jouw nieuwe website"}</b>
                      <span className="status progress">In uitvoering</span>
                    </div>
                    <h3>
                      {projects[0]?.progress || 0}
                      <small>%</small>
                    </h3>
                    <Progress value={projects[0]?.progress || 0} />
                    <div className="preview-stages">
                      {["Briefing", "Design", "Bouw", "Oplevering"].map(
                        (s, i) => (
                          <span key={s} className={i < 2 ? "done" : ""}>
                            <CircleCheck size={16} />
                            {s}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="preview-actions">
                    <div>
                      <MessageSquare size={21} />
                      <b>Een korte lijn</b>
                      <p>Vraag iets aan je developer.</p>
                    </div>
                    <div>
                      <Folder size={21} />
                      <b>Alles bij elkaar</b>
                      <p>Jouw gedeelde bestanden.</p>
                    </div>
                  </div>
                  <span className="preview-label">
                    {client ? "Voorbeeldweergave" : "Live huisstijlvoorbeeld"}
                  </span>
                </div>
              </section>
            </div>
          )}
          {page === "Betalingen" && (
            <>
              <div className="payment-banner">
                <span className="mollie-logo">mollie</span>
                <div>
                  <h2>Betalen via Mollie Connect</h2>
                  <p>
                    15% platformvergoeding. 85% voor de uitvoerder, vóór de
                    kosten van Mollie.
                  </p>
                </div>
                <span className="connection-state">
                  {data?.capabilities?.mollieConnected
                    ? "Account gekoppeld"
                    : "Nog niet gekoppeld"}
                </span>
              </div>
              <div className="payment-grid">
                <section className="panel">
                  <h2>Transparante verdeling</h2>
                  <p className="muted">
                    Voorbeeld bij een project van € 1.000.
                  </p>
                  <div className="payment-split">
                    <span className="executor-split" />
                    <span className="platform-split" />
                  </div>
                  <div className="split-label">
                    <span>
                      <i /> Uitvoerder <b>€ 850</b>
                    </span>
                    <span>
                      <i /> Bouwr <b>€ 150</b>
                    </span>
                  </div>
                  <p className="info-copy">
                    De vergoeding wordt berekend over het transactiebedrag. Btw,
                    terugbetalingen en de verwerking van Mollie-kosten moeten
                    voor de livegang nog worden vastgelegd.
                  </p>
                </section>
                <section className="panel">
                  <h2>Eigen klanten, eigen afhandeling</h2>
                  <p>
                    Bij projecten die de beheerder zelf met zijn klanten
                    afhandelt, wordt geen platformbetaling gestart.
                  </p>
                  <div className="info-note">
                    <ShieldCheck size={20} />
                    <p>
                      De betaalwijze wordt bij het aanmaken vastgelegd. Alleen
                      de beheerder kan eigen facturatie kiezen.
                    </p>
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <h2>Projectbetalingen</h2>
                  <Wallet size={20} />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Bedrag</TableHead>
                      <TableHead>Platform 15%</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects
                      .filter((p) => p.executor)
                      .map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.title}</TableCell>
                          <TableCell>{money(p.budget)}</TableCell>
                          <TableCell>
                            {money(Math.round(p.budget * 0.15))}
                          </TableCell>
                          <TableCell>
                            <span className="tag">
                              {data?.payments?.find(
                                (pay: Data) => pay.project === p.id,
                              )?.status === "paid"
                                ? "Betaald"
                                : data?.payments?.find(
                                    (pay: Data) => pay.project === p.id,
                                  )?.status || "Niet betaald"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <button
                              className="outline"
                              onClick={() => openProject(p)}
                            >
                              Bekijken
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {!projects.some((p) => p.executor) && (
                  <Empty text="Na het accepteren van een bod verschijnt de projectbetaling hier." />
                )}
              </section>
            </>
          )}
          {page === "Instellingen" && (
            <div className="settings-grid">
              <section className="panel">
                <h2>Je profiel</h2>
                <div className="settings-profile">
                  <Avatar name={user.name || "B"} />
                  <div>
                    <b>{user.name}</b>
                    <p>{user.company}</p>
                    <small>{identity?.email || "Voorbeeldprofiel"}</small>
                  </div>
                </div>
                {demo ? (
                  <button className="primary" onClick={initRegister}>
                    Mijn profiel aanmaken
                  </button>
                ) : (
                  <div className="info-note">
                    <ShieldCheck size={18} />
                    <p>
                      Je account is gekoppeld aan je beveiligde
                      geverifieerde account.
                    </p>
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>Een vliegende start</h2>
                <p>Loop nog eens door de belangrijkste onderdelen van Bouwr.</p>
                <button className="outline" onClick={() => setTour(0)}>
                  <Play size={16} /> Rondleiding starten
                </button>
              </section>
              <section className="panel">
                <h2>Integraties</h2>
                <div className="integration-row">
                  <span className="mollie-logo">mollie</span>
                  <span className="tag">Configuratie nodig</span>
                </div>
                <p>
                  Accountkoppeling en live betalingen worden geactiveerd zodra
                  Mollie Connect is ingericht.
                </p>
                <button
                  className="outline"
                  onClick={() => {
                    if (!data?.capabilities?.mollie) {
                      toast.error("Mollie Connect is nog niet geconfigureerd.");
                      return;
                    }
                    window.location.assign("/api/mollie/connect");
                  }}
                >
                  Mollie-account koppelen
                </button>
                <div className="integration-row">
                  <LockKeyhole size={20} />
                  <b>Hostingkluis</b>
                  <span className="tag">
                    {data?.capabilities?.vault
                      ? "Beschikbaar"
                      : "Configuratie nodig"}
                  </span>
                </div>
              </section>
              <section className="panel">
                <h2>Projectgegevens</h2>
                <p>
                  Projecten, gesprekken en bestanden worden centraal opgeslagen.
                  Klanten krijgen alleen toegang tot hun eigen gedeelde
                  projecten.
                </p>
                <button className="outline" onClick={() => go("Templates")}>
                  Projectstandaarden bekijken
                </button>
              </section>
            </div>
          )}
          {page === "Beheer" && data?.admin && (
            <>
              <section className="panel">
                <h2>Gebruikers</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Naam</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Bedrijf</TableHead>
                      <TableHead>Rol</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.admin.users.map((u: Data) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.company}</TableCell>
                        <TableCell>{u.role}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
              <ProjectList
                title="Alle platformprojecten"
                items={data.admin.projects}
                open={openProject}
              />
            </>
          )}
          <footer className="content-footer">
            <span>
              bouwr<span className="blue-dot">.</span>{" "}
              <small>Een werkplek voor mooi werk.</small>
            </span>
            <button onClick={() => setModal("help")}>
              <HelpCircle size={14} /> Hulp & rondleiding
            </button>
          </footer>
        </main>
      </SidebarInset>
      <HelpCenter
        open={modal === "help"}
        onOpenChange={(open) => !open && setModal("")}
        onStartTour={() => {
          setModal("");
          setTour(0);
        }}
      />
      <Dialog
        open={modal === "activity"}
        onOpenChange={(open) => !open && setModal("")}
      >
        <DialogContent className="app-dialog activity-dialog">
          <DialogHeader>
            <DialogTitle>Activiteit in je werkplek</DialogTitle>
            <DialogDescription>
              {demo
                ? "Voorbeeld van projectupdates. Na registratie verschijnen hier jouw eigen updates."
                : "De 50 meest recente updates van jouw projecten. Open een update om naar het project te gaan."}
            </DialogDescription>
          </DialogHeader>
          <div className="activity-history">
            {notifications.map((notification) => {
              const project = projects.find(
                (p) => p.id === notification.project,
              );
              const content = (
                <>
                  <span
                    className={`activity-icon ${notification.read ? "green" : "blue"}`}
                  >
                    <Bell size={16} />
                  </span>
                  <span className="activity-history-copy">
                    <span>{notification.body}</span>
                    {project && <small>{project.title}</small>}
                    <time dateTime={notification.created}>
                      {new Date(notification.created).toLocaleString("nl-NL", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </span>
                  {project && <ChevronRight size={17} aria-hidden="true" />}
                </>
              );
              return project ? (
                <button
                  className="activity-history-entry"
                  key={notification.id}
                  onClick={() => openProject(project)}
                >
                  {content}
                </button>
              ) : (
                <div className="activity-history-entry" key={notification.id}>
                  {content}
                </div>
              );
            })}
            {!notifications.length && (
              <div className="activity-empty">
                <Bell size={24} />
                <h3>Je bent helemaal bij.</h3>
                <p>
                  Nieuwe biedingen, bestanden en projectupdates verschijnen
                  hier.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "register"}
        onOpenChange={(o) => !o && setModal("")}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>Jouw werkplek begint hier.</DialogTitle>
            <DialogDescription>
              {identity
                ? "Maak je profiel aan en start met jouw eerste project."
                : "Log veilig in om je persoonlijke profiel aan te maken."}
            </DialogDescription>
          </DialogHeader>
          {!identity ? (
            <>
              <div className="auth-visual">
                <ShieldCheck size={40} />
                <h3>Eén veilige identiteit</h3>
                <p>
                  Je registreert met je e-mailadres en een wachtwoord. Je
                  projecten blijven afgeschermd.
                </p>
              </div>
              <a
                className="primary auth-link"
                href="/inloggen"
                target="_top"
              >
                Registreren / inloggen
              </a>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const r = await fetch("/api/workspace", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ op: "register", ...form }),
                  });
                  const d = (await r.json()) as Data;
                  if (!r.ok) throw Error(d.error);
                  await load();
                  setModal("");
                  toast.success("Welkom bij Bouwr. Je werkplek is klaar.");
                });
              }}
            >
              <Field label="Je naam">
                <input
                  required
                  maxLength={100}
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Bedrijf / organisatie">
                <input
                  required
                  maxLength={120}
                  value={form.company || ""}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </Field>
              <Field label="Ik gebruik Bouwr als">
                <Pick
                  value={form.role || "developer"}
                  onChange={(v) => setForm({ ...form, role: v })}
                  values={["developer", "client"]}
                />
              </Field>
              <p className="muted">
                Developer: projecten aanbieden en aannemen. Client: jouw
                gedeelde projecten bekijken.
              </p>
              <button className="primary" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Plus size={16} />
                )}{" "}
                Profiel aanmaken
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "create"}
        onOpenChange={(o) => !o && setModal("")}
      >
        <DialogContent className="app-dialog create-dialog">
          <DialogHeader>
            <div className="eyebrow">NIEUW PROJECT</div>
            <DialogTitle>Van idee naar een heldere opdracht.</DialogTitle>
            <DialogDescription>
              Kies een basis, leg de scope vast en vind jouw developer.
            </DialogDescription>
          </DialogHeader>
          <div className="wizard-steps">
            {["Bouwpakket", "Projectbriefing", "Samenwerking"].map((s, i) => (
              <span
                className={
                  projectStep === i
                    ? "current"
                    : projectStep > i
                      ? "finished"
                      : ""
                }
                key={s}
              >
                <b>{projectStep > i ? <Check size={13} /> : i + 1}</b>
                {s}
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (projectStep < 2) {
                setProjectStep(projectStep + 1);
                return;
              }
              run(async () => {
                const t =
                  templates.find((t) => t.id === templateId) || templates[0];
                const d = await mutate({
                  op: "create",
                  ...form,
                  category: t.category,
                  budget: Math.round(Number(form.budget) * 100),
                  checklist: t.checklist.map((c: Data) => ({
                    ...c,
                    done: false,
                  })),
                });
                await load();
                setModal("");
                toast.success("Project geplaatst. Developers kunnen bieden.");
                const r = await fetch("/api/workspace?project=" + d.id);
                const p = (await r.json()) as Data;
                if (r.ok) openProject(p.project);
              });
            }}
          >
            {projectStep === 0 && (
              <div className="template-picker">
                {templates.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={templateId === t.id ? "chosen" : ""}
                    onClick={() => setTemplateId(t.id)}
                  >
                    <Mark category={t.category} />
                    <span>
                      <b>{t.name}</b>
                      <small>{t.checklist.length} projectstandaarden</small>
                    </span>
                    {templateId === t.id && <CircleCheck size={18} />}
                  </button>
                ))}
              </div>
            )}
            {projectStep === 1 && (
              <>
                <Field label="Projectnaam">
                  <input
                    required
                    maxLength={180}
                    placeholder="Bijvoorbeeld: Nieuwe website voor Studio Noord"
                    value={form.title || ""}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                  />
                </Field>
                <Field label="Klant / organisatie">
                  <input
                    required
                    maxLength={180}
                    placeholder="Alleen zichtbaar voor betrokkenen"
                    value={form.client || ""}
                    onChange={(e) =>
                      setForm({ ...form, client: e.target.value })
                    }
                  />
                </Field>
                <Field label="Omschrijving & scope">
                  <textarea
                    required
                    rows={4}
                    maxLength={5000}
                    placeholder="Wat moet er worden gebouwd? Denk aan pagina’s, functies en koppelingen."
                    value={form.description || ""}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Indicatief budget (€)">
                    <input
                      required
                      type="number"
                      min="1"
                      max="1000000"
                      step="0.01"
                      value={form.budget || ""}
                      onChange={(e) =>
                        setForm({ ...form, budget: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Gewenste opleverdatum">
                    <input
                      required
                      type="date"
                      value={form.deadline || ""}
                      onChange={(e) =>
                        setForm({ ...form, deadline: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </>
            )}
            {projectStep === 2 && (
              <>
                <Field label="Wie beheert de hosting?">
                  <Pick
                    value={form.hosting || "Eigen hosting"}
                    onChange={(v) => setForm({ ...form, hosting: v })}
                    values={["Eigen hosting", "Hosting uitvoerder"]}
                  />
                </Field>
                <div className="info-note">
                  <LockKeyhole size={20} />
                  <p>
                    Bij eigen hosting vul je na het plaatsen de hostingkluis in.
                    Alleen jij en de geaccepteerde uitvoerder krijgen toegang.
                  </p>
                </div>
                <div className="switch-row">
                  <div>
                    <b>Uitvoerder mag de klant spreken</b>
                    <p>Geef de uitvoerder toegang tot het klantgesprek.</p>
                  </div>
                  <Switch
                    checked={!!form.contact}
                    onCheckedChange={(v) => setForm({ ...form, contact: v })}
                  />
                </div>
                {data?.admin && (
                  <div className="switch-row">
                    <div>
                      <b>Eigen klantfacturatie</b>
                      <p>Jij regelt deze opdracht zelf met je klant.</p>
                    </div>
                    <Switch
                      checked={form.paymentMode === "direct"}
                      onCheckedChange={(v) =>
                        setForm({
                          ...form,
                          paymentMode: v ? "direct" : "platform",
                        })
                      }
                    />
                  </div>
                )}
                <div className="project-summary">
                  <span className="tag">
                    {templates.find((t) => t.id === templateId)?.name}
                  </span>
                  <h3>{form.title}</h3>
                  <p>
                    {form.client} ·{" "}
                    {money(Math.round(Number(form.budget || 0) * 100))} ·{" "}
                    {date(form.deadline)}
                  </p>
                  <small>
                    {form.paymentMode === "direct"
                      ? "Eigen facturatie"
                      : "Via Mollie · 15% platformvergoeding"}
                  </small>
                </div>
              </>
            )}
            <div className="dialog-actions">
              {projectStep > 0 ? (
                <button
                  className="outline"
                  type="button"
                  onClick={() => setProjectStep(projectStep - 1)}
                >
                  Vorige
                </button>
              ) : (
                <span />
              )}
              <button className="primary" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : projectStep === 2 ? (
                  <Plus size={16} />
                ) : null}
                {projectStep === 2 ? "Project plaatsen" : "Volgende"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "template"}
        onOpenChange={(o) => !o && setModal("")}
      >
        <DialogContent className="app-dialog template-dialog">
          <DialogHeader>
            <DialogTitle>Maak het jouw bouwpakket.</DialogTitle>
            <DialogDescription>
              Standaardtemplates worden opgeslagen als jouw eigen versie.
            </DialogDescription>
          </DialogHeader>
          {editTemplate && (
            <>
              <div className="form-grid">
                <Field label="Templatenaam">
                  <input
                    value={editTemplate.name}
                    onChange={(e) =>
                      setEditTemplate({ ...editTemplate, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Categorie">
                  <Pick
                    value={editTemplate.category}
                    onChange={(v) =>
                      setEditTemplate({ ...editTemplate, category: v })
                    }
                    values={["Website", "WordPress", "Shopify", "Webapp"]}
                  />
                </Field>
              </div>
              <Field label="Omschrijving">
                <textarea
                  rows={2}
                  value={editTemplate.description}
                  onChange={(e) =>
                    setEditTemplate({
                      ...editTemplate,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
              <div className="template-edit-list">
                {editTemplate.checklist.map((c: Data, i: number) => (
                  <div key={i}>
                    <input
                      aria-label="Controlepunt"
                      value={c.title}
                      onChange={(e) =>
                        setEditTemplate({
                          ...editTemplate,
                          checklist: editTemplate.checklist.map(
                            (x: Data, j: number) =>
                              j === i ? { ...x, title: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label="Controlepunt verwijderen"
                      onClick={() =>
                        setEditTemplate({
                          ...editTemplate,
                          checklist: editTemplate.checklist.filter(
                            (_: Data, j: number) => j !== i,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="dialog-actions">
                <button
                  className="outline"
                  onClick={() =>
                    setEditTemplate({
                      ...editTemplate,
                      checklist: [
                        ...editTemplate.checklist,
                        {
                          title: "Nieuw controlepunt",
                          done: false,
                          group: "Eigen standaarden",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={16} /> Controlepunt
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={saveTemplate}
                >
                  Template opslaan
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "project"}
        onOpenChange={(o) => !o && setModal("")}
      >
        <DialogContent className="app-dialog project-dialog">
          <DialogHeader>
            <div className="project-dialog-heading">
              <Mark category={selected?.category || "Website"} />
              <div>
                <DialogTitle>{selected?.title}</DialogTitle>
                <DialogDescription>
                  {selected?.client || selected?.category || "Project"} ·{" "}
                  {date(selected?.deadline)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {!detail ? (
            <div className="loading-detail">
              <Loader2 className="spin" />
              Project laden…
            </div>
          ) : (
            <>
              <div className="project-detail-summary">
                <Badge status={detail.project.status} />
                <span>
                  {detail.project.budget !== undefined
                    ? money(detail.project.budget)
                    : "Jouw project"}
                </span>
                <span>
                  <Globe size={15} />
                  {detail.project.hosting}
                </span>
              </div>
              <Tabs defaultValue="overview" key={selected?.id}>
                <TabsList className="detail-tabs">
                  <TabsTrigger value="overview">Overzicht</TabsTrigger>
                  {(detail.owner || detail.executor || detail.member) && (
                    <TabsTrigger value="progress">Voortgang</TabsTrigger>
                  )}
                  {!detail.member && (
                    <TabsTrigger value="bids">
                      Biedingen{" "}
                      {detail.bids.length > 0 && (
                        <span>{detail.bids.length}</span>
                      )}
                    </TabsTrigger>
                  )}
                  {(detail.owner || detail.executor || detail.member) && (
                    <TabsTrigger value="files">Bestanden</TabsTrigger>
                  )}
                  {(detail.owner || detail.executor || detail.member) && (
                    <TabsTrigger value="chat">Gesprekken</TabsTrigger>
                  )}
                  {detail.owner && (
                    <TabsTrigger value="access">Toegang</TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="overview">
                  <div className="detail-body">
                    <h3>De opdracht</h3>
                    <p className="briefing-copy">
                      {detail.project.description}
                    </p>
                    <div className="progress-overview">
                      <div className="between">
                        <b>Projectvoortgang</b>
                        <span>{detail.project.progress || 0}%</span>
                      </div>
                      <Progress value={detail.project.progress || 0} />
                    </div>
                    {(detail.owner || detail.executor) && (
                      <div className="vault-card">
                        <div>
                          <LockKeyhole size={22} />
                          <h3>Hostingkluis</h3>
                        </div>
                        <p>
                          {detail.owner
                            ? "Voeg de hostinggegevens toe. De gekozen uitvoerder krijgt automatisch toegang."
                            : detail.hasSecret
                              ? "De opdrachtgever heeft gegevens gedeeld voor dit project."
                              : "De opdrachtgever heeft nog geen hostinggegevens toegevoegd."}
                        </p>
                        {vault === null ? (
                          <button
                            className="outline"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                const d = await mutate({
                                  op: "vault",
                                  project: selected?.id,
                                });
                                setVault(d.value);
                              })
                            }
                          >
                            {detail.owner
                              ? "Hostinggegevens beheren"
                              : "Hostinggegevens bekijken"}
                          </button>
                        ) : (
                          <>
                            <textarea
                              aria-label="Hostinggegevens"
                              rows={5}
                              value={vault}
                              readOnly={!detail.owner}
                              onChange={(e) => setVault(e.target.value)}
                              placeholder="Hostingprovider, domein, beheer-URL, SFTP/SSH, repository en deploymentinstructies"
                            />
                            {detail.owner && (
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    await mutate({
                                      op: "vault",
                                      project: selected?.id,
                                      value: vault,
                                    });
                                    toast.success(
                                      "Hostinggegevens versleuteld opgeslagen",
                                    );
                                    setVault(null);
                                    await refreshProject();
                                  })
                                }
                              >
                                Veilig opslaan
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {detail.owner && detail.project.executor && (
                      <div className="payment-action">
                        <div>
                          <b>Projectbetaling</b>
                          <small>
                            {detail.project.payment_mode === "direct"
                              ? "Eigen klantfacturatie"
                              : `${money(detail.project.budget)} · platform ${money(Math.round(detail.project.budget * 0.15))}`}
                          </small>
                        </div>
                        <button
                          className="outline"
                          disabled={
                            busy || detail.project.payment_mode === "direct"
                          }
                          onClick={() =>
                            run(async () => {
                              const payment = await mutate({
                                op: "payment",
                                project: selected?.id,
                              });
                              window.location.assign(payment.checkout);
                            })
                          }
                        >
                          Betalen via Mollie
                        </button>
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="progress">
                  <div className="detail-body">
                    <div className="form-grid">
                      <Field label="Voortgang (%)">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={progress}
                          readOnly={!(detail.owner || detail.executor)}
                          onChange={(e) =>
                            setProgress(
                              Math.max(
                                0,
                                Math.min(100, Number(e.target.value)),
                              ),
                            )
                          }
                        />
                      </Field>
                      <div className="progress-readout">
                        <Progress value={progress} />
                        <b>{progress}% afgerond</b>
                      </div>
                    </div>
                    <div className="checklist">
                      {standards.map((s) => (
                        <div key={s.group}>
                          <h3>{s.group}</h3>
                          {checks.map((c, i) =>
                            c.group === s.group ? (
                              <label key={i}>
                                <Checkbox
                                  checked={c.done}
                                  disabled={!(detail.owner || detail.executor)}
                                  onCheckedChange={(v) =>
                                    setChecks(
                                      checks.map((c, j) =>
                                        i === j ? { ...c, done: !!v } : c,
                                      ),
                                    )
                                  }
                                />
                                <span className={c.done ? "checked" : ""}>
                                  {c.title}
                                </span>
                              </label>
                            ) : null,
                          )}
                        </div>
                      ))}
                      {checks
                        .filter(
                          (c) => !standards.some((s) => s.group === c.group),
                        )
                        .map((c, i) => (
                          <label key={"extra" + i}>
                            <Checkbox
                              checked={c.done}
                              disabled={!(detail.owner || detail.executor)}
                              onCheckedChange={(v) =>
                                setChecks(
                                  checks.map((x) =>
                                    x === c ? { ...x, done: !!v } : x,
                                  ),
                                )
                              }
                            />
                            <span>{c.title}</span>
                          </label>
                        ))}
                    </div>
                    {(detail.owner || detail.executor) && (
                      <div className="dialog-actions">
                        <button
                          className="outline"
                          disabled={busy || !detail.project.executor}
                          onClick={() =>
                            run(async () => {
                              await mutate({
                                op: "update",
                                project: selected?.id,
                                progress,
                                checklist: checks,
                                status: "progress",
                              });
                              await refreshProject();
                              toast.success("Voortgang bijgewerkt");
                            })
                          }
                        >
                          Voortgang opslaan
                        </button>
                        <button
                          className="primary"
                          disabled={busy || !detail.project.executor}
                          onClick={() =>
                            run(async () => {
                              await mutate({
                                op: "update",
                                project: selected?.id,
                                progress,
                                checklist: checks,
                                status: "review",
                              });
                              await refreshProject();
                              toast.success("Project klaar voor review");
                            })
                          }
                        >
                          Aanbieden voor review
                        </button>
                        {detail.owner && detail.project.status === "review" && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await mutate({
                                  op: "update",
                                  project: selected?.id,
                                  progress: 100,
                                  checklist: checks,
                                  status: "completed",
                                });
                                await refreshProject();
                                toast.success("Oplevering geaccepteerd");
                              })
                            }
                          >
                            Oplevering accepteren
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="bids">
                  <div className="detail-body">
                    {detail.bids.map((b: Data) => (
                      <div className="bid-card" key={b.id}>
                        <div className="between">
                          <div className="bid-person">
                            <Avatar name={b.name || user.name} />
                            <div>
                              <b>{b.name || "Jouw voorstel"}</b>
                              <small>
                                {b.company} · {b.days} dagen
                              </small>
                            </div>
                          </div>
                          <b className="bid-amount">{money(b.amount)}</b>
                        </div>
                        <p>{b.message}</p>
                        <div className="between">
                          <span className="tag">
                            {b.status === "accepted"
                              ? "Geaccepteerd"
                              : b.status === "declined"
                                ? "Niet gekozen"
                                : "In afwachting"}
                          </span>
                          {detail.owner && detail.project.status === "open" && (
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() => {
                                setForm({ bid: b });
                                setModal("accept");
                              }}
                            >
                              Bod accepteren
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {!detail.owner &&
                      !detail.member &&
                      detail.project.status === "open" && (
                        <form
                          className="bid-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            run(async () => {
                              await mutate({
                                op: "bid",
                                project: selected?.id,
                                amount: Math.round(Number(form.amount) * 100),
                                days: Number(form.days),
                                message: form.message,
                              });
                              await refreshProject();
                              toast.success("Je bod is verstuurd");
                            });
                          }}
                        >
                          <h3>Doe jouw voorstel</h3>
                          <div className="form-grid">
                            <Field label="Jouw bod (€)">
                              <input
                                required
                                type="number"
                                min="1"
                                step="0.01"
                                value={form.amount || ""}
                                onChange={(e) =>
                                  setForm({ ...form, amount: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="Doorlooptijd (dagen)">
                              <input
                                required
                                type="number"
                                min="1"
                                max="730"
                                value={form.days || ""}
                                onChange={(e) =>
                                  setForm({ ...form, days: e.target.value })
                                }
                              />
                            </Field>
                          </div>
                          <Field label="Jouw aanpak">
                            <textarea
                              required
                              rows={3}
                              maxLength={2000}
                              value={form.message || ""}
                              onChange={(e) =>
                                setForm({ ...form, message: e.target.value })
                              }
                              placeholder="Vertel wat je oplevert en hoe je het project aanpakt."
                            />
                          </Field>
                          <button className="primary" disabled={busy}>
                            Bod indienen
                          </button>
                        </form>
                      )}
                    {!detail.bids.length && detail.owner && (
                      <Empty text="Je project is gepubliceerd. Biedingen van andere developers verschijnen hier." />
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="files">
                  <div className="detail-body">
                    <div className="folder-grid">
                      {folders.map((f) => (
                        <button
                          className={folder === f ? "selected" : ""}
                          key={f}
                          onClick={() => setFolder(f)}
                        >
                          <Folder size={24} />
                          <span>{f}</span>
                          <small>
                            {
                              detail.files.filter((x: Data) => x.folder === f)
                                .length
                            }{" "}
                            bestanden
                          </small>
                        </button>
                      ))}
                    </div>
                    {(detail.owner || detail.executor) && (
                      <div className="upload-area">
                        <Upload size={24} />
                        <b>Bestanden toevoegen aan {folder}</b>
                        <p>
                          Logo’s, huisstijl, documentatie of je oplevering ·
                          max. 20 MB
                        </p>
                        <div className="upload-controls">
                          <label className="outline file-upload">
                            <Plus size={15} /> Bestand kiezen
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                run(async () => {
                                  if (demo)
                                    throw Error(
                                      "Registreer om je bestanden toe te voegen.",
                                    );
                                  const body = new FormData();
                                  body.append("file", file);
                                  body.append("project", selected!.id);
                                  body.append("folder", folder);
                                  body.append(
                                    "clientVisible",
                                    String(clientFile),
                                  );
                                  const r = await fetch("/api/workspace", {
                                    method: "POST",
                                    body,
                                  });
                                  const d = (await r.json()) as Data;
                                  if (!r.ok) throw Error(d.error);
                                  await refreshProject();
                                  toast.success("Bestand toegevoegd");
                                });
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <label className="inline-check">
                            <Checkbox
                              checked={clientFile}
                              onCheckedChange={(v) => setClientFile(!!v)}
                            />{" "}
                            Zichtbaar voor klant
                          </label>
                        </div>
                      </div>
                    )}
                    {detail.files
                      .filter((f: Data) => f.folder === folder)
                      .map((f: Data) => (
                        <a
                          className="file-row"
                          href={"/api/workspace?download=" + f.id}
                          key={f.id}
                        >
                          <FileText size={20} />
                          <span>
                            <b>{f.name}</b>
                            <small>
                              {(f.size / 1024).toFixed(0)} KB ·{" "}
                              {f.client_visible
                                ? "Gedeeld met klant"
                                : "Developerbestand"}
                            </small>
                          </span>
                          <ExternalLink size={16} />
                        </a>
                      ))}
                    {!detail.files.some((f: Data) => f.folder === folder) && (
                      <p className="muted empty-folder">
                        Deze map is nog leeg.
                      </p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="chat">
                  <div className="detail-body">
                    <div className="channel-picker">
                      {(detail.owner || detail.executor) && (
                        <button
                          className={channel === "internal" ? "active" : ""}
                          onClick={() => setChannel("internal")}
                        >
                          <Code2 size={16} /> Developers
                        </button>
                      )}
                      {detail.canClientChat && (
                        <button
                          className={channel === "client" ? "active" : ""}
                          onClick={() => setChannel("client")}
                        >
                          <Users size={16} /> Klantgesprek
                        </button>
                      )}
                    </div>
                    <div className="chat-messages">
                      {detail.messages
                        .filter((m: Data) => m.channel === channel)
                        .map((m: Data) => (
                          <div
                            className={`chat-message ${m.author === identity?.id ? "own" : ""}`}
                            key={m.id}
                          >
                            <Avatar name={m.name} small />
                            <div>
                              <b>
                                {m.name}
                                <small>{date(m.created)}</small>
                              </b>
                              <p>{m.body}</p>
                            </div>
                          </div>
                        ))}
                      {!detail.messages.some(
                        (m: Data) => m.channel === channel,
                      ) && (
                        <Empty
                          text={
                            channel === "internal"
                              ? "Een plek voor afspraken, vragen en feedback tussen developers."
                              : "Een directe lijn tussen de klant en zijn developer."
                          }
                        />
                      )}
                    </div>
                    <form
                      className="chat-compose"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          await mutate({
                            op: "chat",
                            project: selected?.id,
                            channel,
                            body: text,
                          });
                          setText("");
                          await refreshProject();
                        });
                      }}
                    >
                      <input
                        required
                        maxLength={3000}
                        placeholder="Schrijf een bericht…"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                      <button
                        className="primary"
                        aria-label="Bericht versturen"
                        disabled={busy}
                      >
                        <Send size={18} />
                      </button>
                    </form>
                  </div>
                </TabsContent>
                <TabsContent value="access">
                  <div className="detail-body">
                    <div className="switch-row">
                      <div>
                        <b>Uitvoerder mag de klant spreken</b>
                        <p>Je kunt deze toegang op elk moment wijzigen.</p>
                      </div>
                      <Switch
                        checked={!!detail.project.contact}
                        onCheckedChange={(v) =>
                          run(async () => {
                            await mutate({
                              op: "contact",
                              project: selected?.id,
                              contact: v,
                            });
                            await refreshProject();
                          })
                        }
                      />
                    </div>
                    <h3>Klant veilig toegang geven</h3>
                    <p className="muted">
                      De klant logt in met dit e-mailadres. Deel daarna de
                      projectlink.
                    </p>
                    <form
                      className="invite-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          const d = await mutate({
                            op: "invite",
                            project: selected?.id,
                            email: form.email,
                          });
                          setForm({ ...form, share: location.origin + d.url });
                          await refreshProject();
                          toast.success(
                            "Klanttoegang vastgelegd. Deel de link met je klant.",
                          );
                        });
                      }}
                    >
                      <input
                        required
                        type="email"
                        placeholder="klant@bedrijf.nl"
                        value={form.email || ""}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                      />
                      <button className="primary" disabled={busy}>
                        <Plus size={16} /> Toegang geven
                      </button>
                    </form>
                    <button
                      className="outline share-link"
                      onClick={() =>
                        run(async () => {
                          await navigator.clipboard.writeText(
                            location.origin +
                              "/?project=" +
                              selected?.id +
                              "&client=1",
                          );
                          toast.success("Projectlink gekopieerd");
                        })
                      }
                    >
                      <Copy size={16} /> Projectlink kopiëren
                    </button>
                    {detail.invites.map((i: Data) => (
                      <div className="invite-row" key={i.id}>
                        <span>{i.email}</span>
                        <span className="tag">
                          {i.revoked ? "Ingetrokken" : "Toegang"}
                        </span>
                        {!i.revoked && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await mutate({
                                  op: "revoke",
                                  project: selected?.id,
                                  invite: i.id,
                                });
                                await refreshProject();
                              })
                            }
                          >
                            Intrekken
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="info-note">
                      <ShieldCheck size={20} />
                      <p>
                        Een klant ziet voortgang en gedeelde bestanden.
                        Hostinggegevens, developerchat en biedingen blijven
                        afgeschermd.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "accept"}
        onOpenChange={(o) => !o && setModal("project")}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>Deze developer kan aan de slag.</DialogTitle>
            <DialogDescription>
              Je accepteert het bod en geeft toegang tot de volledige
              projectinformatie en hostingkluis.
            </DialogDescription>
          </DialogHeader>
          <div className="project-summary">
            <h3>{form.bid?.name}</h3>
            <p>
              {money(form.bid?.amount)} · {form.bid?.days} dagen
            </p>
            <p>{form.bid?.message}</p>
          </div>
          <div className="dialog-actions">
            <button className="outline" onClick={() => setModal("project")}>
              Terug
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await mutate({
                    op: "accept",
                    project: selected?.id,
                    bid: form.bid.id,
                  });
                  await refreshProject();
                  toast.success("Bod geaccepteerd. De developer kan starten.");
                })
              }
            >
              Bod definitief accepteren
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={tour >= 0} onOpenChange={(o) => !o && closeTour()}>
        <DialogContent className="tour-dialog">
          <DialogHeader>
            <div className="tour-eyebrow">
              WELKOM BIJ BOUWR · {tour + 1} / 4
            </div>
            <DialogTitle>
              {
                [
                  "Mooi werk begint met overzicht.",
                  "Een goede opdracht. Een goede match.",
                  "Samen bouwen, zonder losse eindjes.",
                  "Jouw klant. Jouw uitstraling.",
                ][tour]
              }
            </DialogTitle>
            <DialogDescription>
              {
                [
                  "Van eerste idee tot de laatste oplevering: jouw projecten, developers en klanten komen hier samen.",
                  "Begin met een bouwpakket. Developers bieden op jouw opdracht en jij kiest wie het project gaat bouwen.",
                  "Na acceptatie deel je veilig bestanden en hostinggegevens. Volg de voortgang en houd contact in aparte projectgesprekken.",
                  "Geef je klant veilig toegang tot een portaal in jouw huisstijl. Je bepaalt zelf of de uitvoerder met de klant mag chatten.",
                ][tour]
              }
            </DialogDescription>
          </DialogHeader>
          <div className={`tour-visual tour-${tour}`}>
            {tour === 0 ? (
              <div className="tour-pipeline">
                {["Briefing", "Biedingen", "In uitvoering", "Opgeleverd"].map(
                  (s, i) => (
                    <div key={s}>
                      <span>{i === 3 ? <Check size={20} /> : i + 1}</span>
                      <b>{s}</b>
                      <i />
                    </div>
                  ),
                )}
              </div>
            ) : tour === 1 ? (
              <div className="tour-bid">
                <FileStack size={30} />
                <div>
                  <b>Jouw projectbriefing</b>
                  <p>Scope · planning · huisstijl</p>
                </div>
                <div className="tour-bid-bottom">
                  <Avatar name="Emma de Vries" />
                  <span>
                    <b>Een voorstel dat past</b>
                    <small>Jij kiest de uitvoerder</small>
                  </span>
                  <CircleCheck size={25} />
                </div>
              </div>
            ) : tour === 2 ? (
              <div className="tour-safety">
                <LockKeyhole size={40} />
                <b>Alleen voor jouw projectteam</b>
                <div>
                  <span>
                    <Folder size={18} /> Bestanden
                  </span>
                  <span>
                    <MessageSquare size={18} /> Chat
                  </span>
                  <span>
                    <CheckCheck size={18} /> Voortgang
                  </span>
                </div>
              </div>
            ) : (
              <div className="tour-portal">
                <div>
                  <span className="workspace-square">JP</span>
                  <b>Jouw eigen klantportaal</b>
                  <LockKeyhole size={18} />
                </div>
                <p>Nieuwe website</p>
                <Progress value={68} />
                <small>68% afgerond · samen op weg naar oplevering</small>
              </div>
            )}
          </div>
          <div className="tour-footer">
            <button className="text-button" onClick={closeTour}>
              Rondleiding overslaan
            </button>
            <div className="tour-dots">
              {[0, 1, 2, 3].map((i) => (
                <button
                  aria-label={"Stap " + (i + 1)}
                  className={tour === i ? "active" : ""}
                  onClick={() => setTour(i)}
                  key={i}
                />
              ))}
            </div>
            <button
              className="primary"
              onClick={() => (tour < 3 ? setTour(tour + 1) : closeTour())}
            >
              {tour < 3 ? "Volgende" : "Mijn werkplek ontdekken"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
function ProjectList({
  title,
  items,
  open,
  all,
  client = false,
}: {
  title: string;
  items: Data[];
  open: (p: Data) => void;
  all?: () => void;
  client?: boolean;
}) {
  return (
    <section className="projects-panel">
      <div className="section-heading">
        <h2>
          {title}
          <span className="number-pill">{items.length}</span>
        </h2>
        {all && (
          <button className="text-button" onClick={all}>
            Alles bekijken <ChevronRight size={16} />
          </button>
        )}
      </div>
      <Table className="project-table">
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Voortgang</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow
              key={p.id}
              onClick={() => open(p)}
              className="project-row"
            >
              <TableCell>
                <button
                  className="project-name"
                  onClick={(e) => {
                    e.stopPropagation();
                    open(p);
                  }}
                >
                  <Mark category={p.category || "Website"} />
                  <span>
                    <b>{p.title}</b>
                    <small>
                      {p.client || p.category}
                      {!client && p.budget ? ` · ${money(p.budget)}` : ""}
                    </small>
                  </span>
                </button>
              </TableCell>
              <TableCell>
                <Badge status={p.status} />
              </TableCell>
              <TableCell>
                <div className={`table-progress ${p.status}`}>
                  <Progress value={p.progress || 0} />
                  <small>{p.progress || 0}%</small>
                </div>
              </TableCell>
              <TableCell>
                <span className="deadline">{date(p.deadline)}</span>
              </TableCell>
              <TableCell>
                <button
                  className="icon-button"
                  aria-label={`${p.title} openen`}
                  onClick={(e) => {
                    e.stopPropagation();
                    open(p);
                  }}
                >
                  <MoreHorizontal size={19} />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!items.length && (
        <Empty text="Hier komt jouw werk samen. Maak een nieuw project aan of bekijk de marktplaats." />
      )}
    </section>
  );
}
function Toolbar({
  query,
  setQuery,
  filter,
  setFilter,
  view,
  setView,
  market = false,
}: {
  query: string;
  setQuery: (q: string) => void;
  filter: string;
  setFilter: (s: string) => void;
  view: string;
  setView: (s: string) => void;
  market?: boolean;
}) {
  return (
    <div className="toolbar">
      <div className="filter-tabs">
        {(market
          ? ["all"]
          : ["all", "open", "progress", "review", "completed"]
        ).map((s) => (
          <button
            className={filter === s ? "active" : ""}
            onClick={() => setFilter(s)}
            key={s}
          >
            {s === "all"
              ? "Alle projecten"
              : s === "open"
                ? "Open"
                : s === "progress"
                  ? "In uitvoering"
                  : s === "review"
                    ? "Review"
                    : "Opgeleverd"}
          </button>
        ))}
      </div>
      <div className="toolbar-actions">
        <label className="search">
          <Search size={17} />
          <input
            placeholder="Zoek een project…"
            aria-label="Project zoeken"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!market && (
          <div className="view-switch">
            <button
              aria-label="Lijstweergave"
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <List size={18} />
            </button>
            <button
              aria-label="Kanbanweergave"
              className={view === "board" ? "active" : ""}
              onClick={() => setView("board")}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function Kanban({ items, open }: { items: Data[]; open: (p: Data) => void }) {
  return (
    <div className="kanban">
      {["open", "progress", "review", "completed"].map((s) => (
        <section key={s}>
          <div className="kanban-heading">
            <Badge status={s} />
            <b>{items.filter((p) => p.status === s).length}</b>
          </div>
          {items
            .filter((p) => p.status === s)
            .map((p) => (
              <button
                className="kanban-card"
                onClick={() => open(p)}
                key={p.id}
              >
                <Mark category={p.category} />
                <h3>{p.title}</h3>
                <p>{p.client || p.category}</p>
                <Progress value={p.progress} />
                <div>
                  <span>{money(p.budget)}</span>
                  <small>{date(p.deadline)}</small>
                </div>
              </button>
            ))}
        </section>
      ))}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Layers size={27} />
      <p>{text}</p>
    </div>
  );
}
