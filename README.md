# Werpfährtmich?

Vermittlungsplattform für Pferdetransporte. Reiter stellen Anfragen,
Fahrer geben aktiv Angebote ab. Läuft komplett im Browser (statisch)
und nutzt **Supabase** für Anmeldung, Datenbank und Datei-Uploads.

---

## Was du brauchst

- Ein kostenloses **GitHub**-Konto (für das Hosting)
- Ein kostenloses **Supabase**-Konto (für Anmeldung + Datenbank)
- Keinen eigenen Server, keine Programmierkenntnisse für die Einrichtung

Plane etwa 20–30 Minuten für die einmalige Einrichtung.

---

## Schritt 1 — Supabase-Projekt anlegen

1. Auf https://supabase.com registrieren und einloggen.
2. **"New project"** klicken. Namen vergeben (z. B. `werpfaehrtmich`),
   ein Datenbank-Passwort setzen (aufschreiben!), Region **Central EU
   (Frankfurt)** wählen — das ist für deutsche Nutzer am schnellsten und
   datenschutzfreundlich.
3. Warten, bis das Projekt bereit ist (ca. 2 Minuten).

## Schritt 2 — Datenbank einrichten

1. In Supabase links auf **"SQL Editor"** klicken, dann **"New query"**.
2. Den **gesamten Inhalt** der Datei `supabase-schema.sql` (liegt in
   diesem Projekt) hineinkopieren.
3. **"Run"** klicken. Es sollte "Success" erscheinen. Damit sind alle
   Tabellen, Sicherheitsregeln und der Dokumenten-Speicher angelegt.

## Schritt 3 — Anmelde-Einstellungen

1. Links auf **"Authentication"** -> **"Sign In / Providers"**.
2. **"Email"** ist standardmäßig aktiv — das genügt (E-Mail + Passwort).
3. **Wichtig für den Anfang:** Unter **"Authentication" -> "Sign In /
   Providers" -> "Email"** gibt es die Option **"Confirm email"**.
   - **Zum Testen** kannst du sie **ausschalten** — dann sind neue Nutzer
     sofort angemeldet, ohne Bestätigungs-E-Mail.
   - **Für den echten Betrieb** solltest du sie **einschalten**, damit nur
     Leute mit gültiger E-Mail ein Konto bekommen. Die App zeigt in dem
     Fall automatisch den Hinweis "Bitte bestätige deine E-Mail".

## Schritt 4 — Deine Zugangsdaten eintragen

1. In Supabase links auf das **Zahnrad** (Project Settings) -> **"API"**.
2. Du brauchst zwei Werte von dort:
   - **"Project URL"**
   - **"Project API keys" -> "anon" "public"** (NICHT den `service_role`!)
3. Öffne die Datei `js/config.js` in diesem Projekt und trage beide Werte
   ein:

   ```js
   window.WPM_CONFIG = {
     SUPABASE_URL: 'https://deinprojekt.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGci...dein-langer-key...',
   };
   ```

   > Der `anon`-Key darf öffentlich im Browser stehen — das ist so
   > vorgesehen. Deine Daten sind durch die Sicherheitsregeln (Row Level
   > Security) geschützt, die in Schritt 2 eingerichtet wurden. Trage
   > **niemals** den `service_role`-Key hier ein.

## Schritt 5 — Auf GitHub hochladen

1. Auf https://github.com ein **neues Repository** anlegen (z. B.
   `werpfaehrtmich`), Sichtbarkeit **Public**.
2. Alle Dateien dieses Projekts hochladen (per Drag & Drop im Browser auf
   "uploading an existing file", oder per Git). Die Struktur muss so
   bleiben:

   ```
   index.html
   styles.css
   supabase-schema.sql
   README.md
   js/
     config.js   <- mit deinen Werten
     icons.js
     api.js
     app.js
   ```

## Schritt 6 — GitHub Pages aktivieren

1. Im Repository oben auf **"Settings"** -> links **"Pages"**.
2. Unter **"Build and deployment" -> "Source"**: **"Deploy from a branch"**.
3. Branch **`main`** wählen, Ordner **`/ (root)`**, **"Save"**.
4. Nach ein bis zwei Minuten erscheint oben die Adresse deiner Seite,
   z. B. `https://deinname.github.io/werpfaehrtmich/`.

