"""Synthetic Keller Williams Curaçao parser fixtures (no live network)."""

DETAIL_USD_SALE = """
<html><body>
<div class="page-property-details__status">Active</div>
<h1 class="headline">Ocean View Villa</h1>
<div class="page-property-details__location">Jan Thiel</div>
<div class="page-property-details__type">For Sale - Residential</div>
<div class="page-property-details__price">USD 795.000 (EUR 693.304)<br>XCG 1.423.050</div>
<div class="option__value">3 bedroom(s)</div><div class="option__value">2.5 bathroom(s)</div>
<div id="description" class="tabs__item">
<div class="wysiwyg">A waterfront villa.<br>Private pool.</div>
<div class="property-brochure-links"></div></div>
<div id="features" class="tabs__item"><table>
<tr><td>Neighborhood</td><td>Jan Thiel</td></tr><tr><td>Build up size</td><td>186 m²</td></tr>
</table></div></div><div id="map"></div>
<a href="https://kw-curacao.com/storage/app/uploads/public/one.jpg" data-fancybox="gallery">one</a>
<a href="https://kw-curacao.com/storage/app/uploads/public/two.jpg" data-fancybox="gallery">two</a>
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
<div class="property-brochure-links"></div></div></body></html>
"""

INDEX_PAGE = """
<a href="/listings/for-sale/ocean-view-villa-JC-0027">sale</a>
<a href="/listings/for-rent/rental-apartment-ID-008">rent</a>
<a href="/silent-listings/private-home-UJ32">silent</a>
"""
