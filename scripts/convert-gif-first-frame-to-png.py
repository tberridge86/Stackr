#!/usr/bin/env python3
"""Convert the first composited GIF frame from stdin to a deterministic PNG on stdout."""

from __future__ import annotations

import io
import sys

from PIL import Image


def main() -> None:
    source = sys.stdin.buffer.read()
    if not source.startswith((b"GIF87a", b"GIF89a")):
        raise SystemExit("Input is not a GIF image.")

    with Image.open(io.BytesIO(source)) as image:
        image.seek(0)
        frame = image.convert("RGBA")
        output = io.BytesIO()
        frame.save(output, format="PNG", optimize=False, compress_level=9)

    sys.stdout.buffer.write(output.getvalue())


if __name__ == "__main__":
    main()
