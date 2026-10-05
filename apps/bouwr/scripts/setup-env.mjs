import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import readline from "node:readline/promises";

if (existsSync(".env")) { console.log("Bestaande Bouwr-instellingen blijven behouden."); process.exit(0); }
const pr3ntPath = "/var/www/pr3nt/pr3nt-theme-pack/apps/pr3nt-shopify-quote-app/.env";
const previous = existsSync(pr3ntPath) ? parseEnv(readFileSync(pr3ntPath, "utf8")) : {};
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
try {
  const admin = (await rl.question("E-mailadres van de Bouwr-beheerder: ")).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin)) throw new Error("Vul een geldig e-mailadres in.");
  const smtpPassword = previous.SMTP_PASS || previous.SMTP_PASSWORD;
  if (!previous.SMTP_HOST || !previous.SMTP_USER || !smtpPassword) throw new Error("SMTP is niet compleet in de PR3NT-instellingen. Maak .env handmatig op basis van .env.example voordat je verdergaat.");
  const values = {
    APP_ORIGIN: "https://bouwr.jpvanderzouwen.nl", DATA_DIR: "/data", ADMIN_EMAIL: admin,
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64"), VAULT_KEY: randomBytes(32).toString("base64"),
    SMTP_HOST: previous.SMTP_HOST, SMTP_PORT: previous.SMTP_PORT || "465", SMTP_SECURE: previous.SMTP_SECURE || "true", SMTP_USER: previous.SMTP_USER, SMTP_PASSWORD: smtpPassword,
    MAIL_FROM: `Bouwr <${previous.SMTP_USER}>`, MOLLIE_ENABLED: "false", MOLLIE_LIVE: "false",
  };
  // Single quotes preserve $ and # in Compose dotenv without shell evaluation.
  const quote = (value) => "'" + value.replaceAll("'", "\\'") + "'";
  writeFileSync(".env", Object.entries(values).map(([key, value]) => `${key}=${quote(value)}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  chmodSync(".env", 0o600);
  console.log("Bouwr-instellingen aangemaakt. SMTP is overgenomen; PR3NT is niet gewijzigd.");
} finally { rl.close(); }
