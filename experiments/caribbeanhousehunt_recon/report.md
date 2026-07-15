# CaribbeanHouseHunt reconnaissance

## 1. Executive summary

CaribbeanHouseHunt's map is a public, server-rendered application shell whose actual property
cards are populated by JavaScript. The HTML exposes useful categories and filters, and a public
list-rendering script documents the expected property fields and local infinite-scroll behavior.
No listing payload or verified public API endpoint was captured within the strict eight-request
limit.

**Technical-practicality rating: Practical with limitations.** Static HTTP can retrieve the
public shell and scripts, but data completeness, the transport endpoint, and identifier stability
still need a second bounded experiment. A full scraper is not recommended yet.

## 2. What was requested

This was one read-only source-reconnaissance experiment against
`https://caribbeanhousehunt.com/curacao/map/`. It used eight public GET requests, a
`MerkadoLabs-Reconnaissance/0.1` user agent, a 15-second timeout, no retries, no browser, no
image downloads, no third-party requests, and no database access. Every request is recorded in
`request-log.json`.

## 3. What was discovered

`evidence/map-page.html` contains the map/list layout, filters, geobounds UI, and a general
`WebSite` JSON-LD object. It does not contain property records, embedded listing JSON, Next.js
data, WordPress REST links, GraphQL references, or a public API URL.

`evidence/list-view.js.txt` shows that property objects arrive through a client-side
`DataManager`. The renderer subscribes to a `dataloaded` event and then calls
`DataManager.selectItems`. This indicates client-side delivery and local selection, but the
DataManager transport itself was not retained, so no JSON/API claim can be made.

The sitemap (`evidence/sitemap.xml`) lists site pages, terms, and realtor profile pages, but no
CHH-hosted individual property URLs.

## 4. Listing types

The map has Buy and Rent transaction controls. Its property-type controls are Home, Apartment,
Lot, and Commercial. “Short term rental permitted” appears only as an amenity.

Evidence: `propertyStatus`, `home`, `apartment`, `lot`, and `commercial` controls in
`evidence/map-page.html`.

## 5. How data appears to load

The map page is not sufficient for static extraction of listings. JavaScript loads data into a
`DataManager`, after which the list module renders cards locally. The renderer expects ordinary
property objects rather than HTML fragments.

What is established:

- server HTML: shell and filters only;
- JSON-LD: site metadata only;
- client JavaScript: property rendering, filtering, sorting, and paging;
- public JSON/API, map-marker payload, GraphQL, WordPress REST, and Next.js data: not established.

The normal page therefore depends on JavaScript. This experiment did not attempt to render or
defeat that dependency with a browser.

## 6. Pagination or map-loading behavior

The list uses infinite scrolling rather than numbered links. `INITIAL_PAGE_SIZE` is 20 and
`LOAD_MORE_SIZE` is 10. Zero-based `page` and `pageSize` values are passed to
`DataManager.selectItems`; this appears to be local paging over already loaded data, not evidence
of network page parameters.

The HTML includes a “Set Search Area” geobounds selector and controls for transaction, realtor,
property type, price, bedrooms, amenities, keywords, and sort order. No latitude/longitude
bounding-box request or public filter endpoint was verified.

## 7. Possible unique listing identifier

The best current same-source candidate is the internal `id`, which the renderer uses for map
popup controls. `urlid` is also important: it is a card attribute and sort key associated with
when a listing was first detected. The page warns that a realtor recreating a listing can make it
appear newly detected, so `urlid` should not be assumed to survive source recreation.

`url_page`, the original realtor URL, is a useful fallback fingerprint. `realtor_id` is a source
identifier, not a listing identifier. Coordinates are a weak fallback because the site says
locations are approximations. None of these candidates was verified against actual records.

## 8. Available fields

The list renderer directly references:

- `id`, `urlid`;
- `property_title`, `property_type`;
- `price_usd`, `price_naf`, `price_eur`;
- `bedrooms`;
- `street`, `resort`, `neighborhood`;
- `lat`, `lng`;
- `description`;
- `realtor_id`, `realtor_name`;
- `url_page`;
- `image_url`.

Buy/rent and amenities are visible filters, but their payload keys were not captured. Bathrooms,
interior size, lot size, listing date, updated date, and availability/status were not observed.
Absence from this evidence does not prove the source never has them.

## 9. Image handling

Listing image URLs are not present in the map HTML. The renderer constructs one same-domain card
path as `/map-assets/property-images/{image_url}` and falls back to an inline SVG placeholder.
No separate thumbnail/full-size variant was observed. The constructed path has no temporary
signature, but actual values and stability were not checked.

Hotlinking looks technically possible in the narrow sense that a normal URL is placed in an
`img` element. It was not tested and should not be treated as permission. No image was requested
or downloaded.

## 10. Detail pages

No CHH-hosted individual property detail page was found in the map HTML, renderer, or sitemap.
Instead, both the card image and “View Details” action link directly to the property's original
third-party `url_page`, with UTM parameters added. Those realtor websites were not requested, so
richer fields and their URL structures were not assessed.

## 11. robots.txt and public terms

`evidence/robots.txt` applies to `User-agent: *`, has an empty `Disallow`, and references
`https://caribbeanhousehunt.com/sitemap.xml`. Technically, it does not disallow the paths used in
this experiment. Robots directives are not legal permission.

The public terms in `evidence/terms.html` were updated October 21, 2025. No explicit scraping,
crawling, bot, or automated-access clause was found. The terms say the service aggregates
external content using AI, may be inaccurate or outdated, is provided at the user's risk, must
not be used illegally or without authorization, and is governed by Curaçao law.

These are observations, not a legal conclusion. Public access, an empty robots `Disallow`, and
the absence of a specific bot clause do not establish permission to collect or reuse listings.
Copyright, database rights, third-party image rights, authorization, and Curaçao-law questions
require professional review.

## 12. Technical practicality rating

**Practical with limitations**

- **Static HTTP scraping:** practical for the shell, policies, sitemap, and public scripts; not
  enough for listing records from the captured evidence.
- **Public API:** unknown; no endpoint or response was verified.
- **JavaScript/browser dependency:** the normal UI requires JavaScript. The code suggests one
  data load followed by local filtering/paging, so a browser may not ultimately be necessary,
  but that remains unverified.
- **Data completeness:** unknown without a listing payload.
- **Identifier stability:** promising internal `id`, with `urlid` and `url_page` fallbacks, but
  none validated.
- **Images:** simple same-domain card paths appear possible; variants, stability, rights, and
  hotlink behavior remain unknown.
- **Policy/terms:** no explicit automated-access prohibition found, but material rights,
  accuracy, authorization, and jurisdiction concerns remain.

## 13. Risks and unknowns

Two successful JavaScript requests were counted but not saved because the collector initially
rejected the valid `text/javascript` content type before reading the body. The collector was
corrected, and those requests were not repeated. Consequently, the DataManager transport and
configuration are the main technical unknowns.

No listing/API payload, map marker payload, live record, CHH property detail page, third-party
realtor page, or image was collected. The site's own disclaimer says details and locations are
approximations and must be verified at the original source.

## 14. Recommended next experiment

Do not build a full scraper yet. After policy review, run one separately approved, very small
static-HTTP experiment that fetches only the public DataManager script and—only if that script
clearly exposes one—a single small listing-data response. The purpose should be limited to
verifying transport, field completeness, identifier behavior, and whether browser rendering can
be avoided.
