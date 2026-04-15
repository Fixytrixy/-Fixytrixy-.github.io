# Fixaotrixa – Fullständig butiksoptimering

Du är en senior Shopify-utvecklare, SEO-specialist, CRO-expert och e-handelsstrateg. 
Ditt uppdrag är att bygga, fixa och optimera hela Fixaotrixa – en svensk dropshipping-butik 
för hemförvaring – från grund till lansering. Allt ska vara i Liquid och fullt kompatibelt 
med Shopify. Arbeta metodiskt uppifrån och ned. Fråga inte i onödan – ta beslut som en expert.

---

## 1. STARTSIDA – DUBBLETTRENSNING & MOBILANPASSNING

- Det finns två startsidor laddade på samma URL. Behåll ENBART den som visas högst upp. 
  Ta bort eller inaktivera den andra helt (kontrollera index.json och sections/).
- Mobilanpassning:
  - Inga bilder ska täcka hela mobilskärmen (max 50–60vh på mobil).
  - Hero-sektionen ska visa bild + rubrik + CTA synligt utan att användaren behöver scrolla.
  - Produktkategorier ska visas i ett 2-kolumners grid på mobil, inte ett per rad.
  - Typsnitt ska skalas korrekt (clamp() eller responsiva klasser).
  - Touch-targets (knappar, länkar) ska vara minst 44px höga.
  - Testa och fixa alla breakpoints: 375px, 390px, 430px, 768px.

---

## 2. NAVIGATION – DROPDOWN & HOVER-MENY

- Implementera en fungerade dropdown-meny för alla "stora" produktkategorier i headern.
- På desktop: dropdown visas vid hover med en smooth CSS transition (0.2s ease).
- På mobil: dropdown visas vid tap med accordion-stil (ingen hover).
- Kategorier som ska ha dropdown: Kök, Badrum, Sovrum, Garderob, Hall (anpassa efter 
  befintlig menystruktur).
- Dropdown ska innehålla: underkategorier + en "Visa alla"-länk.
- Kontrollera att alla meny-URLs pekar på rätt collection-handtag i Shopify.

---

## 3. PRODUKTER – KORRIGERING & BILDMATCHNING

- Gå igenom alla befintliga produkter:
  - Fixa saknade eller trasiga produktbilder – matcha med korrekt produktbild.
  - Kontrollera att produkttitlar, beskrivningar och priser är korrekt ifyllda.
  - Se till att varje produkt är kopplad till rätt kollektion.
- Produktkategorisidor (collections):
  - Varje kollektion ska ha ett representativt hero-banner/bild som matchar kategorin.
  - Använd lifestyle-bilder för kategorier (t.ex. ett välorganiserat kök för Kök-kategorin).
- Fixa ALLA trasiga interna länkar (404-kontroll på alla navigation-items, knappar och 
  collection-links).

---

## 4. PRODUKTIMPORT – 100 PRODUKTER FRÅN AMAZON

Importera 100 produkter som passar Fixaotrixa (hemförvaring, organisation):

Rekommenderade kategorier att hämta från:
- Förvaringslådor & korgar (plast, rotting, tyg)
- Köksorganisatörer (kryddhyllor, lådinlägg, kylskåpsorganisatörer)
- Garderobssystem (hängare, skoförvaring, lådor)
- Badrumsförvaring (sminkorganisatörer, duschkorgar, underskåpslösningar)
- Skrivbordsförvaring (pennställ, dokumenthållare, kabelhållare)
- Hallförvaring (nyckelkrokar, entréhyllor, skoförvaring)

Instruktioner:
- Kontrollera om appen "Amazon Importer by Spreadr" (gratis grundplan) eller liknande 
  gratis Shopify-app finns tillgänglig – använd i så fall den.
- Om ingen app finns: skapa en CSV-fil i Shopify-importformat (products_import.csv) med 
  100 produkter inklusive: Title, Body (HTML), Vendor, Type, Tags, Published, 
  Option1 Name, Option1 Value, Variant Price, Variant Compare At Price, Image Src, 
  SEO Title, SEO Description.
- Varje produkt ska ha:
  - SEO-optimerad titel på svenska (innehåller primärt sökord)
  - Säljande produktbeskrivning på svenska (150–300 ord, fördelar först, nyckelord naturligt inbakade)
  - Minst 3 relevanta taggar
  - Korrekt kollektion
  - Pris satt med ~40–60% marginal mot Amazon-pris (eller AliExpress-motsvarighet)

---

## 5. SEO – SÖKORDS­ANALYS & OPTIMERING

Analysera befintliga sökord i butiken och utöka med nya:

Kriterier för nya sökord:
- Hög sökvolym (>500/mån i Sverige)
- Lägre konkurrens (KD under 30 om möjligt)
- Köpintention (transaktionella fraser som "köp", "bästa", "billig", "online")

