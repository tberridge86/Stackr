from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

BASE_SCRIPT = Path(__file__).with_name("build_official_only_tc_logos.py")
spec = importlib.util.spec_from_file_location("official_tc_logo_builder", BASE_SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Could not load {BASE_SCRIPT}")
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)

# Traditional Chinese split releases use the genuine original Japanese expansion logos.
builder.PARENT.update({
    "SC2a": "S3",
    "SC2b": "S3",
    "SC2D": "S3",
    "SC1a": "S1W",
    "SC1b": "S1H",
    "SC1D": "S1W",
})

builder.main()
