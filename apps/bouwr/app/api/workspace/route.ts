import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db, config, encrypt, decrypt, notify, now, uid } from "@/lib/server";
import { defaultTemplates, folders } from "@/lib/standards";
import { env } from "@/lib/runtime";
import { createPayment, syncPayment } from "@/lib/mollie";
import { z } from "zod";
import { boundedBody } from "@/lib/http";
export const dynamic = "force-dynamic";
type Row = Record<string, any>;
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const str = z.string().trim().min(1).max(5000);
const checklist = z
  .array(
    z.object({
      title: z.string().min(1).max(300),
      done: z.boolean(),
      group: z.string().max(100),
    }),
  )
  .max(200);
const projectSchema = z.object({
  title: str.max(180),
  client: str.max(180),
  description: str,
  category: z.enum(["Website", "WordPress", "Shopify", "Webapp"]),
  budget: z.number().int().min(100).max(100000000),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hosting: z.enum(["Eigen hosting", "Hosting uitvoerder"]),
  contact: z.boolean(),
  paymentMode: z.enum(["platform", "direct"]),
  checklist,
});
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
async function account() {
  const u = await getCurrentUser();
  if (!u) fail("Log eerst veilig in.", 401);
  const p = await db()
    .prepare("SELECT * FROM users WHERE id=?")
    .bind(u.userId)
    .first<Row>();
  return {
    u,
    p,
    admin:
      !!config().ADMIN_EMAIL &&
      u.email.toLowerCase() === config().ADMIN_EMAIL.toLowerCase(),
  };
}
async function projectAccess(
  id: string,
  a: Awaited<ReturnType<typeof account>>,
  allowOpen = false,
) {
  const p = await db()
    .prepare("SELECT * FROM projects WHERE id=?")
    .bind(id)
    .first<Row>();
  if (!p) fail("Project niet gevonden.", 404);
  const owner = p.owner === a.u.userId,
    executor = p.executor === a.u.userId;
  const member = await db()
    .prepare(
      "SELECT id FROM memberships WHERE project=? AND email=? AND revoked=0",
    )
    .bind(id, a.u.email.toLowerCase())
    .first();
  if (
    !owner &&
    !executor &&
    !member &&
    !a.admin &&
    !(allowOpen && p.status === "open" && a.p?.role === "developer")
  )
    fail("Je hebt geen toegang tot dit project.", 403);
  return { p, owner, executor, member: !!member };
}
async function detail(id: string, a: Awaited<ReturnType<typeof account>>) {
  const x = await projectAccess(id, a, true);
  const { p, owner, executor, member } = x;
  const full = owner || executor || a.admin;
  const { secret, ...safe } = p;
  const bidder = !full && !member;
  const project = bidder
    ? {
        id: p.id,
        title: p.title,
        description: p.description,
        category: p.category,
        budget: p.budget,
        deadline: p.deadline,
        status: p.status,
        hosting: p.hosting,
        progress: 0,
        checklist: [],
        payment_mode: p.payment_mode,
      }
    : safe;
  if (member && !full) {
    delete project.budget;
    delete project.payment_mode;
    delete project.owner;
    delete project.executor;
  }
  project.checklist =
    typeof project.checklist === "string"
      ? JSON.parse(project.checklist || "[]")
      : project.checklist;
  const bids =
    owner || a.admin
      ? (
          await db()
            .prepare(
              "SELECT b.*,u.name,u.company FROM bids b JOIN users u ON u.id=b.developer WHERE b.project=? ORDER BY b.created DESC",
            )
            .bind(id)
            .all()
        ).results
      : executor || bidder
        ? (
            await db()
              .prepare("SELECT * FROM bids WHERE project=? AND developer=?")
              .bind(id, a.u.userId)
              .all()
          ).results
        : [];
  const channelAllowed = full || member;
  const msgs = channelAllowed
    ? (
        await db()
          .prepare(
            `SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.author WHERE m.project=? AND (m.channel='internal' AND ?=1 OR m.channel='client' AND ?=1) ORDER BY m.created LIMIT 300`,
          )
          .bind(
            id,
            owner || executor || a.admin ? 1 : 0,
            owner || member || (executor && p.contact) ? 1 : 0,
          )
          .all()
      ).results
    : [];
  const files =
    full || member
      ? (
          await db()
            .prepare(
              `SELECT * FROM files WHERE project=? AND (?=1 OR client_visible=1) ORDER BY created DESC`,
            )
            .bind(id, full ? 1 : 0)
            .all()
        ).results
      : [];
  const invites = owner
    ? (
        await db()
          .prepare("SELECT * FROM memberships WHERE project=?")
          .bind(id)
          .all()
      ).results
    : [];
  const brandUser = await db()
    .prepare("SELECT name,company,brand FROM users WHERE id=?")
    .bind(p.owner)
    .first<Row>();
  const payment =
    owner || executor
      ? await db()
          .prepare("SELECT id,status,amount,fee FROM payments WHERE project=?")
          .bind(id)
          .first()
      : null;
  return {
    project,
    bids,
    messages: msgs,
    files,
    invites,
    payment,
    owner,
    executor,
    member,
    canClientChat: owner || member || (executor && !!p.contact),
    hasSecret: !!secret,
    brand: brandUser
      ? { ...brandUser, brand: JSON.parse(brandUser.brand) }
      : null,
  };
}
export async function GET(req: Request) {
  try {
    const a = await account();
    const url = new URL(req.url);
    if (url.searchParams.get("project"))
      return json(await detail(url.searchParams.get("project")!, a));
    if (url.searchParams.get("download")) {
      const f = await db()
        .prepare("SELECT * FROM files WHERE id=?")
        .bind(url.searchParams.get("download"))
        .first<Row>();
      if (!f) fail("Bestand niet gevonden.", 404);
      const x = await projectAccess(f.project, a);
      if (!x.owner && !x.executor && !a.admin && !f.client_visible)
        fail("Geen toegang tot dit bestand.", 403);
      const obj = await env.BUCKET!.get(f.id);
      if (!obj) fail("Bestand niet beschikbaar.", 404);
      const filename = f.name.replace(/[\r\n"\\]/g, "_");
      return new Response(obj.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      });
    }
    if (!a.p) return json({ registered: false, identity: a.u, admin: a.admin });
    const own = (
      await db()
        .prepare(
          "SELECT p.* FROM projects p WHERE owner=? OR executor=? OR id IN (SELECT project FROM memberships WHERE email=? AND revoked=0) ORDER BY created DESC",
        )
        .bind(a.u.userId, a.u.userId, a.u.email.toLowerCase())
        .all<Row>()
    ).results.map(({ secret, ...p }) => {
      if (p.owner !== a.u.userId && p.executor !== a.u.userId) {
        delete p.budget;
        delete p.payment_mode;
      }
      return { ...p, checklist: JSON.parse(p.checklist) };
    });
    const market =
      a.p.role === "developer"
        ? (
            await db()
              .prepare(
                "SELECT id,title,description,category,budget,deadline,status,hosting,created FROM projects WHERE status='open' AND owner<>? ORDER BY created DESC LIMIT 100",
              )
              .bind(a.u.userId)
              .all()
          ).results
        : [];
    const templates = (
      await db()
        .prepare("SELECT * FROM templates WHERE owner=?")
        .bind(a.u.userId)
        .all<Row>()
    ).results.map((t) => ({ ...t, checklist: JSON.parse(t.checklist) }));
    const notes = (
      await db()
        .prepare(
          "SELECT * FROM notifications WHERE user=? ORDER BY created DESC LIMIT 50",
        )
        .bind(a.u.userId)
        .all()
    ).results;
    const payments = (
      await db()
        .prepare(
          "SELECT pay.*,p.title FROM payments pay JOIN projects p ON p.id=pay.project WHERE p.owner=? OR p.executor=? ORDER BY pay.created DESC",
        )
        .bind(a.u.userId, a.u.userId)
        .all()
    ).results;
    const admin = a.admin
      ? {
          users: (
            await db()
              .prepare(
                "SELECT id,name,email,company,role,created FROM users ORDER BY created DESC LIMIT 200",
              )
              .all()
          ).results,
          projects: (
            await db()
              .prepare(
                "SELECT id,title,status,budget,owner,executor FROM projects ORDER BY created DESC LIMIT 200",
              )
              .all()
          ).results,
        }
      : null;
    return json({
      registered: true,
      user: { ...a.p, brand: JSON.parse(a.p.brand) },
      projects: own,
      market,
      templates: [...defaultTemplates, ...templates],
      notifications: notes,
      payments,
      admin,
      capabilities: {
        vault: !!config().VAULT_KEY,
        mollie: !!config().MOLLIE_CLIENT_ID,
        mollieEnabled: config().MOLLIE_ENABLED === "true",
        mollieConnected: !!(await db()
          .prepare("SELECT user FROM mollie_connections WHERE user=?")
          .bind(a.u.userId)
          .first()),
        registration: "E-mail en wachtwoord",
      },
    });
  } catch (e) {
    return error(e);
  }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (!origin || origin !== new URL(config().APP_ORIGIN).origin)
      fail("Ongeldige aanvraag.", 403);
    const a = await account();
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      if (!a.p) fail("Maak eerst je profiel aan.", 403);
      if (Number(req.headers.get("content-length") || 0) > 22000000)
        fail("Bestanden mogen maximaal 20 MB zijn.");
      const bytes = await boundedBody(req, 22000000);
      const form = await new Response(bytes, {
        headers: { "Content-Type": req.headers.get("content-type")! },
      }).formData();
      const id = String(form.get("project"));
      const x = await projectAccess(id, a);
      if (!x.owner && !x.executor)
        fail("Alleen projectdevelopers kunnen bestanden uploaden.", 403);
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 20000000)
        fail("Kies een bestand van maximaal 20 MB.");
      const folder = String(form.get("folder"));
      if (!folders.includes(folder)) fail("Ongeldige projectmap.");
      const visible = form.get("clientVisible") === "true";
      const fid = uid();
      await env.BUCKET!.put(fid, await file.arrayBuffer(), {
        httpMetadata: { contentType: "application/octet-stream" },
      });
      try {
        await db()
          .prepare(
            "INSERT INTO files (id,project,uploader,name,folder,size,client_visible,created) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            fid,
            id,
            a.u.userId,
            file.name.slice(0, 180),
            folder,
            file.size,
            visible ? 1 : 0,
            now(),
          )
          .run();
      } catch (e) {
        await env.BUCKET!.delete(fid);
        throw e;
      }
      await notify(
        x.owner ? x.p.executor : x.p.owner,
        id,
        `${a.p.name} heeft ${file.name} aangeleverd.`,
      );
      return json({ ok: true });
    }
    if (Number(req.headers.get("content-length") || 0) > 2500000)
      fail("Aanvraag te groot.");
    const b = JSON.parse(
      new TextDecoder().decode(await boundedBody(req, 2500000)),
    ) as Row;
    const op = z.string().parse(b.op);
    if (op === "register") {
      const v = z
        .object({
          name: str.max(100),
          company: str.max(120),
          role: z.enum(["developer", "client"]),
        })
        .parse(b);
      if (a.p) fail("Je profiel bestaat al.", 409);
      await db()
        .prepare(
          "INSERT INTO users (id,email,name,company,role,brand,created) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          a.u.userId,
          a.u.email.toLowerCase(),
          v.name,
          v.company,
          v.role,
          JSON.stringify({ name: v.company, color: "#175cff", logo: "" }),
          now(),
        )
        .run();
      return json({ ok: true });
    }
    if (!a.p) fail("Maak eerst je profiel aan.", 403);
    if (op === "readNotifications") {
      await db()
        .prepare("UPDATE notifications SET read=1 WHERE user=?")
        .bind(a.u.userId)
        .run();
      return json({ ok: true });
    }
    if (op === "saveBrand") {
      if (a.p.role !== "developer")
        fail("Alleen developers kunnen een portaal instellen.", 403);
      const v = z
        .object({
          name: str.max(100),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          logo: z
            .string()
            .max(2000000)
            .refine(
              (s) =>
                !s ||
                /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
            ),
        })
        .parse(b);
      await db()
        .prepare("UPDATE users SET brand=? WHERE id=?")
        .bind(JSON.stringify(v), a.u.userId)
        .run();
      return json({ ok: true });
    }
    if (op === "saveTemplate") {
      if (a.p.role !== "developer")
        fail("Alleen developers kunnen templates maken.", 403);
      const v = z
        .object({
          id: z.string().optional(),
          name: str.max(100),
          description: str.max(500),
          category: z.enum(["Website", "WordPress", "Shopify", "Webapp"]),
          checklist,
        })
        .parse(b);
      if (v.id && !defaultTemplates.some((t) => t.id === v.id)) {
        const old = await db()
          .prepare("SELECT id FROM templates WHERE id=? AND owner=?")
          .bind(v.id, a.u.userId)
          .first();
        if (!old) fail("Geen toegang tot deze template.", 403);
        await db()
          .prepare(
            "UPDATE templates SET name=?,description=?,category=?,checklist=? WHERE id=? AND owner=?",
          )
          .bind(
            v.name,
            v.description,
            v.category,
            JSON.stringify(v.checklist),
            v.id,
            a.u.userId,
          )
          .run();
      } else
        await db()
          .prepare(
            "INSERT INTO templates (id,owner,name,description,category,checklist) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            uid(),
            a.u.userId,
            v.name,
            v.description,
            v.category,
            JSON.stringify(v.checklist),
          )
          .run();
      return json({ ok: true });
    }
    if (op === "create") {
      if (a.p.role !== "developer")
        fail("Alleen developers kunnen opdrachten plaatsen.", 403);
      const v = projectSchema.parse(b);
      if (v.paymentMode === "direct" && !a.admin)
        fail(
          "Eigen klantfacturatie is alleen beschikbaar voor de beheerder.",
          403,
        );
      const id = uid();
      await db()
        .prepare(
          "INSERT INTO projects (id,owner,title,client,description,category,budget,deadline,status,progress,hosting,contact,checklist,payment_mode,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          a.u.userId,
          v.title,
          v.client,
          v.description,
          v.category,
          v.budget,
          v.deadline,
          "open",
          0,
          v.hosting,
          v.contact ? 1 : 0,
          JSON.stringify(v.checklist),
          v.paymentMode,
          now(),
        )
        .run();
      return json({ ok: true, id });
    }
    const id = z.string().uuid().parse(b.project);
    const x = await projectAccess(id, a, op === "bid");
    if (op === "bid") {
      if (a.p.role !== "developer" || x.owner || x.p.status !== "open")
        fail("Je kunt niet bieden op dit project.", 403);
      const v = z
        .object({
          amount: z.number().int().min(100).max(100000000),
          days: z.number().int().min(1).max(730),
          message: str.max(2000),
        })
        .parse(b);
      await db()
        .prepare(
          "INSERT INTO bids (id,project,developer,amount,days,message,status,created) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project,developer) DO UPDATE SET amount=excluded.amount,days=excluded.days,message=excluded.message,status=excluded.status",
        )
        .bind(
          uid(),
          id,
          a.u.userId,
          v.amount,
          v.days,
          v.message,
          "pending",
          now(),
        )
        .run();
      await notify(
        x.p.owner,
        id,
        `${a.p.name} heeft een bod gedaan op ${x.p.title}.`,
      );
      return json({ ok: true });
    }
    if (op === "accept") {
      if (!x.owner || x.p.executor || x.p.status !== "open")
        fail(
          "Er is al een uitvoerder gekozen of je bent geen opdrachtgever.",
          409,
        );
      const bid = await db()
        .prepare(
          "SELECT * FROM bids WHERE id=? AND project=? AND status='pending'",
        )
        .bind(z.string().uuid().parse(b.bid), id)
        .first<Row>();
      if (!bid) fail("Bod niet beschikbaar.", 404);
      const result = await db().batch([
        db()
          .prepare(
            "UPDATE projects SET executor=?,budget=?,status='progress' WHERE id=? AND executor IS NULL AND status='open'",
          )
          .bind(bid.developer, bid.amount, id),
        db()
          .prepare(
            "UPDATE bids SET status=CASE WHEN id=? THEN 'accepted' ELSE 'declined' END WHERE project=? AND EXISTS (SELECT 1 FROM projects WHERE id=? AND executor=?)",
          )
          .bind(bid.id, id, id, bid.developer),
        db()
          .prepare(
            "INSERT INTO notifications (id,user,project,body,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND executor=?)",
          )
          .bind(
            uid(),
            bid.developer,
            id,
            `Je bod op ${x.p.title} is geaccepteerd. Je kunt starten.`,
            now(),
            id,
            bid.developer,
          ),
      ]);
      if (result[0].meta.changes !== 1)
        fail("Dit project is inmiddels toegewezen.", 409);
      return json({ ok: true });
    }
    if (op === "update") {
      if (!x.owner && !x.executor) fail("Geen wijzigingsrechten.", 403);
      const v = z
        .object({
          progress: z.number().int().min(0).max(100),
          status: z.enum(["progress", "review", "completed"]),
          checklist,
        })
        .parse(b);
      if (!x.p.executor) fail("Accepteer eerst een bod.");
      if (v.status === "completed" && !x.owner)
        fail("Alleen de opdrachtgever kan de oplevering accepteren.", 403);
      if (x.p.status === "completed" && v.status !== "completed" && !x.owner)
        fail(
          "Een afgerond project kan alleen door de opdrachtgever heropend worden.",
          403,
        );
      await db()
        .prepare(
          "UPDATE projects SET progress=?,status=?,checklist=? WHERE id=?",
        )
        .bind(v.progress, v.status, JSON.stringify(v.checklist), id)
        .run();
      await notify(
        x.owner ? x.p.executor : x.p.owner,
        id,
        `${x.p.title}: ${v.progress}% gereed · ${v.status === "review" ? "klaar voor review" : v.status === "completed" ? "opgeleverd" : "in uitvoering"}.`,
      );
      return json({ ok: true });
    }
    if (op === "chat") {
      const v = z
        .object({
          channel: z.enum(["internal", "client"]),
          body: str.max(3000),
        })
        .parse(b);
      if (v.channel === "internal" && !x.owner && !x.executor)
        fail("Geen toegang tot developerchat.", 403);
      if (
        v.channel === "client" &&
        !x.owner &&
        !x.member &&
        !(x.executor && x.p.contact)
      )
        fail("Klantcontact is niet toegestaan.", 403);
      await db()
        .prepare(
          "INSERT INTO messages (id,project,author,channel,body,created) VALUES (?,?,?,?,?,?)",
        )
        .bind(uid(), id, a.u.userId, v.channel, v.body, now())
        .run();
      await notify(
        x.owner ? x.p.executor : x.p.owner,
        id,
        `${a.p.name} heeft een bericht geplaatst.`,
      );
      if (v.channel === "client") {
        const members = (
          await db()
            .prepare(
              "SELECT u.id FROM memberships m JOIN users u ON u.email=m.email WHERE m.project=? AND m.revoked=0 AND u.id<>?",
            )
            .bind(id, a.u.userId)
            .all<Row>()
        ).results;
        for (const m of members)
          await notify(m.id, id, `Nieuw bericht bij ${x.p.title}.`);
      }
      return json({ ok: true });
    }
    if (op === "contact") {
      if (!x.owner)
        fail("Alleen de opdrachtgever kan klantcontact wijzigen.", 403);
      await db()
        .prepare("UPDATE projects SET contact=? WHERE id=?")
        .bind(z.boolean().parse(b.contact) ? 1 : 0, id)
        .run();
      return json({ ok: true });
    }
    if (op === "invite") {
      if (!x.owner)
        fail("Alleen de opdrachtgever kan klanten uitnodigen.", 403);
      const email = z.string().email().max(200).parse(b.email).toLowerCase();
      await db()
        .prepare(
          "INSERT INTO memberships (id,project,email,revoked,created) VALUES (?,?,?,?,?) ON CONFLICT(project,email) DO UPDATE SET revoked=0",
        )
        .bind(uid(), id, email, 0, now())
        .run();
      return json({ ok: true, url: `/?project=${id}&client=1` });
    }
    if (op === "revoke") {
      if (!x.owner) fail("Geen rechten.", 403);
      await db()
        .prepare("UPDATE memberships SET revoked=1 WHERE id=? AND project=?")
        .bind(z.string().uuid().parse(b.invite), id)
        .run();
      return json({ ok: true });
    }
    if (op === "vault") {
      if (!x.owner && !x.executor)
        fail("Hostinggegevens zijn afgeschermd.", 403);
      if (b.value !== undefined) {
        if (!x.owner)
          fail("Alleen opdrachtgever kan hostinggegevens instellen.", 403);
        const value = z.string().max(10000).parse(b.value);
        await db()
          .prepare("UPDATE projects SET secret=? WHERE id=?")
          .bind(value ? await encrypt(value) : null, id)
          .run();
        return json({ ok: true });
      }
      return json({ value: x.p.secret ? await decrypt(x.p.secret) : "" });
    }
    if (op === "payment") {
      if (!x.owner || !x.p.executor || x.p.payment_mode !== "platform")
        fail("Betaling niet beschikbaar.", 403);
      try {
        return json(await createPayment(x.p));
      } catch (e) {
        fail((e as Error).message, 503);
      }
    }
    fail("Onbekende actie.");
  } catch (e) {
    return error(e);
  }
}
function error(e: unknown) {
  if (e instanceof SyntaxError)
    return json({ error: "Ongeldige invoer." }, 400);
  if (e instanceof z.ZodError)
    return json({ error: "Controleer de ingevulde velden." }, 400);
  const err = e as Error & { status?: number };
  if (!err.status) console.error("Workspace request failed", err.message);
  return json(
    {
      error: err.status
        ? err.message
        : err.message?.includes("hostingkluis") ||
            err.message?.includes("Hostingkluis")
          ? err.message
          : "Opslaan is niet gelukt. Probeer het opnieuw.",
    },
    err.status || 503,
  );
}
