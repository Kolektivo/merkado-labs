"""Synthetic Moret / WPEstate fixtures for parser unit tests."""

from __future__ import annotations

INDEX_PAGE = """
<html><body>
<a href="https://moretrealestate.com/properties/salinja-villa-demo/">A</a>
<a href="https://moretrealestate.com/properties/page/2/">page</a>
<a href="https://moretrealestate.com/en/properties/salinja-villa-demo/">en dup</a>
<a href="https://moretrealestate.com/properties/feed/">feed</a>
</body></html>
"""

DETAIL_XCG_ACTIVE = """
<html><head><title>Salinja Villa Demo | Moret Real Estate</title></head>
<body>
<article data-postid="12345">
<h1>Salinja Villa Demo</h1>
<span class="price_area">
<span class="price_label price_label_before"></span>
XCG 750.000 <span class="price_label"></span>
</span>
<div class="listing_details">
<strong>Slaapkamers:</strong> 3
<strong>Badkamers:</strong> 2
<strong>Woonoppervlakte:</strong> 220 m2
</div>
<div class="wpestate_property_description">
<p>Mooie villa in Salinja met zwembad. Geen cookie banner tekst hier.</p>
</div>
<img src="https://moretrealestate.com/wp-content/uploads/demo-villa.jpg" />
</article>
</body></html>
"""

DETAIL_NO_PRICE = """
<html><body data-postid="999">
<h1>No Price Home</h1>
<div class="wpestate_property_description"><p>Omschrijving zonder prijs.</p></div>
</body></html>
"""

DETAIL_VANAF_PRICE = """
<html><body data-postid="75799">
<h1>Sint Jorisbaai – Exclusief Wonen</h1>
<span class="price_area">
<span class="price_label price_label_before">vanaf</span> XCG 635.000
</span>
<strong>Slaapkamers:</strong> 2
<strong>Badkamers:</strong> 1
</body></html>
"""
