from __future__ import annotations

import hashlib
from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from .schemas import ImageCorners


class ImageProcessingError(ValueError):
    pass


@dataclass(frozen=True)
class NormalisedImage:
    image: Image.Image
    sha256: str
    width: int
    height: int
    original_width: int
    original_height: int
    mime_type: str


def sniff_mime(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return "application/octet-stream"


def _crop_from_corners(image: Image.Image, corners: ImageCorners | None) -> Image.Image:
    if corners is None:
        return image
    width, height = image.size
    points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
    if corners.coordinateSpace == "normalized":
        xs = [max(0.0, min(1.0, point[0])) * width for point in points]
        ys = [max(0.0, min(1.0, point[1])) * height for point in points]
    else:
        xs = [max(0.0, min(float(width), point[0])) for point in points]
        ys = [max(0.0, min(float(height), point[1])) for point in points]
    left, right = int(min(xs)), int(max(xs))
    top, bottom = int(min(ys)), int(max(ys))
    if right - left < 24 or bottom - top < 24:
        raise ImageProcessingError("rectification corners are too small")
    return image.crop((left, top, right, bottom))


def normalise_card_image(
    data: bytes,
    *,
    max_bytes: int,
    target_width: int,
    target_height: int,
    corners: ImageCorners | None = None,
) -> NormalisedImage:
    if len(data) > max_bytes:
        raise ImageProcessingError("image exceeds configured size limit")
    mime_type = sniff_mime(data)
    if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ImageProcessingError("unsupported image file signature")
    try:
        with Image.open(BytesIO(data)) as opened:
            original = ImageOps.exif_transpose(opened).convert("RGB")
    except UnidentifiedImageError as exc:
        raise ImageProcessingError("image could not be decoded") from exc

    original_width, original_height = original.size
    if original_width < 64 or original_height < 64:
        raise ImageProcessingError("image dimensions are too small")

    cropped = _crop_from_corners(original, corners)
    normalised = ImageOps.fit(cropped, (target_width, target_height), method=Image.Resampling.BICUBIC)
    return NormalisedImage(
        image=normalised,
        sha256=hashlib.sha256(data).hexdigest(),
        width=normalised.width,
        height=normalised.height,
        original_width=original_width,
        original_height=original_height,
        mime_type=mime_type,
    )


def image_to_chw_float32(image: Image.Image) -> np.ndarray:
    array = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    array = np.transpose(array, (2, 0, 1))
    return array[None, ...]
