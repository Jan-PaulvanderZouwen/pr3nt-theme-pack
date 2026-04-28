# pr3nt quote endpoint

Een simpele backend voor het mooie 2-stappen offerteformulier in het Shopify-theme.

## Wat doet deze endpoint?

- Ontvangt formulierdata en 3D-bestand via `multipart/form-data`.
- Controleert bestandstype: `.stl`, `.3mf`, `.obj`, `.step`, `.stp`.
- Limiet: 25 MB.
- Stuurt een mail naar `bestellingen@pr3nt.nl`.
- Stuurt een bevestigingsmail naar de klant.
- Geeft een redirect URL terug naar `/pages/offerte-aanvraag-ontvangen`.
- Kan optioneel bestanden opslaan in Cloudflare R2.

## Deploy via Cloudflare Workers

```bash
cd apps/pr3nt-quote-endpoint
npm install
npx wrangler login
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

## E-mail via Resend

Maak een gratis Resend-account aan en verifieer je domein of gebruik tijdelijk een test-afzender.

Benodigde secret:

```bash
npx wrangler secret put RESEND_API_KEY
```

## Uploadbestanden bewaren

Zonder R2 wordt het bestand technisch ontvangen en gevalideerd, maar niet permanent opgeslagen. Voor echte offerteverwerking is R2 aanbevolen.

```bash
npx wrangler r2 bucket create pr3nt-quotes
```

Daarna in `wrangler.toml` uncommenten:

```toml
[[r2_buckets]]
binding = "QUOTE_FILES"
bucket_name = "pr3nt-quotes"
```

Optioneel kun je een publieke R2 base URL als secret of var instellen met `R2_PUBLIC_BASE_URL`.

## Shopify koppeling

Na deploy krijg je een endpoint URL, bijvoorbeeld:

```text
https://pr3nt-quote-endpoint.<jouw-account>.workers.dev
```

Vul deze URL in bij de quote-sectie in Shopify zodra de theme-code is aangepast voor `quote_endpoint_url`.
