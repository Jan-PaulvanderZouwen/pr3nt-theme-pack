import nodemailer from "nodemailer";
const required = [
  "APP_ORIGIN",
  "BETTER_AUTH_SECRET",
  "VAULT_KEY",
  "ADMIN_EMAIL",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MAIL_FROM",
];
for (const name of required)
  if (!process.env[name]) throw new Error(`Vul ${name} in .env in.`);
if (
  new URL(process.env.APP_ORIGIN!).origin !== "https://bouwr.jpvanderzouwen.nl"
)
  throw new Error("APP_ORIGIN moet https://bouwr.jpvanderzouwen.nl zijn.");
if (
  process.env.BETTER_AUTH_SECRET!.length < 32 ||
  Buffer.from(process.env.VAULT_KEY!, "base64").length !== 32
)
  throw new Error("Ongeldige beveiligingssleutels.");
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE !== "false",
  requireTLS: process.env.SMTP_SECURE === "false",
  auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
});
await transport.verify();
console.log(
  "Instellingen en SMTP-verbinding zijn gecontroleerd. Er is geen e-mail verstuurd.",
);
