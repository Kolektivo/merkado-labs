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
<a rel="objectimages" href="//cdn.remax-abc.com/img/cache/1-aaa-600x400.jpg">one</a>
<a rel="objectimages" href="//cdn.remax-abc.com/img/cache/2-bbb-600x400.jpg">two</a>
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

# Synthetic hr2066-style case: EUR display + listed-in EUR + official XCG 1350.
# Live RE/MAX EUR pages do not include the NAF/XCG selector amount; this fixture
# proves the capture path via stored evidence hooks (meta + comment).
DETAIL_EUR_OFFICIAL_XCG = """
<html><head>
<title>HR2066 Synthetic Official XCG</title>
<meta name="remax-official-xcg" content="1350" />
</head><body>
<div itemscope itemtype="http://schema.org/Product">
<h1 itemprop="name">Synthetic Rent EUR with official XCG</h1>
<p class="area">Willemstad Curacao</p>
<p itemprop="price" class="price">&euro; 664</p>
<table>
<tr><td>Bedrooms:</td><td>2</td></tr>
<tr><td>Bathrooms:</td><td>1</td></tr>
</table>
<ul class="dropdown">
<li class='active'><a href="/currency/EUR/">EUR</a></li>
<li><a href="/currency/USD/">USD</a></li>
<li><a href="/currency/NAF/">XCG</a></li>
</ul>
<small><i>
In an international environment like Curacao, objects are listed in various currencies.
For your convenience, you are able to adjust the currency in which the objects&#039; listing price is shown.
In case the currency displayed differs from the currency the object was listed in,
the listing price may seem to change on a daily basis. No rights may be derived from these recalculated numbers.
This specific object is listed in EUR.
</i></small>
<!-- remax-currency-evidence currency=XCG amount=1350 -->
<span data-remax-official-currency="XCG" data-remax-official-amount="1350">XCG 1.350</span>
</div>
</body></html>
"""

# Live-shaped default EUR view for hr2066 (no synthetic hooks; listed-in XCG).
# Probe: default EUR 664; NAF session yields XCG 1350.
DETAIL_HR2066_EUR_DEFAULT = """
<html><head>
<title>Marie Pampoen Cozy Furnished House</title>
</head><body>
<div itemscope itemtype="http://schema.org/Product">
<h1 itemprop="name">Marie Pampoen Cozy Furnished House</h1>
<p class="area">Marie Pampoen Curacao</p>
<p itemprop="price" class="price">&euro; 664 / mo.</p>
<table>
<tr><td>Bedrooms:</td><td>2</td></tr>
<tr><td>Bathrooms:</td><td>1</td></tr>
</table>
<ul class="dropdown">
<li class='active'><a href="/currency/EUR/">EUR</a></li>
<li><a href="/currency/USD/">USD</a></li>
<li><a href="/currency/NAF/">XCG</a></li>
</ul>
<small><i>
This specific object is listed in XCG.
</i></small>
</div>
</body></html>
"""

# NAF cookie-session view of the same listing (active NAF, XCG display).
DETAIL_HR2066_NAF_VIEW = """
<html><head>
<title>Marie Pampoen Cozy Furnished House</title>
</head><body>
<div itemscope itemtype="http://schema.org/Product">
<h1 itemprop="name">Marie Pampoen Cozy Furnished House</h1>
<p class="area">Marie Pampoen Curacao</p>
<p itemprop="price" class="price">XCG 1.350 / mo.</p>
<table>
<tr><td>Bedrooms:</td><td>2</td></tr>
<tr><td>Bathrooms:</td><td>1</td></tr>
</table>
<ul class="dropdown">
<li><a href="/currency/EUR/">EUR</a></li>
<li><a href="/currency/USD/">USD</a></li>
<li class='active'><a href="/currency/NAF/">XCG</a></li>
</ul>
<small><i>
This specific object is listed in XCG.
</i></small>
<span>Reference hr2066</span>
</div>
</body></html>
"""

# Wrong listing after NAF switch (verification must fail).
DETAIL_HR2066_NAF_WRONG_LISTING = """
<html><body>
<div itemscope itemtype="http://schema.org/Product">
<h1 itemprop="name">Different Home</h1>
<p itemprop="price" class="price">XCG 9.999 / mo.</p>
<ul class="dropdown">
<li class='active'><a href="/currency/NAF/">XCG</a></li>
</ul>
<span>Reference hr9999</span>
</div>
</body></html>
"""
