#!/usr/bin/env python3
"""Regenerate only the L1b/LL bundled logos from their existing original sheet.

Requires Pillow. Defaults to a dry run; --write replaces two PNGs and their
manifest entries. Does not publish, deploy, change identities or touch other logos.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps

ASSET_DIR = Path('assets/rev2/11-japanese-set-logo')
SOURCE_FILE = 'WhatsApp Image 2026-07-24 at 14.31.55 (4).jpeg'
SOURCE_GIT_SHA = 'a9b6cfc48fd2823cf5fa4564ad47aeb0c30014c4'
# This sheet is a three-logo upper row and TWO-logo lower row, not a 3x2 grid.
CROPS = {'l1b': (0, 562, 768, 1024), 'll': (768, 562, 1536, 1024)}
OLD_CROPS = {'l1b': (0, 562, 512, 1024), 'll': (512, 562, 1024, 1024)}
NAMES = {'l1b': 'SoulSilver Collection', 'll': 'Lost Link'}
FIELDS = ('left', 'top', 'right', 'bottom')


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()


def render_logo(sheet: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """Keep the complete cell artwork; remove only edge-connected near-white.

    White areas enclosed within the logo remain opaque. No generative edits,
    sharpening, symbol replacement or reconstruction of missing letters.
    """
    rgb = sheet.crop(box).convert('RGB')
    red, green, blue = rgb.split()
    minimum = ImageChops.darker(ImageChops.darker(red, green), blue)
    background = minimum.point(lambda v: 255 if v >= 248 else 0)
    flooded = ImageOps.expand(background, border=1, fill=255)
    ImageDraw.floodfill(flooded, (0, 0), 128, thresh=0)
    alpha = flooded.crop((1, 1, rgb.width + 1, rgb.height + 1))
    alpha = alpha.point(lambda v: 0 if v == 128 else 255)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError('Refusing to export an empty logo')
    rgba = rgb.convert('RGBA')
    rgba.putalpha(alpha)
    rgba = rgba.crop(bounds)
    target_width, padding = 1000, 32
    scale = (target_width - 2 * padding) / rgba.width
    rgba = rgba.resize((target_width - 2 * padding, max(1, round(rgba.height * scale))), Image.Resampling.LANCZOS)
    result = Image.new('RGBA', (target_width, rgba.height + 2 * padding))
    result.paste(rgba, (padding, padding))
    return result


def prepare(root: Path) -> tuple[dict[Path, bytes], dict]:
    directory = root / ASSET_DIR
    source = (directory / SOURCE_FILE).read_bytes()
    if git_blob_sha(source) != SOURCE_GIT_SHA:
        raise ValueError('Original sheet changed or is incomplete; inspect it before adjusting the reviewed crops')
    manifest_path = directory / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    updates: dict[Path, bytes] = {}
    report = {'sourceGitSha': SOURCE_GIT_SHA, 'logos': []}
    with Image.open(io.BytesIO(source)) as sheet:
        sheet.load()  # A truncated preview must never become a production asset.
        if sheet.size != (1536, 1024):
            raise ValueError(f'Unexpected sheet dimensions: {sheet.size}')
        for key, box in CROPS.items():
            matches = [row for row in manifest['logos'] if row['key'] == key]
            if len(matches) != 1:
                raise ValueError(f'Expected exactly one manifest entry for {key}')
            row = matches[0]
            relative = ASSET_DIR / 'logos' / f'{key}.png'
            if row['sourceFile'] != SOURCE_FILE or row['listedName'] != NAMES[key] or row['assetPath'] != relative.as_posix():
                raise ValueError(f'Unexpected identity or source mapping for {key}')
            previous = tuple(row['sourceCrop'][field] for field in FIELDS)
            if previous not in (OLD_CROPS[key], box):
                raise ValueError(f'Unreviewed concurrent crop change for {key}: {previous}')
            logo = render_logo(sheet, box)
            encoded = io.BytesIO()
            logo.save(encoded, format='PNG', optimize=True)
            updates[root / relative] = encoded.getvalue()
            row.update(sourceLayout='custom', sourceCrop=dict(zip(FIELDS, box)), width=logo.width, height=logo.height)
            report['logos'].append({'key': key, 'crop': list(box), 'size': list(logo.size), 'sha256': hashlib.sha256(encoded.getvalue()).hexdigest()})
    updates[manifest_path] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    return updates, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--write', action='store_true', help='Write only the two PNGs and their manifest entries')
    args = parser.parse_args()
    updates, report = prepare(args.root.resolve())
    if args.write:
        for path, data in updates.items():
            temporary = path.with_name(path.name + '.crop-repair.tmp')
            temporary.write_bytes(data)
            temporary.replace(path)
    report['written'] = args.write
    report['deviceAcceptance'] = 'pending'
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
