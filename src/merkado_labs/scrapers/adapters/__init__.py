"""Direct-source adapters package."""

from merkado_labs.scrapers.adapters.base import DirectSourceAdapter
from merkado_labs.scrapers.adapters.keller_williams_curacao import (
    KellerWilliamsCuracaoAdapter,
)
from merkado_labs.scrapers.adapters.monumentenzorg_curacao import (
    MonumentenzorgCuracaoAdapter,
)
from merkado_labs.scrapers.adapters.moret_real_estate import MoretRealEstateAdapter
from merkado_labs.scrapers.adapters.remax_curacao import RemaxCuracaoAdapter
from merkado_labs.scrapers.adapters.sothebys_curacao import SothebysCuracaoAdapter

__all__ = [
    "DirectSourceAdapter",
    "KellerWilliamsCuracaoAdapter",
    "MonumentenzorgCuracaoAdapter",
    "MoretRealEstateAdapter",
    "RemaxCuracaoAdapter",
    "SothebysCuracaoAdapter",
]
