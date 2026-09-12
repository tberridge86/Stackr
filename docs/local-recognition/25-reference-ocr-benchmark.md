# Reference-image OCR benchmark

This tool measures whether OCR text from downloaded, known card images can retrieve the correct local catalogue entry.

Run it with:

```bash
npm run test:reference-ocr
npm run benchmark:reference-ocr
```

The default pilot resolves eight exact printings, including every `Charizard ex` printing in Obsidian Flames. It downloads the recorded high-resolution image, validates its MIME type, decoded format, dimensions, aspect ratio, size and SHA-256 checksum, then runs clean, JPEG-compressed and blurred views.

The report is written to `tmp/reference-ocr-benchmark/report.json`. Downloaded pixels stay in the ignored temporary cache. The benchmark does not write to production or staging catalogues.

This is not release evidence. It uses desktop Tesseract as a proxy for crop geometry and text normalisation. It does not measure mobile ML Kit, real phone captures or visual embeddings. OCR results are candidate retrieval only and can never be automatically accepted without independent visual evidence.

Custom queries can be repeated:

```bash
npm run benchmark:reference-ocr -- \
  --query="Charizard from Obsidian Flames" \
  --query="base1-4" \
  --views=clean,jpeg_60,focus_blur
```

An informal name plus set intentionally returns every matching printing. It never silently chooses one variant.
