# pr3nt Shopify Quote App

Een eenvoudige Node/Express app voor de pr3nt offerteflow.

## MVP functionaliteit

- Ontvangt het mooie 2-stappen offerteformulier via `/api/quote`.
- Ontvangt 3D-bestanden: `.stl`, `.3mf`, `.obj`, `.step`, `.stp`.
- Maakt of vindt een Shopify customer op basis van e-mailadres.
- Probeert een Shopify metaobject aan te maken voor de offerte-aanvraag.
- Slaat elke aanvraag lokaal op in `data/quotes.json` als fallback.
- Bewaart uploads lokaal in `uploads/quotes`.
- Mailt jou via TransIP SMTP.
- Mailt de klant een bevestiging.

## Installatie lokaal

```bash
cd apps/pr3nt-shopify-quote-app
npm install
cp .env.example .env
npm run setup:dirs
npm run dev
```

Test daarna:

```bash
curl http://localhost:3000/health
```

## Benodigde Shopify custom app rechten

Maak in Shopify een custom app aan met Admin API access token.

Benodigde scopes voor MVP:

```text
read_customers
write_customers
read_metaobjects
write_metaobjects
```

Later nodig voor offerte/betaling:

```text
read_draft_orders
write_draft_orders
read_orders
write_orders
```

## TransIP SMTP

Gebruik in `.env`:

```env
SMTP_HOST=smtp.transip.email
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=bestellingen@pr3nt.nl
SMTP_PASS=je-mailbox-wachtwoord
```

## Shopify metaobject

Maak in Shopify een metaobject definition aan met type:

```text
pr3nt_quote_request
```

Velden:

```text
quote_id single_line_text_field
status single_line_text_field
status_label single_line_text_field
customer_id single_line_text_field
name single_line_text_field
email single_line_text_field
phone single_line_text_field
material single_line_text_field
color single_line_text_field
rush single_line_text_field
note multi_line_text_field
file_name single_line_text_field
file_url url
created_at date_time
```

Als het metaobject nog niet bestaat, werkt de app alsnog: de aanvraag wordt lokaal opgeslagen en de mail wordt verzonden.

## Endpoint in Shopify invullen

Als de app draait op bijvoorbeeld:

```text
https://app.pr3nt.nl
```

Vul in Shopify bij de sectie **pr3nt offerteblok** het veld **Offerte-app endpoint URL** in met:

```text
https://app.pr3nt.nl/api/quote
```

## VPS deployment korte versie

Op een TransIP VPS:

```bash
git clone https://github.com/Jan-PaulvanderZouwen/pr3nt-theme-pack.git
cd pr3nt-theme-pack/apps/pr3nt-shopify-quote-app
npm install --omit=dev
cp .env.example .env
nano .env
npm run setup:dirs
npm start
```

Gebruik daarna bijvoorbeeld PM2 en Nginx reverse proxy.
