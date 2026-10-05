import AuthForm from "../auth-form";
export const dynamic = "force-dynamic";
export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  return <AuthForm variant="reset" token={params.token} />;
}
