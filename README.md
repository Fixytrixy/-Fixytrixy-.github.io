# -Fixytrixy-.github.io
# Fixaotrixa – Sveriges Största E-handel för Förvaringsprodukter

## 🎯 Projektöversikt

Bygg en fullständigt utvecklad, SEO-optimerad svensk e-handel som säljer förvaringsprodukter till hemmet via Amazon-integration (dropshipping). Målet är att bli **Sveriges ledande destination** för smarta förvaringslösningar inom kök, sovrum, badrum och trädgård.

---

## 🛒 Affärsmodell

- **Plattform:** Shopify
- **Fulfillment:** Amazon-produkter via dropshipping
- **Målmarknad:** Sverige (primärt), Norden (sekundärt)
- **Valuta:** SEK
- **Språk:** Svenska

---

## 📋 Vad du ska bygga – fullständig kravlista

### 1. Amazon-produktintegration
- Integrera med **Amazon Product Advertising API** för att automatiskt hämta produkter
- Hämta de **bäst säljande och högst betygsatta** förvaringsprodukterna per kategori
- Kategorier att täcka:
  - Köksförvaring (skåporganisatörer, kryddhyllor, skafferikorgar, diskställ)
  - Sovrumsförvaring (garderobsorganisatörer, lådinsatser, sängbordsförvaring)
  - Badrumsförvaring (duschhyllor, sminkorganisatörer, underskåpsförvaring)
  - Trädgårdsförvaring (redskapsförråd, utomhusboxar, cykellådor)
  - Hallförvaring (skoställ, krokpaneler, entréhyllor)
  - Kontorsförvaring (skrivbordsorganisatörer, kabelhantering, hyllsystem)
- Automatisk prisuppdatering från Amazon
- Produktbilder hämtas direkt från Amazon CDN
- Filtrera bort produkter med under 4,0 stjärnor och färre än 50 recensioner

### 2. SEO – Fullständig implementation
- **Teknisk SEO:**
  - Unik meta-title och meta-description per produktsida och kategorisida
  - Schema.org strukturerad data (Product, BreadcrumbList, FAQPage, Organization)
  - Canonical URL:er på alla sidor
  - XML-sitemap som uppdateras automatiskt
  - robots.txt optimerad för Googlebot
  - Core Web Vitals optimerade (LCP, FID, CLS)
  - Lazy loading på alla bilder
  - WebP-format på alla bilder
  - Hreflang-taggar för sv-SE

- **On-page SEO:**
  - H1–H4 hierarki med sökordsrika rubriker på varje sida
  - Långa produktbeskrivningar (minst 300 ord per produkt) på svenska
  - Interna länkstrukturer mellan relaterade produkter och kategorier
  - Breadcrumbs på alla sidor
  - FAQ-sektioner med vanliga sökfrågor per kategori

- **Innehålls-SEO:**
  - Bloggsystem med artiklar om förvaring och organisering (minst 10 startartiklar)
  - Artikelämnen: "Bästa förvaringslösningarna för små kök", "Så organiserar du garderoben", osv.
  - Sökordsanalys och implementering för svenska söktermer

### 3. Konverteringsoptimering (CRO)

- **Startsida:**
  - Hero-sektion med tydligt problemformulering (rörigt hem) och lösning (organiserat hem)
  - Före/efter-bilder som visar transformation
  - Interaktivt quiz: "Vilket rum ska vi fixa?" → leder till rätt kategori
  - Bäst-säljande produkter synliga inom 3 sekunder
  - Socialt bevis: antal kunder, betyg, recensioner
  - Trust-signaler: fri frakt, öppet köp, säker betalning

- **Produktsidor:**
  - Stora produktbilder med zoom
  - Tydlig prissättning med ev. jämförelsepris
  - Lagerindikator ("Få kvar!")
  - Kundrecensioner från Amazon
  - "Köpte även"-rekommendationer
  - Tydlig CTA-knapp (Köp nu / Lägg i varukorg)
  - Leveransinformation direkt på sidan
  - 30-dagars returgaranti framhävd

- **Checkout-optimering:**
  - Enstegs-checkout
  - Klarna, Swish och kort som betalmetoder
  - Spara kundvagn automatiskt
  - Exit-intent popup med rabattkod

- **E-postflöden:**
  - Välkomstmail med 10% rabatt
  - Övergiven kundvagn (3-stegs flöde)
  - Orderbekräftelse
  - Uppföljning efter köp + recension-request

### 4. Kundanalys & Målgruppsdefinition

Implementera analys för att identifiera och nå rätt målgrupp:

- **Primär målgrupp:**
  - Ålder: 28–55 år
  - Kön: Primärt kvinnor (60%), men inkludera män aktivt
  - Livssituation: Barnfamiljer, nyinflyttade, hemmakontor
  - Geografi: Storstäder (Stockholm, Göteborg, Malmö) primärt
  - Intressen: Inredning, hem & trädgård, minimalism, hållbarhet

- **Analysverktyg att integrera:**
  - Google Analytics 4 med e-handelsspårning
  - Google Search Console
  - Meta Pixel för Facebook/Instagram-annonser
  - TikTok Pixel
  - Hotjar eller Microsoft Clarity (heatmaps och sessionsupspelning)
  - Klaviyo för e-postanalys

