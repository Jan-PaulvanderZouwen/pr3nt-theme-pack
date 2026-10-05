import AuthForm from "../auth-form";
import { getCurrentUser } from "@/lib/session";
import { safeReturnPath } from "@/lib/return-path";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect(safeReturnPath(params.returnTo));
  return (
    <AuthForm
      variant="login"
      returnTo={safeReturnPath(params.returnTo)}
      verified={params.geverifieerd === "1"}
    />
  );
}
