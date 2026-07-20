"""Deterministic Monumentenzorg / WPEstate fixtures for parser and catalog tests."""

# ruff: noqa: E501

from __future__ import annotations

INDEX_HTML = """
<html lang="en-US"><head>
<title>Properties Archive - Stichting Monumentenzorg Curaçao</title>
<link rel="canonical" href="https://monumentenzorg.cw/properties/" />
</head><body>
<a href="https://monumentenzorg.cw/properties/feed/">RSS</a>
<a href="https://monumentenzorg.cw/our_property/de-tempel/">heritage</a>
<a href="https://monumentenzorg.cw/our-properties/">portfolio</a>
<div class="listing_wrapper">
  <h4><a href="https://monumentenzorg.cw/properties/fort-waakzaamheid/">Fort Waakzaamheid</a></h4>
  <a href="https://monumentenzorg.cw/properties/fort-waakzaamheid/fort-photo/">attachment</a>
</div>
<div class="listing_wrapper">
  <h4><a href="https://monumentenzorg.cw/properties/villawashington/">Villa Washington</a></h4>
</div>
<div class="listing_wrapper">
  <h4><a href="https://monumentenzorg.cw/properties/aura-winkel/">Sold Under Reservation – Aura Winkel</a></h4>
</div>
<div class="listing_wrapper">
  <h4><a href="https://monumentenzorg.cw/properties/bargestraat-28-d/">Bargestraat 28-D</a></h4>
</div>
<div class="listing_wrapper">
  <h4><a href="https://monumentenzorg.cw/properties/villa-maria/">Villa Maria</a></h4>
</div>
<!-- duplicate discovery URL -->
<a href="https://monumentenzorg.cw/properties/villa-maria/">Villa Maria again</a>
</body></html>
"""

SITEMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://monumentenzorg.cw/properties/</loc></url>
  <url><loc>https://monumentenzorg.cw/properties/bargestraat-28-d/</loc></url>
  <url><loc>https://monumentenzorg.cw/properties/villawashington/</loc></url>
  <url><loc>https://monumentenzorg.cw/properties/villa-maria/</loc></url>
  <url><loc>https://monumentenzorg.cw/properties/fort-waakzaamheid/</loc></url>
  <url><loc>https://monumentenzorg.cw/properties/aura-winkel/</loc></url>
</urlset>
"""

SITEMAP_MISMATCH_XML = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://monumentenzorg.cw/properties/villa-maria/</loc></url>
  <url><loc>https://monumentenzorg.cw/properties/extra-only-in-sitemap/</loc></url>
</urlset>
"""

DETAIL_VILLA_MARIA = """
<html lang="en-US" class="postid-18650"><head>
<title>Villa Maria - Stichting Monumentenzorg Curaçao</title>
<meta property="og:image" content="https://monumentenzorg.cw/wp-content/uploads/2017/11/Slide1.jpg"/>
</head><body>
<h1>Villa Maria</h1>
<div class="price_area">Starting at ANG 8,000 / per month excl. OB Commercial in Rentals</div>
<div class="wpestate_property_description listing-content">
<p>Villa Maria is a late 19th-century mansion overlooking Punda and the harbor.</p>
</div>
<div class="listing_detail col-md-4"><strong>Address:</strong> N. van den Brandhofstraat 2 - 6</div>
<div class="listing_detail col-md-4"><strong>City:</strong> Willemstad</div>
<div class="listing_detail col-md-4"><strong>Area:</strong> Scharloo</div>
<div class="listing_detail col-md-4" id="propertyid_display"><strong>Property Id :</strong> 18650</div>
<div class="listing_detail col-md-4"><strong>Price:</strong> Starting at ANG 8,000 / per month excl. OB</div>
<div class="listing_detail col-md-4"><strong>Property Size:</strong> 200 m 2</div>
<div class="listing_detail col-md-4"><strong>Property Lot Size:</strong> 0 m 2</div>
<div class="listing_detail col-md-4"><strong>Bedrooms:</strong> 0</div>
<div class="listing_detail col-md-4"><strong>Bathrooms:</strong> 3</div>
<div class="listing_detail col-md-4"><strong>Year Built:</strong> 1885</div>
<div class="listing_detail col-md-4"><strong>Propery Type:</strong> Commercial</div>
<a href="https://monumentenzorg.cw/wp-content/uploads/2017/11/Slide1.jpg" rel="prettyPhoto">img</a>
<a href="https://monumentenzorg.cw/wp-content/uploads/2017/11/villa-maria-room.jpg">room</a>
<h4>Features</h4>
<ul><li>Harbor view</li><li>Basement kitchen</li></ul>
<h4>Similar Listings</h4>
<div class="listing_wrapper">
  <h4><a href="https://monumentenzorg.cw/properties/aura-winkel/">Sold Under Reservation – Aura Winkel</a></h4>
  <div class="price_area">Open to reasonable offers Commercial in Sales</div>
</div>
</body></html>
"""

DETAIL_BARGESTRAAT = """
<html class="postid-19349"><head>
<title>Bargestraat 28-D - Stichting Monumentenzorg Curaçao</title>
<meta property="og:image" content="https://monumentenzorg.cw/wp-content/uploads/2021/05/Facade-Bargestraat-28D.jpg"/>
</head><body>
<h1>Bargestraat 28-D</h1>
<div class="price_area">ANG 3,500 / per month excl. OB Commercial in Rentals</div>
<div class="wpestate_property_description"><p>Restaurant / cafe opportunity at Parke Leyba.</p></div>
<div class="listing_detail"><strong>City:</strong> Willemstad</div>
<div class="listing_detail"><strong>Area:</strong> Fleur de Marie , Scharloo</div>
<div class="listing_detail" id="propertyid_display"><strong>Property Id :</strong> 19349</div>
<div class="listing_detail"><strong>Property Size:</strong> 140 m 2</div>
<div class="listing_detail"><strong>Property Lot Size:</strong> 0 m 2</div>
<div class="listing_detail"><strong>Bedrooms:</strong> 0</div>
<div class="listing_detail"><strong>Bathrooms:</strong> 3</div>
<div class="listing_detail"><strong>Propery Type:</strong> Restaurant / cafe / minimarket / marketplace</div>
<!-- missing Address on purpose -->
<h4>Similar Listings</h4>
<div class="price_area">Starting at ANG 8,000 / per month excl. OB</div>
</body></html>
"""