## Schritt 7 — Domain in Supabase erlauben

Damit die Anmeldung von deiner GitHub-Pages-Adresse aus funktioniert:

1. In Supabase: **"Authentication" -> "URL Configuration"**.
2. Bei **"Site URL"** deine GitHub-Pages-Adresse eintragen.
3. Dieselbe Adresse zusätzlich unter **"Redirect URLs"** hinzufügen.

Fertig. Ruf deine Seite auf, registriere dich, und die App läuft mit
echter Datenbank.

---

## Testlauf-Empfehlung

1. Registriere zwei Konten (z. B. mit zwei E-Mail-Adressen) — eins als
   Reiter, eins als Fahrer.
2. Fülle beim Fahrer-Konto das **Fahrer-Profil** aus (Standort, Fahrzeug,
   Preise, Verfügbarkeit, Zahlungsarten, Dokumente). Der Standort ist
   Pflicht — darüber finden Reiter den Fahrer im Umkreis.
3. Stelle mit dem Reiter-Konto eine Anfrage.
4. Wechsle zum Fahrer-Konto: Die Anfrage sollte unter "Passende Anfragen"
   erscheinen (sofern Umkreis, Zeit und Kapazität passen).

---

## Wichtige Hinweise

**Kartendienste.** Die Adresssuche (Nominatim) und Routenberechnung
(OSRM) nutzen die kostenlosen öffentlichen Server von OpenStreetMap.
Für einen echten, stark genutzten Betrieb haben diese Nutzungslimits —
dann solltest du einen eigenen oder bezahlten Dienst (z. B. Mapbox)
einbinden. Die Kartenkacheln kommen von CARTO.

**Stornofenster.** In `supabase-schema.sql` ist das Stornofenster nach
Annahme auf 10 Minuten gesetzt (`cancel_window_ms` = 600000). Das ist
der Produktivwert.

**Rechtliches — bitte ernst nehmen.** Sobald echte Nutzer echte Daten
hinterlegen (Namen, Telefonnummern, hochgeladene Ausweisdokumente),
brauchst du vor dem öffentlichen Start:
- ein **Impressum**,
- eine **Datenschutzerklärung** (DSGVO), gerade wegen der
  Dokument-Uploads (das sind besonders sensible Daten),
- klare **Haftungs- und Nutzungsbedingungen**.

Das ist keine Rechtsberatung. Lass diese Punkte vor dem Livegang von
einer Fachanwältin oder einem Fachanwalt prüfen.

---

## Aufbau des Codes (zur Orientierung)

- **`index.html`** — lädt die Bibliotheken (Leaflet, Supabase) und die
  App-Dateien.
- **`js/config.js`** — deine Supabase-Zugangsdaten.
- **`js/api.js`** — die gesamte Kommunikation mit Supabase (Anmeldung,
  Datenbank, Datei-Upload). Auch Adresssuche und Routing.
- **`js/app.js`** — die Benutzeroberfläche und Abläufe (Anfragen,
  Angebote, Fahrt-Lebenszyklus, Bewertungen).
- **`js/icons.js`** — die Symbole (SVG).
- **`styles.css`** — das komplette Design.
- **`supabase-schema.sql`** — die Datenbankstruktur (einmalig ausführen).

## Neue Storno- und Zuverlässigkeitslogik

Die aktuelle App-Version enthält:

* ein kostenloses 10-Minuten-Stornofenster nach Annahme,
* verpflichtende Begründung jeder Absage nach Ablauf dieses Fensters,
* Stornokategorien von „frühzeitig abgesagt“ bis „nicht erschienen“,
* Fahrer-seitig frei definierbare Stornobedingungen je Zeitraum,
* Speicherung der zum Zeitpunkt des Angebots geltenden Stornobedingungen,
* kompakte Zuverlässigkeitsangabe direkt im Angebot,
* detaillierte Zuverlässigkeitsstatistik ausschließlich im Profil,
* verpflichtende Fahrzeugangaben sowie Führerschein und Transport-Nachweis für aktive Fahrerprofile.

### Datenbank

Bei einer bestehenden Supabase-Datenbank zuerst `supabase-migration-cancellation.sql` ausführen. Für eine neue Installation ist die aktualisierte `supabase-schema.sql` enthalten.
