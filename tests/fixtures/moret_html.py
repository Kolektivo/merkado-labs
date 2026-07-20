"""Synthetic Moret / WPEstate fixtures for parser unit tests."""

from __future__ import annotations

INDEX_PAGE = """
<html lang="nl-NL"><head>
<link rel="canonical" href="https://moretrealestate.com/properties/" />
<link rel="next" href="https://moretrealestate.com/properties/page/2/" />
</head><body>
<div class="property_listing" data-link="https://moretrealestate.com/properties/salinja-villa-demo/">
<a href="https://moretrealestate.com/properties/salinja-villa-demo/">A</a>
</div>
<a href="https://moretrealestate.com/properties/page/2/">page</a>
<a href="https://moretrealestate.com/en/properties/salinja-villa-demo/">en dup</a>
<a href="https://moretrealestate.com/properties/feed/">feed</a>
<ul class="pagination pagination_nojax">
<li class="active"><a href="https://moretrealestate.com/properties/">1</a></li>
<li><a href="https://moretrealestate.com/properties/page/2/">2</a></li>
</ul>
</body></html>
"""

INDEX_PAGE_2 = """
<html lang="nl-NL"><head>
<link rel="canonical" href="https://moretrealestate.com/properties/page/2/" />
</head><body>
<div class="property_listing" data-link="https://moretrealestate.com/properties/final-listing/">
<a href="https://moretrealestate.com/properties/final-listing/">B</a>
</div>
<ul class="pagination pagination_nojax">
<li><a href="https://moretrealestate.com/properties/">1</a></li>
<li class="active"><a href="https://moretrealestate.com/properties/page/2/">2</a></li>
</ul>
</body></html>
"""

INDEX_PAGE_REPEAT = """
<html><head>
<link rel="canonical" href="https://moretrealestate.com/properties/" />
<link rel="next" href="https://moretrealestate.com/properties/page/2/" />
</head><body>
<div class="property_listing" data-link="https://moretrealestate.com/properties/salinja-villa-demo/">
<a href="https://moretrealestate.com/properties/salinja-villa-demo/">A</a>
</div>
</body></html>
"""

DETAIL_XCG_ACTIVE = """
<html lang="nl-NL"><head>
<title>Salinja Villa Demo | Moret Real Estate</title>
<link rel="canonical" href="https://moretrealestate.com/properties/salinja-villa-demo/" />
<meta property="og:image" content="https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-hero.jpg"/>
</head>
<body>
<img src="https://moretrealestate.com/wp-content/uploads/2020/03/Logo.png" alt="logo"/>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs">
<a href="https://moretrealestate.com/kies/kopen/" rel="tag">Kopen</a>,
<a href="https://moretrealestate.com/woningen/huizen-te-koop/" rel="tag">Huizen te koop</a>,
<a href="https://moretrealestate.com/kies/huizen-te-koop/" rel="tag">Woning</a>
</div>
<h1 class="entry-title entry-prop">Salinja Villa Demo</h1>
<span class="price_area">
<span class="price_label price_label_before"></span>
XCG 750.000 <span class="price_label"></span>
</span>
<span class="adres_area">
<a href="https://moretrealestate.com/city/willemstad/" rel="tag">Willemstad</a>,
<a href="https://moretrealestate.com/area/salinja-nl/" rel="tag">Salinja</a>
</span>
<div id="add_favorites" class="isnotfavorite" data-postid="12345">fav</div>
</div>
<div id="carousel-listing" class="carouselvertical">
<a href="https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-hero.jpg" rel="prettyPhoto" class="prettygalery">
<img src="https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-hero-835x540.jpg"/>
</a>
<a href="https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-pool.jpg" title="" rel="prettyPhoto" class="prettygalery">
<img src="https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-pool-835x540.jpg"/>
</a>
</div>
<div class="listing-unit-img-wrapper">
<img src="https://moretrealestate.com/wp-content/uploads/2026/07/related-other-listing-835x540.jpg"/>
</div>
<div class="wpestate_property_description listing-content">
<p>Mooie villa in Salinja met zwembad. Geen cookie banner tekst hier.</p>
</div>
<div class="listing_detail col-md-4" id="propertyid_display"><strong>Property Id:</strong> 12345</div>
<div class="listing_detail col-md-4"><strong>Prijs:</strong> XCG 750.000</div>
<div class="listing_detail col-md-4"><strong>Oppervlakte:</strong> 220 m<sup>2</sup></div>
<div class="listing_detail col-md-4"><strong>Slaapkamers:</strong> 3</div>
<div class="listing_detail col-md-4"><strong>Badkamers:</strong> 2</div>
<div class="listing_detail col-md-4"><strong>Perceel:</strong> 500 m<sup>2</sup></div>
<div class="listing_detail col-md-4"><strong>Stad:</strong> <a href="#">Willemstad</a></div>
<div class="listing_detail col-md-4"><strong>Area:</strong> <a href="#">Salinja</a></div>
<h1 class="title_agent_slider"><a href="https://moretrealestate.com/agents/demo-agent/">Demo Agent</a></h1>
<script id="googlecode_property-js-extra">
var googlecode_property_vars = {"general_latitude":"12.10","general_longitude":"-68.93","current_id":"12345"};
var googlecode_property_vars2 = {"markers2":"[[\"Salinja%20Villa\",12.1099,-68.9301,1,\"img\"]]"};
</script>
</body></html>
"""

