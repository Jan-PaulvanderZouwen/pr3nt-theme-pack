# Quote form UX update

Doel: het offerteformulier minder overweldigend maken zonder Shopify-content of tracking aan te passen.

## Nieuwe flow

1. Bestand of idee
   - Eerste scherm toont vooral de upload.
   - De keuze `Ik heb een 3D-bestand` / `Alleen een idee/foto` is kleiner en ondergeschikt gemaakt.

2. Materiaal & kleur
   - PLA/PETG en kleur staan nu pas in stap 2.

3. Formaat & snelheid
   - Oppervlak en spoed staan nu pas in stap 3.

4. Gegevens
   - Samenvatting, contactgegevens, verzendadres en verzenden staan in de laatste stap.

## Technisch

- `snippets/pr3nt-quote-form.liquid` bevat nu de rustige 4-staps opbouw.
- `assets/pr3nt.js` ondersteunt meerdere stappen, terugknoppen en validatie per stap.
- `assets/pr3nt-form-progress.js` slaat formulieren met `data-p-native-steps` over, zodat de oude 3-staps-helper geen velden meer verplaatst.

## Bewust niet aangepast

- Geen tracking toegevoegd of gewijzigd.
- Geen Shopify homepage/content teksten aangepast.
- Geen betaallinks of app-endpoint aangepast.