Sökord att prioritera (exempel, bygg vidare):
- "förvaringslådor hem"
- "köksorganisatör billig"
- "garderob organizer IKEA alternativ"
- "skoförvaring hall"
- "förvaring badrum"

Implementering:
- Uppdatera meta title och meta description på: startsidan, alla collections, topp-20 produkter.
- Lägg till ALT-texter på alla produktbilder (svenska, beskrivande, innehåller sökord).
- Lägg till schema.org Product markup på produktsidor.
- Lägg till BreadcrumbList schema på alla sidor.
- Skapa en sitemap.xml och robots.txt (om de saknas eller är felaktiga).

---

## 6. LANDNINGSSIDOR SOM KONVERTERAR

Skapa följande landningssidor som Shopify pages (templates i Liquid):

1. **Kategori-landningssida** (mall, används för varje rumskategori):
   - Hero med rubrik + underrubrik + CTA-knapp
   - "Varför välja oss"-sektion (3 ikoner med text)
   - Produktgrid (4–8 produkter, filtrerbara)
   - Kundrecensioner (2–3 st)
   - FAQ-sektion (3–5 frågor, schema.org FAQPage markup)

2. **Allmän landningssida för hemförvaring**:
   - URL: /pages/hemforvaring
   - Riktar sig mot sökordet "hemförvaring" och varianter
   - Innehåll: intro-text, kategorikort, bästsäljare, trust-signals

3. **Kampanjsida** (mall för framtida REAs):
   - Countdown-timer
   - Rabatterade produkter i grid
   - Urgency-copy på svenska

---

## 7. KASSAFLÖDE – OPTIMERING AV CART → CHECKOUT

- Lägg till "Du kanske också gillar" (upsell) i kundvagnen – baserat på kollektion.
- Lägg till fraktindikator i kundvagnen: "Handla för X kr till för fri frakt!" 
  (om fri frakt är aktiverat i Shopify).
- Kontrollera att checkout är på svenska (Shopify language settings).
- Lägg till trust-badges nära "Lägg i varukorg"-knappen på produktsidor: 
  "Säker betalning", "Snabb leverans", "30 dagars öppet köp".
- Se till att produktsidans "Köp nu"-knapp är synlig utan scroll på mobil (sticky ATC).
- Aktivera "Shopify Pay / Shop Pay" om inte redan gjort.
- Lägg till produktrecensioner-sektion på alla produktsidor (använd gratis appen 
  "Product Reviews" av Shopify om inte redan installerad).

---

## 8. PRODUKTSIDOR SOM SÄLJER

Varje produktsida ska innehålla:
- Titel med primärt sökord
- Bildgalleri (min 3 bilder, zoom på hover/tap)
- Stjärnbetyg synligt under titeln
- Pris med "Ord. pris" struken bredvid (compare at price)
- "Lägg i varukorg"-knapp i konverteringsfärg (CTA-grön eller accent-färg)
- Bullet-punkter med 4–6 produktfördelar (ovanför beskrivning)
- Fullständig produktbeskrivning med nyckelord
- FAQ-sektion (3 frågor, schema.org markup)
- "Relaterade produkter" (4 st, från samma kollektion)
- Kundrecensioner längst ned

---

## 9. TEKNISKA KRAV & PUBLISERING

- All kod ska vara giltig Liquid + HTML5 + CSS3.
- Använd Shopify-sektioner och block där möjligt för flexibilitet i temat-editorn.
- Inga inline-scripts där det kan undvikas – lägg JS i assets/.
- Testa att alla ändringar fungerar i Shopify-temat-förhandsgranskning innan push.
- Push till GitHub-repot på main-branchen (eller den aktiva theme-branchen).
- Koppla och publicera temat i Shopify via Shopify CLI eller GitHub-integrationen.
- Om en Shopify-app behövs för någon funktion: rekommendera ENBART gratisappar, 
  lista appnamn och var de installeras.

---

## 10. ÖVRIGA FÖRBÄTTRINGAR (expert-tillägg)

- Lägg till en "popup" för nyhetsbrev (visas efter 8 sekunder eller vid exit-intent) 
  med 10% rabatt som incitament. Använd Shopify Email eller Klaviyo gratisnivå.
- Lägg till en "sticky header" som krymper vid scroll på desktop.
- Lägg till en "tillbaka till toppen"-knapp på mobil.
- Kontrollera sidladdningstider – komprimera alla bilder >200kb med WebP-format.
- Lägg till Google Analytics 4 och Meta Pixel via Shopify's Customer Events (om inte gjort).
- Lägg till en "Bästsäljare"-kollektion och visa den prominent på startsidan.
- Aktivera produktfiltrering på kollektionssidor (pris, typ, sortering).

---

Börja med punkt 1 och arbeta dig nedåt. Rapportera vad du gjort efter varje avsnitt.
Flagga tydligt om något kräver manuell åtgärd (t.ex. app-installation eller 
Shopify-admininställning som inte kan göras via kod).