DETAIL_FORT = """
<html class="postid-20933"><head>
<title>Fort Waakzaamheid - Stichting Monumentenzorg Curaçao</title>
<meta property="og:image" content="https://monumentenzorg.cw/wp-content/uploads/2025/07/240516JB-Fort-Waakzaamheid-3_2.jpg"/>
</head><body>
<h1>Fort Waakzaamheid</h1>
<div class="price_area">Rental fee to be determined Commercial in Rentals</div>
<div class="wpestate_property_description"><p>Proposals invited for commercial use of the panoramic terrace.</p></div>
<div class="listing_detail"><strong>City:</strong> Willemstad</div>
<div class="listing_detail"><strong>Area:</strong> Otrobanda , Outside Willemstad</div>
<div class="listing_detail" id="propertyid_display"><strong>Property Id :</strong> 20933</div>
<div class="listing_detail"><strong>Property Size:</strong> 0 m 2</div>
<div class="listing_detail"><strong>Property Lot Size:</strong> 872 m 2</div>
<div class="listing_detail"><strong>Bedrooms:</strong> 0</div>
<div class="listing_detail"><strong>Bathrooms:</strong> 0</div>
<div class="listing_detail"><strong>Year Built:</strong> 1803</div>
</body></html>
"""

DETAIL_VILLA_WASHINGTON = """
<html class="postid-31"><head>
<title>Villa Washington - Stichting Monumentenzorg Curaçao</title>
<meta property="og:image" content="https://monumentenzorg.cw/wp-content/uploads/2023/10/231002-JB-Villa-Washington-5-3_2.jpg"/>
</head><body>
<h1>Villa Washington</h1>
<div class="price_area">Rental fee to be determined Commercial in Rentals</div>
<div class="wpestate_property_description"><p>Multipurpose commercial spaces in Otrobanda.</p></div>
<div class="listing_detail"><strong>Address:</strong> L.B. Smithplein 6-8</div>
<div class="listing_detail"><strong>City:</strong> Willemstad</div>
<div class="listing_detail"><strong>Area:</strong> Otrobanda</div>
<div class="listing_detail" id="propertyid_display"><strong>Property Id :</strong> 31</div>
<div class="listing_detail"><strong>Property Size:</strong> 413 m 2</div>
<div class="listing_detail"><strong>Property Lot Size:</strong> 1,030 m 2</div>
<div class="listing_detail"><strong>Bedrooms:</strong> 0</div>
<div class="listing_detail"><strong>Bathrooms:</strong> 5</div>
<div class="listing_detail"><strong>Year Built:</strong> 1882</div>
<div class="listing_detail"><strong>Propery Type:</strong> Commercial</div>
<h4>Similar Listings</h4>
<h4><a href="https://monumentenzorg.cw/properties/aura-winkel/">Sold Under Reservation – Aura Winkel</a></h4>
</body></html>
"""

DETAIL_AURA = """
<html class="postid-19596"><head>
<title>Sold Under Reservation – Aura Winkel - Stichting Monumentenzorg Curaçao</title>
<meta property="og:image" content="https://monumentenzorg.cw/wp-content/uploads/2022/08/Aura-Winkel-facade-3-3_2.jpg"/>
</head><body>
<h1>Sold Under Reservation – Aura Winkel</h1>
<div class="price_area">Open to reasonable offers Commercial in Sales</div>
<div class="wpestate_property_description"><p>Aura Winkel in Scharloo used to house restaurants and offices.</p></div>
<div class="listing_detail"><strong>Address:</strong> Scharlooweg 72-76</div>
<div class="listing_detail"><strong>City:</strong> Willemstad</div>
<div class="listing_detail"><strong>Area:</strong> Scharloo</div>
<div class="listing_detail" id="propertyid_display"><strong>Property Id :</strong> 19596</div>
<div class="listing_detail"><strong>Property Size:</strong> 0 m 2</div>
<div class="listing_detail"><strong>Property Lot Size:</strong> 0 m 2</div>
<div class="listing_detail"><strong>Bedrooms:</strong> 0</div>
<div class="listing_detail"><strong>Bathrooms:</strong> 4</div>
</body></html>
"""

DETAIL_MALFORMED = """
<html><body>
<h1>Broken Listing</h1>
<div class="price_area">ANG 1,000 Commercial in Rentals</div>
<!-- intentionally missing Property Id -->
</body></html>
"""

DETAIL_HTML_BY_URL = {
    "https://monumentenzorg.cw/properties/fort-waakzaamheid/": DETAIL_FORT,
    "https://monumentenzorg.cw/properties/villawashington/": DETAIL_VILLA_WASHINGTON,
    "https://monumentenzorg.cw/properties/aura-winkel/": DETAIL_AURA,
    "https://monumentenzorg.cw/properties/bargestraat-28-d/": DETAIL_BARGESTRAAT,
    "https://monumentenzorg.cw/properties/villa-maria/": DETAIL_VILLA_MARIA,
}
