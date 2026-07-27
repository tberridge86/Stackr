import CoreImage
import Foundation
import UIKit

private let cardRectificationVersion = "stackr-card-rectification-v1.0.0"
private let cardRoiMappingVersion = "stackr-pokemon-card-roi-v1.0.0"
private let rectifiedCardAspectRatio = 0.7
private let recognitionWidth = 224
private let recognitionHeight = 320
private let thumbnailWidth = 112
private let thumbnailHeight = 160

enum StackrCardRectifier {
  static func rectify(_ request: [String: Any?]) -> [String: Any?] {
    guard let scanId = request["scanId"] as? String else {
      return failed(scanId: nil, message: "Rectification requires a scan ID.")
    }
    guard let sourceUri = request["sourcePhotoUri"] as? String else {
      return failed(scanId: scanId, message: "Rectification requires a source photo URI.")
    }

    let cameraPosition = request["cameraPosition"] as? String ?? "unknown"
    let mirrored = request["mirrored"] as? Bool ?? false
    if cameraPosition == "front" || mirrored {
      return failed(scanId: scanId, message: "Rectification requires an unmirrored back-camera capture.")
    }

    let sourceUrl = fileUrl(from: sourceUri)
    guard FileManager.default.fileExists(atPath: sourceUrl.path) else {
      return failed(scanId: scanId, message: "Source photo does not exist.")
    }
    guard let sourceImage = UIImage(contentsOfFile: sourceUrl.path), let ciImage = CIImage(image: sourceImage) else {
      return failed(scanId: scanId, message: "Source photo could not be decoded.")
    }

    do {
      let photoWidth = intValue(request["photoWidth"] as? Any, fallback: Int(sourceImage.size.width * sourceImage.scale))
      let photoHeight = intValue(request["photoHeight"] as? Any, fallback: Int(sourceImage.size.height * sourceImage.scale))
      let previewWidth = intValue(request["previewWidth"] as? Any, fallback: 1)
      let previewHeight = intValue(request["previewHeight"] as? Any, fallback: 1)
      let rotationDegrees = normalisedRotation(intValue(request["rotationDegrees"] as? Any, fallback: 0))
      let previewResizeMode = request["previewResizeMode"] as? String ?? "cover"
      guard let previewCorners = quad(from: request["previewCorners"] as? [String: Any?]) else {
        return failed(scanId: scanId, message: "Rectification requires accepted preview corner coordinates.")
      }

      let photoCorners = previewQuadToPhotoQuad(
        previewCorners,
        photoWidth: photoWidth,
        photoHeight: photoHeight,
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        rotationDegrees: rotationDegrees,
        mirrored: mirrored,
        resizeMode: previewResizeMode
      )
      let outputSize = rectifiedOutputSize(photoCorners)
      let corrected = try perspectiveCorrect(ciImage, corners: photoCorners, sourceHeight: Double(photoHeight))
      let rectified = render(corrected, width: outputSize.width, height: outputSize.height)
      let recognition = resize(rectified, width: recognitionWidth, height: recognitionHeight)
      let ocrSource = cropAndResize(rectified, x: 0.03, y: 0.02, width: 0.94, height: 0.96, outputWidth: 672, outputHeight: 960)
      let thumbnail = resize(rectified, width: thumbnailWidth, height: thumbnailHeight)
      let leftEdge = cropAndResize(rectified, x: 0, y: 0.04, width: 0.08, height: 0.92, outputWidth: 96, outputHeight: 960)
      let outputDir = try outputDirectory(scanId: scanId)

      let rectifiedUrl = outputDir.appendingPathComponent("rectified-full.png")
      let recognitionUrl = outputDir.appendingPathComponent("recognition-224x320.png")
      let ocrUrl = outputDir.appendingPathComponent("ocr-source.png")
      let thumbnailUrl = outputDir.appendingPathComponent("thumbnail.png")
      let leftEdgeUrl = outputDir.appendingPathComponent("roi-left-edge.png")
      try savePng(rectified, to: rectifiedUrl)
      try savePng(recognition, to: recognitionUrl)
      try savePng(ocrSource, to: ocrUrl)
      try savePng(thumbnail, to: thumbnailUrl)
      try savePng(leftEdge, to: leftEdgeUrl)

      return [
        "status": "success",
        "scanId": scanId,
        "rectifiedFull": imageOutput(rectifiedUrl, width: outputSize.width, height: outputSize.height, role: "rectified_full"),
        "recognitionCrop": imageOutput(recognitionUrl, width: recognitionWidth, height: recognitionHeight, role: "recognition_crop"),
        "ocrSourceCrop": imageOutput(ocrUrl, width: 672, height: 960, role: "ocr_source_crop"),
        "thumbnail": imageOutput(thumbnailUrl, width: thumbnailWidth, height: thumbnailHeight, role: "thumbnail"),
        "roiCrops": [
          "leftEdge": imageOutput(leftEdgeUrl, width: 96, height: 960, role: "roi_crop")
        ],
        "transform": [
          "version": cardRectificationVersion,
          "sourcePreviewCorners": previewCorners.toDictionary(),
          "sourcePhotoCorners": photoCorners.toDictionary(),
          "rectifiedSize": ["width": outputSize.width, "height": outputSize.height],
          "recognitionSize": ["width": recognitionWidth, "height": recognitionHeight],
          "roiMappingVersion": cardRoiMappingVersion
        ],
        "roiManifest": roiManifest(),
        "message": nil
      ]
    } catch {
      return failed(scanId: scanId, message: error.localizedDescription)
    }
  }

