import { syncPayment } from "@/lib/mollie";
export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 1000)
      return new Response("Invalid payload", { status: 400 });
    const form = new URLSearchParams(await req.text());
    const id = form.get("id");
    if (!id || !/^tr_[A-Za-z0-9]+$/.test(id))
      return new Response("Invalid id", { status: 400 });
    await syncPayment(id);
    return new Response("OK");
  } catch (e) {
    console.error("Mollie webhook verification failed", (e as Error).message);
    return new Response("Retry later", { status: 503 });
  }
}
