# pr3nt Shopify Theme Pack

Dit ZIP-bestand is een minimalistisch, mobile-first Shopify Online Store 2.0 theme-pack voor pr3nt.nl.

## Inhoud

- Eigen layout zonder Dawn-overhead
- Modulaire sections voor homepage
- Header en footer apart
- Winkelmandje
- Productpagina
- Collectiepagina
- 404-pagina
- Blogoverzicht en blogartikel-layout
- Klantlogin, registratie, reset password en accountpagina's voor classic customer accounts
- Klantportaal-template: `/pages/portal`
- Statusbalk voor orders
- 3D model viewer op portaal via order-metafield `pr3nt.model_url`

## Belangrijke Shopify-beperkingen

### Bestandsuploads
Shopify contactformulieren zijn niet geschikt om 3D-bestanden betrouwbaar als bijlage naar e-mail te sturen. De theme-code valideert wel `.stl`, `.3mf`, `.obj`, `.step` en `.stp`, maar voor productie is een upload-app of eigen backend endpoint nodig.

Aanbevolen backend-flow:
1. Formulier uploadt bestand naar eigen endpoint of app.
2. Backend slaat bestand op in private storage.
3. Backend mailt `bestellingen@pr3nt.nl`.
4. Backend maakt of koppelt klantaccount.
5. Backend maakt draft order/offerte.
6. Backend vult klant/order-metafields voor dashboard.

### Offertes, facturen en betaling
Gebruik Shopify Draft Orders. Draft orders kunnen een betaalbare factuur met secure checkout link versturen. De portal kan zo'n link tonen via metafield `pr3nt.quote_url` of `pr3nt.invoice_url`.

### Customer accounts
Nieuwe Shopify customer accounts zijn beperkt aanpasbaar via theme Liquid. Voor een volledig portaal met eigen pagina's, statusupdates, offertes accepteren en facturen is een custom app of customer account extension nodig. Dit theme bevat een storefront/Classic-account variant en een portal-pagina die data toont als je metafields vult.

## Benodigde metafields

Maak bij voorkeur deze metafields aan op Order of Customer niveau:

- `pr3nt.status` — tekst, een van:
  - Order ontvangen met orderdetails
  - Offerte wordt aangemaakt
  - Offerte verstuurd
  - Betaling voltooid
  - Print in queue
  - Print is klaar voor verzending
  - Print is verzonden
  - Print is geleverd
- `pr3nt.quote_url` — URL naar offerte/acceptatiepagina of draft order invoice
- `pr3nt.invoice_url` — URL naar factuur
- `pr3nt.model_url` — URL naar GLB/GLTF model voor 3D viewer

Let op: STL kan niet direct in `<model-viewer>` worden getoond. Converteer modellen voor het dashboard naar GLB/GLTF.

## Mail naar bestellingen@pr3nt.nl

Liquid kan de ontvanger van Shopify contactformulieren niet per formulier afdwingen. Zet je Shopify contact/sender e-mail of automation zo dat offerteaanvragen naar `bestellingen@pr3nt.nl` gaan, of gebruik een eigen endpoint.

## Installatie

1. Upload dit ZIP-bestand als theme in Shopify Admin > Online Store > Themes.
2. Publiceer het theme of open de theme editor.
3. Maak een pagina aan met handle `portal` en template `page.portal`.
4. Voeg eventueel foto's toe in de sections via de theme customizer.
5. Koppel een backend/upload-app voordat je echte STL/3MF/OBJ/STEP/STP uploads live zet.

## Aanbevolen backend

Voor de gevraagde portalfunctionaliteit is dit de minimale app/automation:

- Endpoint `/quote-request` ontvangt formulier + bestand.
- Upload naar private S3/R2/Drive bucket.
- Mail notificatie naar `bestellingen@pr3nt.nl`.
- Maak klant aan of vind bestaande klant via e-mail.
- Verstuur account invite/login link.
- Maak draft order wanneer offerte klaar is.
- Verstuur draft order invoice.
- Schrijf `pr3nt.status`, `pr3nt.quote_url`, `pr3nt.invoice_url`, `pr3nt.model_url` naar metafields.

Dit theme is voorbereid op die koppeling, maar doet backend-acties niet zelf.