  static func deleteOutputs(scanId: String) -> [String: Any?] {
    do {
      let root = try rootDirectory().standardizedFileURL
      let target = root.appendingPathComponent(scanId).standardizedFileURL
      guard target.path.hasPrefix(root.path) else {
        return ["status": "failed", "scanId": scanId, "deletedCount": 0, "message": "Refused to delete outside rectification cache."]
      }
      let deletedCount = countFiles(target)
      if FileManager.default.fileExists(atPath: target.path) {
        try FileManager.default.removeItem(at: target)
      }
      return ["status": "success", "scanId": scanId, "deletedCount": deletedCount, "message": nil]
    } catch {
      return ["status": "failed", "scanId": scanId, "deletedCount": 0, "message": error.localizedDescription]
    }
  }

  private static func perspectiveCorrect(_ image: CIImage, corners: Quad, sourceHeight: Double) throws -> CIImage {
    guard let filter = CIFilter(name: "CIPerspectiveCorrection") else {
      throw NSError(domain: "StackrCardVision", code: 1, userInfo: [NSLocalizedDescriptionKey: "CIPerspectiveCorrection is unavailable."])
    }
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(ciVector(corners.topLeft, sourceHeight: sourceHeight), forKey: "inputTopLeft")
    filter.setValue(ciVector(corners.topRight, sourceHeight: sourceHeight), forKey: "inputTopRight")
    filter.setValue(ciVector(corners.bottomRight, sourceHeight: sourceHeight), forKey: "inputBottomRight")
    filter.setValue(ciVector(corners.bottomLeft, sourceHeight: sourceHeight), forKey: "inputBottomLeft")
    guard let output = filter.outputImage else {
      throw NSError(domain: "StackrCardVision", code: 2, userInfo: [NSLocalizedDescriptionKey: "Perspective correction produced no output."])
    }
    return output
  }

  private static func render(_ image: CIImage, width: Int, height: Int) -> UIImage {
    let context = CIContext()
    let extent = image.extent
    let output = UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { rendererContext in
      rendererContext.cgContext.setFillColor(UIColor.white.cgColor)
      rendererContext.cgContext.fill(CGRect(x: 0, y: 0, width: width, height: height))
      guard let cgImage = context.createCGImage(image, from: extent) else { return }
      UIImage(cgImage: cgImage).draw(in: CGRect(x: 0, y: 0, width: width, height: height))
    }
    return output
  }

