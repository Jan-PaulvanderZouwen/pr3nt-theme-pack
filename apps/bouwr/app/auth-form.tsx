"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { safeReturnPath } from "@/lib/return-path";

export default function AuthForm({
  variant,
  returnTo = "/",
  token,
  verified = false,
}: {
  variant: "login" | "signup" | "reset";
  returnTo?: string;
  token?: string;
  verified?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "forgot">(
    variant,
  );
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    verified ? "Je e-mailadres is bevestigd. Je kunt nu inloggen." : "",
  );
  const next = safeReturnPath(returnTo);
  const verificationReturn =
    "/inloggen?geverifieerd=1&returnTo=" + encodeURIComponent(next);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if ((mode === "signup" || mode === "reset") && password !== confirmation)
        throw new Error("De wachtwoorden komen niet overeen.");
      if (mode === "signup") {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          callbackURL: verificationReturn,
        });
        if (result.error)
          throw new Error(
            "Registreren is niet gelukt. Controleer je gegevens of probeer later opnieuw.",
          );
        setPassword("");
        setConfirmation("");
        setMessage(
          "Bekijk je mailbox en bevestig je e-mailadres. Daarna kun je inloggen. Zie je geen mail? Controleer ook je spammap.",
        );
      } else if (mode === "login") {
        const result = await authClient.signIn.email({
          email: email.trim().toLowerCase(),
          password,
          callbackURL: next,
        });
        if (result.error)
          throw new Error(
            result.error.code === "EMAIL_NOT_VERIFIED"
              ? "Bevestig eerst je e-mailadres. Je kunt hieronder een nieuwe verificatiemail aanvragen."
              : "Inloggen is niet gelukt. Controleer je e-mailadres en wachtwoord.",
          );
        window.location.assign(next);
      } else if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({
          email: email.trim().toLowerCase(),
          redirectTo: window.location.origin + "/wachtwoord-reset",
        });
        if (result.error)
          throw new Error("De aanvraag is niet gelukt. Probeer later opnieuw.");
        setMessage(
          "Als dit e-mailadres bij ons bekend is, ontvang je een link om je wachtwoord te herstellen.",
        );
      } else {
        if (!token)
          throw new Error(
            "Deze herstellink is ongeldig. Vraag een nieuwe link aan.",
          );
        const result = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        if (result.error)
          throw new Error(
            "Deze herstellink is ongeldig of verlopen. Vraag een nieuwe link aan.",
          );
        setPassword("");
        setConfirmation("");
        setMode("login");
        setMessage(
          "Je wachtwoord is gewijzigd. Log in met je nieuwe wachtwoord.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Vul eerst je e-mailadres in.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({
        email: email.trim().toLowerCase(),
        callbackURL: verificationReturn,
      });
      if (result.error)
        throw new Error("Aanvragen is niet gelukt. Probeer later opnieuw.");
      setMessage(
        "Als dit account nog niet bevestigd is, ontvang je een nieuwe verificatiemail.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-wordmark" href="/inloggen">
          bouwr<span>.</span>
        </Link>
        <p className="auth-slogan">Samen aan mooi werk.</p>
        <h1 id="auth-title">
          {mode === "signup"
            ? "Maak je account aan."
            : mode === "forgot"
              ? "Wachtwoord vergeten?"
              : mode === "reset"
                ? "Een nieuw wachtwoord."
                : "Welkom bij je werkplek."}
        </h1>
        <p className="auth-intro">
          {mode === "signup"
            ? "Registreer en bevestig je e-mailadres om te beginnen."
            : mode === "forgot"
              ? "Ontvang een link om je wachtwoord te herstellen."
              : mode === "reset"
                ? "Kies een nieuw wachtwoord van minimaal 12 tekens."
                : "Log in om aan je projecten te werken."}
        </p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="auth-message" role="status">
            <Mail size={18} />
            <span>{message}</span>
          </p>
        )}
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Naam
              <input
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              E-mailadres
              <input
                autoComplete="email"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Wachtwoord
              <input
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <small>
                {mode === "login"
                  ? ""
                  : "Minimaal 12 tekens. Een wachtwoordzin is ook goed."}
              </small>
            </label>
          )}
          {(mode === "signup" || mode === "reset") && (
            <label>
              Herhaal je wachtwoord
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          )}
          <button className="primary auth-submit" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />}
            {mode === "signup"
              ? "Account aanmaken"
              : mode === "forgot"
                ? "Herstellink aanvragen"
                : mode === "reset"
                  ? "Wachtwoord opslaan"
                  : "Inloggen"}
          </button>
        </form>
        <div className="auth-links">
          {mode === "login" && (
            <>
              <button
                disabled={busy}
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setMessage("");
                }}
              >
                Wachtwoord vergeten?
              </button>
              <button disabled={busy} onClick={resend}>
                Verificatiemail opnieuw sturen
              </button>
            </>
          )}
          {mode === "signup" || mode === "forgot" || mode === "reset" ? (
            <Link
              href={"/inloggen?returnTo=" + encodeURIComponent(next)}
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
            >
              Terug naar inloggen
            </Link>
          ) : (
            <p>
              Nog geen account?{" "}
              <Link href={"/registreren?returnTo=" + encodeURIComponent(next)}>
                Registreren
              </Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