- **Segmentering:**
  - Besökare som tittar på specifika kategorier
  - Återkommande kunder
  - Kunder som övergett kundvagnen
  - Kunder per stad/region

### 5. Bildstrategi & Visuell kommunikation

- **Hero-bilder:** Visa röriga hem (problem) vs. organiserade hem (lösning)
- **Kategoribilder:** Stilrena, skandinaviskt inspirerade livsstilsbilder
- **Produktbilder:** Amazon-bilder + lifestyle-bilder i hemiljö
- **Infografik:** "Visste du att..."-fakta om förvaring och ordning
- **Before/After-galleri:** Verkliga transformationer från kunder
- Alla bilder ska vara komprimerade till WebP, max 150kb per bild

### 6. Teknisk stack

```
Plattform:        Shopify (PagePilot.ai tema)
Version control:  GitHub
CMS/Headless:     Shopify Liquid + JSON templates
CSS:              Custom CSS + Shopify Dawn-bas
JavaScript:       Vanilla JS + Shopify AJAX API
E-post:           Klaviyo
Analytics:        Google Analytics 4 + Meta Pixel
Amazon API:       Amazon Product Advertising API 5.0
Bildoptimering:   Shopify CDN (automatisk WebP)
Betallösningar:   Klarna, Swish, Visa/Mastercard
```

### 7. Sidstruktur & URL-hierarki

```
/ (Startsida)
/collections/koksforvaring
/collections/sovrumsforvaring
/collections/badrumsforvaring
/collections/tradgardsforvaring
/collections/hallforvaring
/collections/kontorsforvaring
/collections/all
/products/[produktnamn]
/pages/om-oss
/pages/kontakt
/pages/frakt-och-retur
/pages/integritetspolicy
/blogs/forvaringstips
/blogs/forvaringstips/[artikelnamn]
```

### 8. Marknadsföring & Trafikdrivning

- **Google Shopping:** Produktfeed via Google Merchant Center
- **Meta-annonser:** Dynamiska produktannonser mot Swedish audiences
- **TikTok:** Före/efter-videos med förvaringslösningar (viral potential)
- **Pinterest:** Inspirationsbrädor för varje rum
- **Influencer-samarbeten:** Svenska heminspirationskonton på Instagram
- **SEO-blogg:** Minst 2 artiklar per vecka om organisering och förvaring

---

## 🚀 Kom igång – installationsordning

1. Klona detta repository till din lokala miljö
2. Koppla till Shopify via Shopify CLI (`shopify theme dev`)
3. Konfigurera Amazon Product Advertising API-nycklar i `.env`
4. Kör produktimportscriptet för att populera butiken
5. Konfigurera Klarna och Swish i Shopify Payments
6. Lägg till Google Analytics 4 och Meta Pixel
7. Aktivera Klaviyo och konfigurera e-postflöden
8. Kör SEO-checklistan innan lansering
9. Skicka sitemap till Google Search Console

---

## 📁 Filstruktur

```
├── assets/
│   ├── fixaotrixa-home.css
│   ├── fixaotrixa-home.js
│   └── quiz.js
├── layout/
│   └── theme.liquid
├── sections/
│   ├── fixaotrixa-home.liquid
│   ├── hero-banner.liquid
│   ├── category-grid.liquid
│   ├── quiz-section.liquid
│   ├── did-you-know.liquid
│   └── testimonials.liquid
├── templates/
│   ├── index.json
│   ├── product.liquid
│   └── collection.liquid
├── scripts/
│   └── amazon-product-importer.js
├── .env.example
└── README.md
```

---

## 🔑 Miljövariabler (.env)

```
AMAZON_ACCESS_KEY=din_nyckel_här
AMAZON_SECRET_KEY=din_hemliga_nyckel_här
AMAZON_PARTNER_TAG=fixaotrixa-21
SHOPIFY_STORE_URL=xivfqd-hz.myshopify.com
SHOPIFY_ACCESS_TOKEN=din_token_här
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
META_PIXEL_ID=XXXXXXXXXXXXXXXXX
KLAVIYO_API_KEY=din_klaviyo_nyckel
```

---

## ✅ SEO-checklista före lansering

- [ ] Meta-title och description på alla sidor
- [ ] Schema.org på produkt- och kategorisidor
- [ ] Sitemap.xml inlämnad till Google Search Console
- [ ] robots.txt konfigurerad
- [ ] Alla bilder har alt-texter på svenska
- [ ] Core Web Vitals godkänt (LCP under 2,5s)
- [ ] HTTPS aktiverat
- [ ] 404-sida anpassad
- [ ] Interna länkar fungerande
- [ ] Google Analytics 4 verifierat

---

## 📊 KPI:er att följa

| Mått | Mål (månad 3) | Mål (månad 12) |
|------|--------------|----------------|
| Månatliga besökare | 5 000 | 50 000 |
| Konverteringsgrad | 2% | 3,5% |
| Genomsnittligt ordervärde | 350 kr | 450 kr |
| Månatlig omsättning | 35 000 kr | 787 500 kr |
| Organisk trafik (andel) | 20% | 55% |
| E-postlista | 500 | 10 000 |
| Betyg på Trustpilot | 4,5+ | 4,8+ |

---

## 📞 Kontakt & Support
