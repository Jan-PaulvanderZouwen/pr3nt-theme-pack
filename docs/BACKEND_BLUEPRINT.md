# pr3nt backend blueprint

De Shopify theme-laag kan de schermen tonen, maar de volgende acties vereisen een app, automation of externe backend:

## Quote request flow

1. Ontvang formulier + 3D-bestand via upload endpoint.
2. Sla bestand privé op, bijvoorbeeld S3/R2/Drive, niet publiek in Shopify Files.
3. Mail aanvraag naar bestellingen@pr3nt.nl.
4. Zoek of maak klant op basis van e-mail.
5. Verstuur account invite/login-link.
6. Maak een Draft Order zodra de offerte klaar is.
7. Verstuur Draft Order invoice met betaalbare checkout-link.
8. Schrijf metafields naar klant/order zodat het portal de status toont.

## Metafields

Namespace: `pr3nt`

Order metafields:
- `status` single line text
- `quote_url` URL
- `invoice_url` URL
- `model_url` URL naar GLB/GLTF
- `internal_notes` multi-line text, niet tonen aan klant tenzij gewenst

## Statuswaarden

- Order ontvangen met orderdetails
- Offerte wordt aangemaakt
- Offerte verstuurd
- Betaling voltooid
- Print in queue
- Print is klaar voor verzending
- Print is verzonden
- Print is geleverd

## 3D viewer

Het dashboard gebruikt `<model-viewer>`. Converteer STL/STEP/OBJ naar GLB of GLTF voor browserweergave.

## Aanbevolen technische routes

- Snel: Shopify upload app + Shopify Flow/Make/Zapier voor e-mails.
- Professioneel: custom Shopify app met Admin API en Customer Account UI Extension.
- Low-code: Airtable/Make als offerte-dashboard + Draft Orders in Shopify.
