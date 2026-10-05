import { getSqlite } from "@/lib/runtime";
export const dynamic = "force-dynamic";
export function GET() { try { getSqlite().prepare("SELECT 1 FROM users LIMIT 1").get(); return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } }); } catch { return Response.json({ status: "unavailable" }, { status: 503 }); } }