DETAIL_RENT_MONTHLY = """
<html><head>
<link rel="canonical" href="https://moretrealestate.com/properties/hofi-rent-demo/" />
</head><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs">
<a href="https://moretrealestate.com/kies/rentals-nl/" rel="tag">Huren</a>,
<a href="https://moretrealestate.com/woningen/huizen-te-huur/" rel="tag">Huizen te huur</a>
</div>
<h1 class="entry-title entry-prop">Hofi Rent Demo</h1>
<span class="price_area">XCG 4.900 <span class="price_label">per maand</span></span>
<div id="add_favorites" data-postid="75705">fav</div>
</div>
<div class="wpestate_property_description"><p>Beschikbaar voor verhuur in Hofi Vidanova.</p></div>
<div class="listing_detail"><strong>Slaapkamers:</strong> 3</div>
<div class="listing_detail"><strong>Badkamers:</strong> 2</div>
</body></html>
"""

DETAIL_NO_PRICE = """
<html><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs"><a href="/kies/kopen/">Kopen</a></div>
<h1 class="entry-title entry-prop">No Price Home</h1>
<div id="add_favorites" data-postid="999">fav</div>
</div>
<div class="wpestate_property_description"><p>Omschrijving zonder prijs.</p></div>
</body></html>
"""

DETAIL_VANAF_PRICE = """
<html><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs">
<a href="https://moretrealestate.com/kies/kopen/" rel="tag">Kopen</a>,
<a href="https://moretrealestate.com/kies/appartement-te-koop/" rel="tag">Appartementen te koop</a>
</div>
<h1 class="entry-title entry-prop">Sint Jorisbaai – Exclusief Wonen</h1>
<span class="price_area">
<span class="price_label price_label_before">vanaf</span> XCG 635.000
</span>
<div id="add_favorites" data-postid="75799">fav</div>
</div>
<strong>Slaapkamers:</strong> 2
<strong>Badkamers:</strong> 1.5
<div class="wpestate_property_description"><p>Nieuwbouwproject Zyon Residence.</p></div>
</body></html>
"""

DETAIL_GLOBAL_PRICE_TRAP = """
<html><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs"><a href="/kies/kopen/">Kopen</a></div>
<h1 class="entry-title entry-prop">Trap Listing</h1>
<div id="add_favorites" data-postid="4242">fav</div>
</div>
<footer>Mortgage example XCG 12.000 unrelated</footer>
<div class="related">Other home XCG 900.000</div>
<div class="wpestate_property_description"><p>No local price block.</p></div>
</body></html>
"""

DETAIL_SOLD = """
<html><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs"><a href="/kies/kopen/">Kopen</a></div>
<h1 class="entry-title entry-prop">Sold Home</h1>
<span class="status-wrapper">Verkocht</span>
<span class="price_area">XCG 800.000</span>
<div id="add_favorites" data-postid="8001">fav</div>
</div>
<div class="wpestate_property_description"><p>Verkocht object.</p></div>
</body></html>
"""

DETAIL_RENTED = """
<html><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs"><a href="/kies/rentals-nl/">Huren</a></div>
<h1 class="entry-title entry-prop">Rented Home</h1>
<span class="status-wrapper">Verhuurd</span>
<span class="price_area">XCG 3.500</span>
<div id="add_favorites" data-postid="8002">fav</div>
</div>
<div class="wpestate_property_description"><p>Verhuurd object.</p></div>
</body></html>
"""

DETAIL_UNDER_CONTRACT = """
<html><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs"><a href="/kies/kopen/">Kopen</a></div>
<h1 class="entry-title entry-prop">Under Contract Home</h1>
<span class="status-wrapper">Onder bod</span>
<span class="price_area">XCG 550.000</span>
<div id="add_favorites" data-postid="8003">fav</div>
</div>
<div class="wpestate_property_description"><p>Onder bod.</p></div>
</body></html>
"""

DETAIL_EN_ALIAS = """
<html><head>
<link rel="canonical" href="https://moretrealestate.com/properties/salinja-villa-demo/" />
</head><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs"><a href="/en/action/buy/">For sale</a></div>
<h1 class="entry-title entry-prop">Salinja Villa Demo</h1>
<span class="price_area">XCG 750.000</span>
<div id="add_favorites" data-postid="12345">fav</div>
</div>
<div class="wpestate_property_description"><p>English mirror of the same post.</p></div>
</body></html>
"""

DETAIL_EURO_WORD_PRICE = """
<html><body>
<div class="prop_title_zone">
<div id="prop_categs" class="property_categs"><a href="/kies/kopen/">Kopen</a></div>
<h1 class="entry-title entry-prop">Blue Bay Euro Price</h1>
<span class="price_area"><span class="price_label price_label_before"></span>
<span class="price_label ">635.000 euro</span></span>
<div id="add_favorites" data-postid="68612">fav</div>
</div>
<div class="wpestate_property_description"><p>Vraagprijs 635.000 Euro.</p></div>
</body></html>
"""
