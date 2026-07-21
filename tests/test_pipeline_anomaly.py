from merkado_labs.pipeline.anomaly import evaluate_catalog_anomaly


def test_default_catalog_change_thresholds() -> None:
    assert evaluate_catalog_anomaly("remax_curacao", 100, 80).anomalous
    assert evaluate_catalog_anomaly("remax_curacao", 100, 150).anomalous
    # 15% decrease threshold (catches stale KW 84-vs-104 cache false completes).
    assert evaluate_catalog_anomaly("remax_curacao", 100, 85).anomalous
    assert not evaluate_catalog_anomaly("remax_curacao", 100, 86).anomalous
    assert not evaluate_catalog_anomaly("remax_curacao", 100, 149).anomalous
    assert evaluate_catalog_anomaly("keller_williams_curacao", 104, 84).anomalous


def test_monumentenzorg_allows_five_to_four_only() -> None:
    assert not evaluate_catalog_anomaly("monumentenzorg_curacao", 5, 4).anomalous
    assert evaluate_catalog_anomaly("monumentenzorg_curacao", 5, 3).anomalous


def test_first_catalog_has_no_prior_anomaly_baseline() -> None:
    assert not evaluate_catalog_anomaly("moret_real_estate", 0, 71).anomalous
