import { betterAuth, type BetterAuthOptions } from "better-auth";
import nodemailer from "nodemailer";
import { getSqlite } from "./runtime";

let instance: ReturnType<typeof betterAuth> | undefined;
export function getAuth() {
  return (instance ??= betterAuth(authOptions()));
}
export function authOptions(): BetterAuthOptions {
  const origin = process.env.APP_ORIGIN;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!origin || !secret || secret.length < 32)
    throw new Error("APP_ORIGIN en BETTER_AUTH_SECRET moeten zijn ingesteld.");
  if (
    process.env.NODE_ENV === "production" &&
    new URL(origin).protocol !== "https:"
  )
    throw new Error("Productie vereist HTTPS.");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== "false",
    requireTLS: process.env.SMTP_SECURE === "false",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASSWORD || "",
    },
  });
  async function mail(to: string, subject: string, text: string) {
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD ||
      !process.env.MAIL_FROM
    )
      throw new Error("De e-mailvoorziening is nog niet ingericht.");
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      text,
    });
  }
  return {
    appName: "Bouwr",
    baseURL: origin,
    secret,
    database: getSqlite(),
    trustedOrigins: [new URL(origin).origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mail(
          user.email,
          "Bouwr · Wachtwoord herstellen",
          `Via onderstaande link stel je een nieuw wachtwoord in.\n\n${url}\n\nHeb je dit niet aangevraagd? Dan hoef je niets te doen.`,
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 3600,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await mail(
          user.email,
          "Bouwr · Bevestig je e-mailadres",
          `Welkom bij Bouwr. Bevestig je e-mailadres via deze link:\n\n${url}\n\nDe link is één uur geldig.`,
        );
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: "bouwr",
      useSecureCookies: new URL(origin).protocol === "https:",
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 300, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
        "/send-verification-email": { window: 300, max: 3 },
      },
    },
  };
}
