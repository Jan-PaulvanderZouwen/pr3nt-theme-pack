import { account } from "@/lib/access";
import { startOutlook } from "@/lib/outlook";
export async function GET() {
  try { const a = await account(); if (a.p?.role !== "developer") return Response.json({ error: "Alleen developers kunnen een mailbox koppelen." }, { status: 403 }); return Response.redirect(await startOutlook(a.u.userId), 302); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: (e as any).status || 503, headers: { "Cache-Control": "no-store" } }); }
}