  private static func resize(_ image: UIImage, width: Int, height: Int) -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { _ in
      image.draw(in: CGRect(x: 0, y: 0, width: width, height: height))
    }
  }

  private static func cropAndResize(
    _ image: UIImage,
    x: Double,
    y: Double,
    width: Double,
    height: Double,
    outputWidth: Int,
    outputHeight: Int
  ) -> UIImage {
    guard let cgImage = image.cgImage else {
      return resize(image, width: outputWidth, height: outputHeight)
    }
    let sourceWidth = CGFloat(cgImage.width)
    let sourceHeight = CGFloat(cgImage.height)
    let cropRect = CGRect(
      x: sourceWidth * CGFloat(x),
      y: sourceHeight * CGFloat(y),
      width: sourceWidth * CGFloat(width),
      height: sourceHeight * CGFloat(height)
    ).integral.intersection(CGRect(x: 0, y: 0, width: sourceWidth, height: sourceHeight))
    guard let cropped = cgImage.cropping(to: cropRect) else {
      return resize(image, width: outputWidth, height: outputHeight)
    }
    return resize(UIImage(cgImage: cropped), width: outputWidth, height: outputHeight)
  }

  private static func previewQuadToPhotoQuad(
    _ quad: Quad,
    photoWidth: Int,
    photoHeight: Int,
    previewWidth: Int,
    previewHeight: Int,
    rotationDegrees: Int,
    mirrored: Bool,
    resizeMode: String
  ) -> Quad {
    Quad(
      topLeft: previewPointToPhotoPoint(quad.topLeft, photoWidth: photoWidth, photoHeight: photoHeight, previewWidth: previewWidth, previewHeight: previewHeight, rotationDegrees: rotationDegrees, mirrored: mirrored, resizeMode: resizeMode),
      topRight: previewPointToPhotoPoint(quad.topRight, photoWidth: photoWidth, photoHeight: photoHeight, previewWidth: previewWidth, previewHeight: previewHeight, rotationDegrees: rotationDegrees, mirrored: mirrored, resizeMode: resizeMode),
      bottomRight: previewPointToPhotoPoint(quad.bottomRight, photoWidth: photoWidth, photoHeight: photoHeight, previewWidth: previewWidth, previewHeight: previewHeight, rotationDegrees: rotationDegrees, mirrored: mirrored, resizeMode: resizeMode),
      bottomLeft: previewPointToPhotoPoint(quad.bottomLeft, photoWidth: photoWidth, photoHeight: photoHeight, previewWidth: previewWidth, previewHeight: previewHeight, rotationDegrees: rotationDegrees, mirrored: mirrored, resizeMode: resizeMode)
    )
  }

  private static func previewPointToPhotoPoint(
    _ point: Point,
    photoWidth: Int,
    photoHeight: Int,
    previewWidth: Int,
    previewHeight: Int,
    rotationDegrees: Int,
    mirrored: Bool,
    resizeMode: String
  ) -> Point {
    let sourceWidth = rotationDegrees == 90 || rotationDegrees == 270 ? Double(photoHeight) : Double(photoWidth)
    let sourceHeight = rotationDegrees == 90 || rotationDegrees == 270 ? Double(photoWidth) : Double(photoHeight)
    let transform = previewTransform(sourceWidth: sourceWidth, sourceHeight: sourceHeight, previewWidth: Double(previewWidth), previewHeight: Double(previewHeight), resizeMode: resizeMode)
    let previewX = mirrored ? Double(previewWidth) - point.x : point.x
    let orientedX = (previewX - transform.offsetX) / transform.scaleX
    let orientedY = (point.y - transform.offsetY) / transform.scaleY

    switch rotationDegrees {
    case 90:
      return Point(x: orientedY, y: Double(photoHeight) - orientedX).clamped(width: photoWidth, height: photoHeight)
    case 180:
      return Point(x: Double(photoWidth) - orientedX, y: Double(photoHeight) - orientedY).clamped(width: photoWidth, height: photoHeight)
    case 270:
      return Point(x: Double(photoWidth) - orientedY, y: orientedX).clamped(width: photoWidth, height: photoHeight)
    default:
      return Point(x: orientedX, y: orientedY).clamped(width: photoWidth, height: photoHeight)
    }
  }

  private static func previewTransform(
    sourceWidth: Double,
    sourceHeight: Double,
    previewWidth: Double,
    previewHeight: Double,
    resizeMode: String
  ) -> PreviewTransform {
    if resizeMode == "stretch" {
      return PreviewTransform(offsetX: 0, offsetY: 0, scaleX: previewWidth / sourceWidth, scaleY: previewHeight / sourceHeight)
    }
    let sourceAspect = sourceWidth / sourceHeight
    let previewAspect = previewWidth / previewHeight
    let scale = resizeMode == "contain"
      ? (sourceAspect > previewAspect ? previewWidth / sourceWidth : previewHeight / sourceHeight)
      : (sourceAspect > previewAspect ? previewHeight / sourceHeight : previewWidth / sourceWidth)
    let displayedWidth = sourceWidth * scale
    let displayedHeight = sourceHeight * scale
    return PreviewTransform(offsetX: (previewWidth - displayedWidth) / 2, offsetY: (previewHeight - displayedHeight) / 2, scaleX: scale, scaleY: scale)
  }

  private static func rectifiedOutputSize(_ corners: Quad) -> (width: Int, height: Int) {
    let cardWidth = max(1, (corners.topLeft.distance(to: corners.topRight) + corners.bottomLeft.distance(to: corners.bottomRight)) / 2)
    let cardHeight = max(1, (corners.topLeft.distance(to: corners.bottomLeft) + corners.topRight.distance(to: corners.bottomRight)) / 2)
    let targetHeight = max(cardHeight, cardWidth / rectifiedCardAspectRatio)
    let targetWidth = targetHeight * rectifiedCardAspectRatio
    return (max(recognitionWidth, Int(targetWidth.rounded())), max(recognitionHeight, Int(targetHeight.rounded())))
  }

  private static func ciVector(_ point: Point, sourceHeight: Double) -> CIVector {
    CIVector(x: point.x, y: sourceHeight - point.y)
  }

  private static func savePng(_ image: UIImage, to url: URL) throws {
    guard let data = image.pngData() else {
      throw NSError(domain: "StackrCardVision", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to encode PNG output."])
    }
    try data.write(to: url, options: .atomic)
  }

  private static func outputDirectory(scanId: String) throws -> URL {
    let directory = try rootDirectory().appendingPathComponent(scanId)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
    return directory
  }

  private static func rootDirectory() throws -> URL {
    guard let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
      throw NSError(domain: "StackrCardVision", code: 4, userInfo: [NSLocalizedDescriptionKey: "Cache directory unavailable."])
    }
    let root = cache.appendingPathComponent("stackr-card-rectification")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: nil)
    return root
  }

  private static func imageOutput(_ url: URL, width: Int, height: Int, role: String) -> [String: Any?] {
    [
      "uri": url.absoluteString,
      "width": width,
      "height": height,
      "role": role,
      "mimeType": "image/png"
    ]
  }

  private static func roiManifest() -> [String: Any?] {
    [
      "version": cardRoiMappingVersion,
      "cardAspectRatio": rectifiedCardAspectRatio,
      "coordinateSpace": "rectified_card_normalized",
      "regions": [
        roi("fullFront", "Full front", 0, 0, 1, 1),
        roi("fullBack", "Full back", 0, 0, 1, 1),
        roi("cardTitle", "Card title", 0.07, 0.035, 0.66, 0.085),
        roi("artwork", "Artwork", 0.075, 0.18, 0.85, 0.36),
        roi("collectorNumber", "Collector number", 0.06, 0.855, 0.34, 0.055),
        roi("setRarity", "Set / rarity", 0.38, 0.845, 0.3, 0.07),
        roi("regulationCopyright", "Regulation / copyright", 0.055, 0.905, 0.89, 0.07),
        roi("leftEdge", "Left edge", 0, 0.04, 0.08, 0.92)
      ]
    ]
  }

  private static func roi(_ id: String, _ label: String, _ x: Double, _ y: Double, _ width: Double, _ height: Double) -> [String: Any?] {
    [
      "id": id,
      "label": label,
      "rect": ["x": x, "y": y, "width": width, "height": height]
    ]
  }

  private static func fileUrl(from uri: String) -> URL {
    if let url = URL(string: uri), url.isFileURL {
      return url
    }
    return URL(fileURLWithPath: uri)
  }

  private static func countFiles(_ url: URL) -> Int {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else { return 0 }
    if !isDirectory.boolValue { return 1 }
    let children = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)) ?? []
    return children.reduce(0) { $0 + countFiles($1) }
  }

  private static func failed(scanId: String?, message: String) -> [String: Any?] {
    [
      "status": "failed",
      "scanId": scanId,
      "rectifiedFull": nil,
      "recognitionCrop": nil,
      "ocrSourceCrop": nil,
      "thumbnail": nil,
      "roiCrops": nil,
      "transform": nil,
      "roiManifest": roiManifest(),
      "message": message
    ]
  }

  private static func quad(from value: [String: Any?]?) -> Quad? {
    guard let value,
      let topLeft = point(from: value["topLeft"] as? [String: Any?]),
      let topRight = point(from: value["topRight"] as? [String: Any?]),
      let bottomRight = point(from: value["bottomRight"] as? [String: Any?]),
      let bottomLeft = point(from: value["bottomLeft"] as? [String: Any?]) else {
      return nil
    }
    return Quad(topLeft: topLeft, topRight: topRight, bottomRight: bottomRight, bottomLeft: bottomLeft)
  }

  private static func point(from value: [String: Any?]?) -> Point? {
    guard let value else { return nil }
    let x = doubleValue(value["x"] as? Any, fallback: .nan)
    let y = doubleValue(value["y"] as? Any, fallback: .nan)
    guard x.isFinite, y.isFinite else { return nil }
    return Point(x: x, y: y)
  }

  private static func intValue(_ value: Any?, fallback: Int) -> Int {
    if let value = value as? Int { return value }
    if let value = value as? Double { return Int(value) }
    if let value = value as? NSNumber { return value.intValue }
    return fallback
  }

  private static func doubleValue(_ value: Any?, fallback: Double) -> Double {
    if let value = value as? Double { return value }
    if let value = value as? Int { return Double(value) }
    if let value = value as? NSNumber { return value.doubleValue }
    return fallback
  }

  private static func normalisedRotation(_ value: Int) -> Int {
    let normalised = ((value / 90) * 90 % 360 + 360) % 360
    return [90, 180, 270].contains(normalised) ? normalised : 0
  }
}

private struct Point {
  let x: Double
  let y: Double

  func distance(to other: Point) -> Double {
    hypot(x - other.x, y - other.y)
  }

  func clamped(width: Int, height: Int) -> Point {
    Point(x: min(max(0, x), Double(width)), y: min(max(0, y), Double(height)))
  }

  func toDictionary() -> [String: Double] {
    ["x": x, "y": y]
  }
}

private struct Quad {
  let topLeft: Point
  let topRight: Point
  let bottomRight: Point
  let bottomLeft: Point

  func toDictionary() -> [String: [String: Double]] {
    [
      "topLeft": topLeft.toDictionary(),
      "topRight": topRight.toDictionary(),
      "bottomRight": bottomRight.toDictionary(),
      "bottomLeft": bottomLeft.toDictionary()
    ]
  }
}

private struct PreviewTransform {
  let offsetX: Double
  let offsetY: Double
  let scaleX: Double
  let scaleY: Double
}
