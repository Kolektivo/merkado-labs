"""Synthetic Keller Williams Curaçao parser fixtures (no live network)."""

DETAIL_USD_SALE = """
<html><body>
<div class="page-property-details__status">Active</div>
<h1 class="headline">Ocean View Villa</h1>
<div class="page-property-details__location">Jan Thiel</div>
<div class="page-property-details__type">For Sale - Residential</div>
<div class="page-property-details__price">USD 795.000 (EUR 693.304)<br>XCG 1.423.050</div>
<div class="option__value">3 bedroom(s)</div><div class="option__value">2.5 bathroom(s)</div>
<div class="card-agent__name"><div class="icon"></div>Jarno Ceresa</div>
<div class="card-agent__position"></div>
<div id="description" class="tabs__item">
<div class="wysiwyg">A waterfront villa.<br>Private pool.</div>
<div class="property-brochure-links"></div></div>
<div id="features" class="tabs__item"><table>
<tr><td>Neighborhood</td><td>Jan Thiel</td></tr>
<tr><td>Bedrooms</td><td>3</td></tr>
<tr><td>Full bathrooms</td><td>2</td></tr>
<tr><td>Half bathrooms</td><td>1</td></tr>
<tr><td>Land size</td><td>450 m² (4.844 Sq Ft)</td></tr>
<tr><td>Build up size</td><td>186 m²</td></tr>
</table></div></div><div id="map"></div>
<script>var mapS = { latLng: { lat: 12.085, lng: -68.880 } };</script>
<a href="https://kw-curacao.com/storage/app/uploads/public/one.jpg" data-fancybox="gallery">one</a>
<a href="https://kw-curacao.com/storage/app/uploads/public/two.jpg" data-fancybox="gallery">two</a>
<img class="card-agent__image-img" src="https://kw-curacao.com/storage/app/uploads/public/agent.jpg">
</body></html>
"""

DETAIL_TITLE_NEIGHBOURHOOD = """
<html><body>
<div class="page-property-details__status">Active</div>
<h1>Luxury Villa near Mambo Beach</h1>
<div class="page-property-details__location">Curaçao</div>
<div class="page-property-details__type">For Sale - Residential</div>
<div class="page-property-details__price">USD 500.000</div>
<div id="description" class="tabs__item">
<div class="wysiwyg">Beautiful home close to the island center.</div>
<div class="property-brochure-links"></div></div>
<div id="features" class="tabs__item"><table>
<tr><td>Neighborhood</td><td>Curaçao</td></tr>
<tr><td>Build up size</td><td>120 m²</td></tr>
</table></div></div><div id="map"></div>
</body></html>
"""

DETAIL_DESCRIPTION_NEIGHBOURHOOD = """
<html><body>
<div class="page-property-details__status">Active</div>
<h1>Spacious Family Home</h1>
<div class="page-property-details__type">For Sale - Residential</div>
<div class="page-property-details__price">USD 400.000</div>
<div id="description" class="tabs__item">
<div class="wysiwyg">Located in Piscadera with marina access.</div>
<div class="property-brochure-links"></div></div>
<div id="features" class="tabs__item"><table>
<tr><td>Build up size</td><td>140 m²</td></tr>
</table></div></div><div id="map"></div>
</body></html>
"""

DETAIL_NEIGHBOURHOOD_CONFLICT = """
<html><body>
<div class="page-property-details__status">Active</div>
<h1>Home near Jan Thiel</h1>
<div class="page-property-details__type">For Sale - Residential</div>
<div class="page-property-details__price">USD 410.000</div>
<div id="description" class="tabs__item">
<div class="wysiwyg">Quiet street in Otrobanda with city views.</div>
<div class="property-brochure-links"></div></div>
<div id="features" class="tabs__item"><table>
<tr><td>Build up size</td><td>110 m²</td></tr>
</table></div></div><div id="map"></div>
</body></html>
"""

DETAIL_UNDER_CONTRACT = """
<html><body>
<div class="page-property-details__status">Under Contract</div>
<h1>Family Home Hoenderberg</h1>
<div class="page-property-details__location">Hoenderberg</div>
<div class="page-property-details__type">For Sale - Residential</div>
<div class="page-property-details__price">USD 375.000</div>
<div id="description" class="tabs__item">
<div class="wysiwyg">Well maintained family home in Hoenderberg.</div>
<div class="property-brochure-links"></div></div>
<div id="features" class="tabs__item"><table>
<tr><td>Neighborhood</td><td>Hoenderberg</td></tr>
<tr><td>Build up size</td><td>160 m²</td></tr>
</table></div></div><div id="map"></div>
</body></html>
"""

DETAIL_LOTS = """
<html><body>
<div class="page-property-details__status">Active</div>
<h1>Ocean View Lot Harmonie</h1>
<div class="page-property-details__location">Harmonie</div>
<div class="page-property-details__type">For Sale - Lots and Land</div>
<div class="page-property-details__price">USD 220.000</div>
<div id="description" class="tabs__item">
<div class="wysiwyg">Flat lot ready for building.</div>
<div class="property-brochure-links"></div></div>
<div id="features" class="tabs__item"><table>
<tr><td>Neighborhood</td><td>Harmonie</td></tr>
<tr><td>Land size</td><td>907 m² (9.763 Sq Ft)</td></tr>
<tr><td>Build up size</td><td> m² (0 Sq Ft)</td></tr>
</table></div></div><div id="map"></div>
<script>var mapS = { latLng: { lat: 12.10, lng: -68.95 } };</script>
</body></html>
"""

