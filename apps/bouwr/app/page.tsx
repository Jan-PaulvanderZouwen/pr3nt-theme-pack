import Workspace from "./workspace";
import { requireUser } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["project", "client", "payment", "mollie"]) if (typeof query[key] === "string") params.set(key, query[key]);
  const user = await requireUser("/" + (params.size ? "?" + params : ""));
  return <Workspace identity={{ id: user.userId, email: user.email, name: user.fullName || user.email }} />;
}
