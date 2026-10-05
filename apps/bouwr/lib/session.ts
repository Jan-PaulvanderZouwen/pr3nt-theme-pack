import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { safeReturnPath } from "./return-path";

export async function getCurrentUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || !session.user.emailVerified) return null;
  return {
    userId: session.user.id,
    email: session.user.email.toLowerCase(),
    fullName: session.user.name,
    displayName: session.user.name,
  };
}
export async function requireUser(returnTo = "/") {
  const user = await getCurrentUser();
  if (!user)
    redirect(
      "/inloggen?returnTo=" + encodeURIComponent(safeReturnPath(returnTo)),
    );
  return user;
}