DETAIL_NO_PRICE = """
<html><body><div class="page-property-details__status">Active</div>
<h1>No Price Home</h1><div class="page-property-details__location">Punda</div>
<div class="page-property-details__type">For Sale - Residential</div>
<div id="description"><div class="wysiwyg">Price on request.</div>
<div class="property-brochure-links"></div></div></body></html>
"""

DETAIL_SOLD = """
<html><body><div class="page-property-details__status">Sold</div>
<h1>Sold Condo</h1><div class="page-property-details__location">Piscadera</div>
<div class="page-property-details__type">For Sale - Residential</div>
<div class="page-property-details__price">USD 350.000</div>
<div id="description"><div class="wysiwyg">Previously listed condo.</div>
<div class="property-brochure-links"></div></div></body></html>
"""

DETAIL_RENT = """
<html><body><div class="page-property-details__status">Active</div>
<h1>Rental Apartment</h1><div class="page-property-details__location">Blue Bay</div>
<div class="page-property-details__type">For Rent - Residential</div>
<div class="page-property-details__price">USD 2.500 per month</div>
<div id="description"><div class="wysiwyg">Long-term rental.</div>
<div class="property-brochure-links"></div></body></html>
"""

DETAIL_MALFORMED = """
<html><body><h1>Broken</h1><div>No structured property fields</div></body></html>
"""

INDEX_PAGE = """
<a href="/listings/for-sale/ocean-view-villa-JC-0027">sale</a>
<a href="/listings/for-rent/rental-apartment-ID-008">rent</a>
<a href="/silent-listings/private-home-UJ32">silent</a>
"""

INDEX_SALE_RESIDENTIAL_PAGE1 = """
<html><body>
<a href="/listings/for-sale/residential">Residential</a>
<a href="/listings/for-sale/lots-and-land">Lots</a>
<a href="/listings/ocean-view-villa-JC-0027">a</a>
<a href="/listings/villa-east-jan-thiel-JvD-S046">b</a>
<a href="/listings/bungalow-001JvD">c</a>
<a href="/listings/townhouses-SR029JvD">d</a>
<a href="/listings/garden-apartment-038SR-JvD">e</a>
<a href="/silent-listings/hidden-UJ99">silent</a>
<a href="https://example.com/listings/off-domain-XX-1">off</a>
<a href="/listings/ocean-view-villa-JC-0027">dup url</a>
<a rel="next" href="/listings/for-sale/residential?page=2">Next</a>
</body></html>
"""

INDEX_SALE_RESIDENTIAL_PAGE2 = """
<html><body>
<a href="/listings/mid-page-home-UJ35">mid</a>
<a href="/listings/ocean-view-villa-JC-0027">cross-page dup id</a>
<a href="/listings/for-sale/other-slug-path-PJ010">typed</a>
<a rel="next" href="/listings/for-sale/residential?page=3">Next</a>
</body></html>
"""

INDEX_SALE_RESIDENTIAL_PAGE3_FINAL = """
<html><body>
<a href="/listings/final-page-lot-PJ009">final</a>
</body></html>
"""

INDEX_SALE_RESIDENTIAL_LOOP_PAGE2 = """
<html><body>
<a href="/listings/loop-home-JC-004">loop</a>
<a rel="next" href="/listings/for-sale/residential">Back to first</a>
</body></html>
"""

INDEX_SALE_LOTS = """
<html><body>
<a href="/listings/flat-lot-harmonie-PJ009">lot</a>
<a href="/listings/ocean-view-villa-JC-0027">cross-category dup</a>
<a href="/listings/907m2-ocean-view-lot-with-sunset-views-in-harmonie">broken no-id prefix</a>
<a href="/listings/907m2-ocean-view-lot-with-sunset-views-in-harmonie-UJ33">canonical</a>
</body></html>
"""

INDEX_SALE_COMMERCIAL = """
<html><body>
<a href="/listings/workshop-schottegatweg-UJ32">commercial</a>
</body></html>
"""

INDEX_RENT_RESIDENTIAL = """
<html><body>
<a href="/listings/rental-apartment-ID-008">rent</a>
<a href="/listings/rental-apartment-in-the-bloksteeg-in-punda-JvD-046S">rent suffix letter</a>
</body></html>
"""

INDEX_RENT_COMMERCIAL = """
<html><body>
<a href="/listings/retail-unit-SW004">rent commercial</a>
</body></html>
"""

INDEX_EMPTY = """
<html><body><h1>Empty category</h1></body></html>
"""


def approved_catalog_html_by_url(
    *,
    residential: str = INDEX_SALE_RESIDENTIAL_PAGE1,
    residential_page2: str | None = None,
    residential_page3: str | None = None,
    lots: str = INDEX_SALE_LOTS,
    commercial: str = INDEX_SALE_COMMERCIAL,
    rent_residential: str = INDEX_RENT_RESIDENTIAL,
    rent_commercial: str = INDEX_RENT_COMMERCIAL,
) -> dict[str, str]:
    """Map canonical approved category URLs to fixture HTML."""

    mapping = {
        "https://kw-curacao.com/listings/for-sale/residential": residential,
        "https://kw-curacao.com/listings/for-sale/lots-and-land": lots,
        "https://kw-curacao.com/listings/for-sale/commercial": commercial,
        "https://kw-curacao.com/listings/for-rent/residential": rent_residential,
        "https://kw-curacao.com/listings/for-rent/commercial": rent_commercial,
    }
    if residential_page2 is not None:
        mapping["https://kw-curacao.com/listings/for-sale/residential?page=2"] = (
            residential_page2
        )
    if residential_page3 is not None:
        mapping["https://kw-curacao.com/listings/for-sale/residential?page=3"] = (
            residential_page3
        )
    return mapping
