export function safeReturnPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (
      url.origin !== "https://app.local" ||
      ["/inloggen", "/registreren", "/wachtwoord-reset"].includes(
        url.pathname,
      ) ||
      url.pathname.startsWith("/api/auth")
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
