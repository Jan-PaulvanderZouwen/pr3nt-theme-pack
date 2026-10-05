import { account, fail } from "@/lib/access";
import { finishOutlook, outlookConfig } from "@/lib/outlook";
export async function GET(req: Request) {
  try {
    const a = await account(); if (a.p?.role !== "developer") fail("Geen toegang tot deze koppeling.", 403);
    const url = new URL(req.url), state = url.searchParams.get("state"), code = url.searchParams.get("code");
    if (!state || !code || state.length > 200 || code.length > 10000) fail("Outlook koppelen is afgebroken. Start opnieuw.");
    await finishOutlook(a.u.userId, state, code);
    return Response.redirect(outlookConfig().origin + "/?outlook=connected", 302);
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: (e as any).status || 503, headers: { "Cache-Control": "no-store" } }); }
}
