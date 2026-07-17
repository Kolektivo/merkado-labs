"""Sanitized RE/MAX parser fixtures (no live network)."""

from __future__ import annotations

# Minimal synthetic fragments clearly marked for parser unit tests.

INDEX_PAGE_SALE = """
<html><body>
<a href="/en/homes/homes-for-sale//hs2957/blue-bay-villa.html">A</a>
<a href="/en/homes/homes-for-sale//hs2957/blue-bay-villa.html">dup</a>
<a href="/en/homes/homes-for-sale/hs2907/sold/sold-home.html">sold</a>
<a href="/en/homes/homes-for-rent/hr2057/apt.html">wrong section ignored by caller</a>
<ul class="pagination">
<li><a href="/en/homes/homes-for-salepaginate-2/">2</a></li>
</ul>
</body></html>
"""

DETAIL_EUR_ACTIVE = """
<html><head>
<title>Blue Bay Villa</title>
<meta name="description" content="Synthetic EUR active villa fixture." />
</head><body>
<div itemscope itemtype="http://schema.org/Product">
<h1 itemprop="name">Blue Bay Villa</h1>
<p class="area">Blue Bay Curacao</p>
<p itemprop="price" class="price">&euro; 480.232</p>
<table>
<tr><td>Bedrooms:</td><td>4</td></tr>
<tr><td>Bathrooms:</td><td>3</td></tr>
<tr><td>Living space:</td><td>2,500 sq ft</td></tr>
<tr><td>Lot size:</td><td>5,000 sq ft</td></tr>
<tr><td>Pool:</td><td>Yes</td></tr>
<tr><td>Furnished:</td><td>No</td></tr>
</table>
<img src="//cdn.remax-abc.com/img/cache/1-aaa-600x400.jpg" />
<img src="//cdn.remax-abc.com/img/cache/2-bbb-600x400.jpg" />
</div>
</body></html>
"""

DETAIL_USD = """
<html><body>
<h1 itemprop="name">USD Listing</h1>
<p itemprop="price">USD 350,000</p>
<table><tr><td>Bedrooms:</td><td>2</td></tr></table>
</body></html>
"""

DETAIL_XCG = """
<html><body>
<h1 itemprop="name">XCG Listing</h1>
<p itemprop="price">XCG 625.000</p>
<table><tr><td>Bedrooms:</td><td>3</td></tr></table>
</body></html>
"""

DETAIL_NO_PRICE = """
<html><body>
<h1 itemprop="name">No Price Listing</h1>
<p class="area">Willemstad Curacao</p>
<table><tr><td>Bedrooms:</td><td>1</td></tr></table>
</body></html>
"""

DETAIL_SOLD = """
<html><body>
<h1 itemprop="name">Sold Home</h1>
<p itemprop="price" class="soldprice">&euro; 100.000</p>
</body></html>
"""

DETAIL_MALFORMED = """
<html><body><p>broken
"""

DETAIL_UNUSUAL_TYPE = """
<html><body>
<h1 itemprop="name">Commercial office suite downtown</h1>
<p itemprop="price">USD 199000</p>
</body></html>
"""

DETAIL_MISSING_COORDS = DETAIL_EUR_ACTIVE  # coords never present in HTML fixtures

DETAIL_RENT_MONTHLY = """
<html><body>
<!-- synthetic rental fixture with explicit monthly period -->
<h1 itemprop="name">Jan Thiel Apartment</h1>
<p class="area">Jan Thiel Curacao</p>
<p itemprop="price" class="price ">&euro; 2.709 / mo.</p>
<table>
<tr><td>Bedrooms:</td><td>2</td></tr>
<tr><td>Bathrooms:</td><td>1</td></tr>
<tr><td>Price:</td><td>&euro; 2.709</td></tr>
</table>
<img src="//cdn.remax-abc.com/img/cache/rent-1-600x400.jpg" />
</body></html>
"""

DETAIL_RENT_RENTED_SOLDPRICE = """
<html><body>
<!-- synthetic: rent pages reuse soldprice CSS for rented -->
<h1 itemprop="name">Blue Bay Villa Rental</h1>
<p class="area">Blue Bay Curacao</p>
<p itemprop="price" class="price soldprice">From &euro; 1.379 / mo.</p>
<table><tr><td>Bedrooms:</td><td>2</td></tr></table>
</body></html>
"""

DETAIL_RENT_PERIOD_UNCLEAR = """
<html><body>
<!-- synthetic rental fixture without explicit period -->
<h1 itemprop="name">Punda Studio</h1>
<p class="area">Punda Curacao</p>
<p itemprop="price">USD 1,800</p>
<table><tr><td>Bedrooms:</td><td>1</td></tr></table>
</body></html>
"""

INDEX_PAGE_RENT = """
<html><body>
<a href="/en/homes/homes-for-rent//hr2057/jan-thiel-apt.html">A</a>
<a href="/en/homes/homes-for-rent//hr2057/jan-thiel-apt.html">dup</a>
<a href="/en/homes/homes-for-rent/hr1999/rented/old-apt.html">rented</a>
<ul class="pagination">
<li><a href="/en/homes/homes-for-rentpaginate-2/">2</a></li>
</ul>
</body></html>
"""
