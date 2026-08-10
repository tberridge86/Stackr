import CoreVideo
import CoreFoundation
import Foundation

enum CardFrameAnalyserFailureReason: String, CaseIterable {
  case noCard = "NO_CARD"
  case multipleCards = "MULTIPLE_CARDS"
  case lowFill = "LOW_FILL"
  case aspectRatio = "ASPECT_RATIO"
  case blur = "BLUR"
  case glare = "GLARE"
  case underexposed = "UNDEREXPOSED"
  case overexposed = "OVEREXPOSED"
  case perspective = "PERSPECTIVE"
  case cornerOccluded = "CORNER_OCCLUDED"
  case edgeClipped = "EDGE_CLIPPED"
  case lowConfidenceRectangle = "LOW_CONFIDENCE_RECTANGLE"
  case nonCardRectangle = "NON_CARD_RECTANGLE"
}

struct CardFrameAnalyserPoint {
  let x: Double
  let y: Double

  func toDictionary() -> [String: Double] {
    ["x": x, "y": y]
  }
}

struct CardFrameAnalyserCorners {
  let topLeft: CardFrameAnalyserPoint
  let topRight: CardFrameAnalyserPoint
  let bottomRight: CardFrameAnalyserPoint
  let bottomLeft: CardFrameAnalyserPoint

  func toDictionary() -> [String: [String: Double]] {
    [
      "topLeft": topLeft.toDictionary(),
      "topRight": topRight.toDictionary(),
      "bottomRight": bottomRight.toDictionary(),
      "bottomLeft": bottomLeft.toDictionary()
    ]
  }
}

struct CardFrameAnalyserGuide {
  let x: Double
  let y: Double
  let width: Double
  let height: Double

  static let fullFrame = CardFrameAnalyserGuide(x: 0, y: 0, width: 1, height: 1)
}

struct CardFrameAnalyserQualityConfig {
  let version: String
  let expectedCardAspectRatio: Double
  let aspectTolerance: Double
  let minDetectionAreaRatio: Double
  let minQualityFillRatio: Double
  let minAspectRatioScore: Double
  let minBlurScore: Double
  let maxGlareRatio: Double
  let maxUnderexposureRatio: Double
  let maxOverexposureRatio: Double
  let minPerspectiveScore: Double
  let minCornerEdgeSupportRatio: Double
  let minCornerMeanLuminance: Double
  let maxCornerMeanLuminance: Double
  let edgeClipMarginRatio: Double
  let minEdgeGradient: Double
  let maxPlausibleCards: Int

  static let `default` = CardFrameAnalyserQualityConfig(
    version: "stackr-card-frame-analyser-v1.0.0",
    expectedCardAspectRatio: 0.716,
    aspectTolerance: 0.18,
    minDetectionAreaRatio: 0.08,
    minQualityFillRatio: 0.34,
    minAspectRatioScore: 0.6,
    minBlurScore: 0.32,
    maxGlareRatio: 0.08,
    maxUnderexposureRatio: 0.45,
    maxOverexposureRatio: 0.28,
    minPerspectiveScore: 0.62,
    minCornerEdgeSupportRatio: 0.035,
    minCornerMeanLuminance: 42,
    maxCornerMeanLuminance: 238,
    edgeClipMarginRatio: 0.025,
    minEdgeGradient: 18,
    maxPlausibleCards: 1
  )
}

struct CardFrameAnalysisResult {
  let cardDetected: Bool
  let corners: CardFrameAnalyserCorners?
  let fillRatio: Double
  let aspectRatioScore: Double
  let blurScore: Double
  let glareRatio: Double
  let underexposureRatio: Double
  let overexposureRatio: Double
  let perspectiveScore: Double
  let allCornersVisible: Bool
  let edgeClipped: Bool
  let qualityAccepted: Bool
  let failureReasons: [CardFrameAnalyserFailureReason]
  let processingMs: Double

  func toDictionary() -> [String: Any?] {
    [
      "cardDetected": cardDetected,
      "corners": corners?.toDictionary(),
      "fillRatio": fillRatio,
      "aspectRatioScore": aspectRatioScore,
      "blurScore": blurScore,
      "glareRatio": glareRatio,
      "underexposureRatio": underexposureRatio,
      "overexposureRatio": overexposureRatio,
      "perspectiveScore": perspectiveScore,
      "allCornersVisible": allCornersVisible,
      "edgeClipped": edgeClipped,
      "qualityAccepted": qualityAccepted,
      "failureReasons": failureReasons.map(\.rawValue),
      "processingMs": processingMs
    ]
  }
}

private struct EdgeData {
  let edges: [UInt8]
  let focusScore: Double
}

private struct EdgeComponent {
  let edgeCount: Int
  let minX: Int
  let minY: Int
  let maxX: Int
  let maxY: Int
  let points: [Int]
}

private struct ExposureMetrics {
  let glareRatio: Double
  let underexposureRatio: Double
  let overexposureRatio: Double
}

private struct GeometryMetrics {
  let fillRatio: Double
  let aspectRatioScore: Double
  let perspectiveScore: Double
}

enum StackrCardFrameAnalyser {
  static func analysePixelBuffer(
    _ pixelBuffer: CVPixelBuffer,
    guide: CardFrameAnalyserGuide? = nil,
    config: CardFrameAnalyserQualityConfig = .default
  ) -> CardFrameAnalysisResult {
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let rowStride = CVPixelBufferIsPlanar(pixelBuffer)
      ? CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
      : CVPixelBufferGetBytesPerRow(pixelBuffer)
    guard let baseAddress = CVPixelBufferIsPlanar(pixelBuffer)
      ? CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0)
      : CVPixelBufferGetBaseAddress(pixelBuffer) else {
      return emptyResult(startedAt: monotonicMs(), reasons: [.noCard])
    }

    let pointer = baseAddress.assumingMemoryBound(to: UInt8.self)
    let luminance = Array(UnsafeBufferPointer(start: pointer, count: rowStride * height))
    return analyseLuminance(luminance, width: width, height: height, rowStride: rowStride, guide: guide, config: config)
  }

  static func analyseLuminance(
    _ luminance: [UInt8],
    width: Int,
    height: Int,
    rowStride: Int,
    guide: CardFrameAnalyserGuide? = nil,
    config: CardFrameAnalyserQualityConfig = .default
  ) -> CardFrameAnalysisResult {
    let startedAt = monotonicMs()
    if width < 8 || height < 8 || luminance.count < rowStride * height {
      return emptyResult(startedAt: startedAt, reasons: [.noCard])
    }

    let normalisedGuide = normaliseGuide(guide)
    let edgeData = buildGradientAndEdges(luminance, width: width, height: height, rowStride: rowStride, config: config)
    let components = collectComponents(width: width, height: height, edges: edgeData.edges)
      .filter { $0.edgeCount >= 24 }
      .sorted { $0.edgeCount > $1.edgeCount }
    let plausibleComponents = removeNestedComponents(components.filter { component in
      let boxWidth = Double(component.maxX - component.minX + 1)
      let boxHeight = Double(component.maxY - component.minY + 1)
      let area = (boxWidth * boxHeight) / Double(width * height)
      let boxAspect = min(boxWidth, boxHeight) / max(max(boxWidth, boxHeight), 0.0001)
      return area >= config.minDetectionAreaRatio && boxAspect >= 0.42 && boxAspect <= 0.92
    })

    if plausibleComponents.count > config.maxPlausibleCards {
      let exposure = exposureRatios(luminance, width: width, height: height, rowStride: rowStride, component: nil)
      return emptyResult(startedAt: startedAt, reasons: [.multipleCards]).copy(
        blurScore: finiteOrZero(edgeData.focusScore),
        glareRatio: exposure.glareRatio,
        underexposureRatio: exposure.underexposureRatio,
        overexposureRatio: exposure.overexposureRatio
      )
    }

    guard let candidate = plausibleComponents.first ?? components.first else {
      let exposure = exposureRatios(luminance, width: width, height: height, rowStride: rowStride, component: nil)
      return emptyResult(startedAt: startedAt, reasons: [.noCard]).copy(
        blurScore: finiteOrZero(edgeData.focusScore),
        glareRatio: exposure.glareRatio,
        underexposureRatio: exposure.underexposureRatio,
        overexposureRatio: exposure.overexposureRatio
      )
    }

    let corners = componentCorners(candidate, width: width, height: height)
    let geometry = calculateGeometry(corners, guide: normalisedGuide, frameWidth: width - 1, frameHeight: height - 1, config: config)
    let exposure = exposureRatios(luminance, width: width, height: height, rowStride: rowStride, component: candidate)
    let clipped = edgeClipped(corners, component: candidate, width: width, height: height, guide: normalisedGuide, config: config)
    let visibleCorners = cornerVisibility(luminance, width: width, height: height, rowStride: rowStride, edges: edgeData.edges, corners: corners, config: config) &&
      geometry.aspectRatioScore >= config.minAspectRatioScore
    let boundingArea = Double((candidate.maxX - candidate.minX + 1) * (candidate.maxY - candidate.minY + 1)) / Double(width * height)
    let probablyNonCard = plausibleComponents.isEmpty || boundingArea < config.minDetectionAreaRatio || geometry.aspectRatioScore <= 0.08
    var reasons = Set<CardFrameAnalyserFailureReason>()

    if probablyNonCard { reasons.insert(.nonCardRectangle) }
    if geometry.fillRatio < config.minQualityFillRatio { reasons.insert(.lowFill) }
    if geometry.aspectRatioScore < config.minAspectRatioScore { reasons.insert(.aspectRatio) }
    if edgeData.focusScore < config.minBlurScore { reasons.insert(.blur) }
    if exposure.glareRatio > config.maxGlareRatio { reasons.insert(.glare) }
    if exposure.underexposureRatio > config.maxUnderexposureRatio { reasons.insert(.underexposed) }
    if exposure.overexposureRatio > config.maxOverexposureRatio { reasons.insert(.overexposed) }
    if geometry.perspectiveScore < config.minPerspectiveScore { reasons.insert(.perspective) }
    if !visibleCorners { reasons.insert(.cornerOccluded) }
    if clipped { reasons.insert(.edgeClipped) }
    if candidate.edgeCount < 36 { reasons.insert(.lowConfidenceRectangle) }

    let orderedReasons = CardFrameAnalyserFailureReason.allCases.filter { reasons.contains($0) }
    let cardDetected = !probablyNonCard

    return CardFrameAnalysisResult(
      cardDetected: cardDetected,
      corners: cardDetected ? corners : nil,
      fillRatio: finiteOrZero(geometry.fillRatio),
      aspectRatioScore: finiteOrZero(geometry.aspectRatioScore),
      blurScore: finiteOrZero(edgeData.focusScore),
      glareRatio: finiteOrZero(exposure.glareRatio),
      underexposureRatio: finiteOrZero(exposure.underexposureRatio),
      overexposureRatio: finiteOrZero(exposure.overexposureRatio),
      perspectiveScore: finiteOrZero(geometry.perspectiveScore),
      allCornersVisible: visibleCorners,
      edgeClipped: clipped,
      qualityAccepted: cardDetected && orderedReasons.isEmpty,
      failureReasons: orderedReasons,
      processingMs: monotonicMs() - startedAt
    )
  }

  private static func buildGradientAndEdges(
    _ luminance: [UInt8],
    width: Int,
    height: Int,
    rowStride: Int,
    config: CardFrameAnalyserQualityConfig
  ) -> EdgeData {
    var gradients = Array(repeating: 0, count: width * height)
    var samples: [Int] = []
    var gradientSum = 0.0
    var sampleCount = 0

    for y in 1..<(height - 1) {
      for x in 1..<(width - 1) {
        let topLeft = luminanceAt(luminance, rowStride: rowStride, x: x - 1, y: y - 1)
        let top = luminanceAt(luminance, rowStride: rowStride, x: x, y: y - 1)
        let topRight = luminanceAt(luminance, rowStride: rowStride, x: x + 1, y: y - 1)
        let left = luminanceAt(luminance, rowStride: rowStride, x: x - 1, y: y)
        let right = luminanceAt(luminance, rowStride: rowStride, x: x + 1, y: y)
        let bottomLeft = luminanceAt(luminance, rowStride: rowStride, x: x - 1, y: y + 1)
        let bottom = luminanceAt(luminance, rowStride: rowStride, x: x, y: y + 1)
        let bottomRight = luminanceAt(luminance, rowStride: rowStride, x: x + 1, y: y + 1)
        let gx = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight
        let gy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
        let magnitude = min(255, Int((Double(abs(gx) + abs(gy)) / 4.0).rounded()))
        let index = y * width + x
        gradients[index] = magnitude
        if magnitude > 0 {
          samples.append(magnitude)
          gradientSum += Double(magnitude)
          sampleCount += 1
        }
      }
    }

    let meanGradient = sampleCount > 0 ? gradientSum / Double(sampleCount) : 0
    let edgeThreshold = min(88, max(config.minEdgeGradient, meanGradient * 1.1))
    let edges = gradients.map { $0 >= Int(edgeThreshold.rounded()) ? UInt8(1) : UInt8(0) }
    let sortedSamples = samples.sorted(by: >)
    let topCount = max(1, Int(Double(sortedSamples.count) * 0.12))
    let focusScore = sortedSamples.isEmpty ? 0 : Double(sortedSamples.prefix(topCount).reduce(0, +)) / Double(topCount) / 255.0
    return EdgeData(edges: edges, focusScore: clamp01(focusScore))
  }

  private static func collectComponents(width: Int, height: Int, edges: [UInt8]) -> [EdgeComponent] {
    var visited = Array(repeating: UInt8(0), count: edges.count)
    var components: [EdgeComponent] = []
    var queue = Array(repeating: 0, count: edges.count)

    for start in edges.indices where edges[start] == 1 && visited[start] == 0 {
      var head = 0
      var tail = 0
      visited[start] = 1
      queue[tail] = start
      tail += 1
      var minX = width
      var minY = height
      var maxX = 0
      var maxY = 0
      var points: [Int] = []

      while head < tail {
        let index = queue[head]
        head += 1
        let x = index % width
        let y = index / width
        points.append(index)
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)

        for dy in -1...1 {
          for dx in -1...1 where dx != 0 || dy != 0 {
            let nx = x + dx
            let ny = y + dy
            if nx < 0 || ny < 0 || nx >= width || ny >= height { continue }
            let nextIndex = ny * width + nx
            if edges[nextIndex] == 0 || visited[nextIndex] == 1 { continue }
            visited[nextIndex] = 1
            queue[tail] = nextIndex
            tail += 1
          }
        }
      }

      components.append(EdgeComponent(edgeCount: points.count, minX: minX, minY: minY, maxX: maxX, maxY: maxY, points: points))
    }

    return components
  }

  private static func removeNestedComponents(_ components: [EdgeComponent]) -> [EdgeComponent] {
    var distinct: [EdgeComponent] = []
    for component in components {
      let overlapsExisting = distinct.contains { accepted in
        boxIntersectionOverUnion(accepted, component) >= 0.72
      }
      if !overlapsExisting {
        distinct.append(component)
      }
    }
    return distinct
  }

  private static func boxIntersectionOverUnion(_ left: EdgeComponent, _ right: EdgeComponent) -> Double {
    let intersectionWidth = max(0, min(left.maxX, right.maxX) - max(left.minX, right.minX) + 1)
    let intersectionHeight = max(0, min(left.maxY, right.maxY) - max(left.minY, right.minY) + 1)
    let intersection = intersectionWidth * intersectionHeight
    let leftArea = (left.maxX - left.minX + 1) * (left.maxY - left.minY + 1)
    let rightArea = (right.maxX - right.minX + 1) * (right.maxY - right.minY + 1)
    return Double(intersection) / Double(max(1, leftArea + rightArea - intersection))
  }

  private static func componentCorners(_ component: EdgeComponent, width: Int, height: Int) -> CardFrameAnalyserCorners {
    var topLeft = (score: Double.infinity, x: component.minX, y: component.minY)
    var topRight = (score: -Double.infinity, x: component.maxX, y: component.minY)
    var bottomRight = (score: -Double.infinity, x: component.maxX, y: component.maxY)
    var bottomLeft = (score: Double.infinity, x: component.minX, y: component.maxY)

    for index in component.points {
      let x = index % width
      let y = index / width
      let sum = Double(x + y)
      let diff = Double(x - y)
      if sum < topLeft.score { topLeft = (sum, x, y) }
      if diff > topRight.score { topRight = (diff, x, y) }
      if sum > bottomRight.score { bottomRight = (sum, x, y) }
      if diff < bottomLeft.score { bottomLeft = (diff, x, y) }
    }

    return CardFrameAnalyserCorners(
      topLeft: normalisedPoint(x: topLeft.x, y: topLeft.y, width: width, height: height),
      topRight: normalisedPoint(x: topRight.x, y: topRight.y, width: width, height: height),
      bottomRight: normalisedPoint(x: bottomRight.x, y: bottomRight.y, width: width, height: height),
      bottomLeft: normalisedPoint(x: bottomLeft.x, y: bottomLeft.y, width: width, height: height)
    )
  }

  private static func exposureRatios(
    _ luminance: [UInt8],
    width: Int,
    height: Int,
    rowStride: Int,
    component: EdgeComponent?
  ) -> ExposureMetrics {
    let minX = component?.minX ?? 0
    let minY = component?.minY ?? 0
    let maxX = component?.maxX ?? width - 1
    let maxY = component?.maxY ?? height - 1
    var glare = 0
    var under = 0
    var over = 0
    var total = 0

    for y in minY...maxY {
      for x in minX...maxX {
        let value = luminanceAt(luminance, rowStride: rowStride, x: x, y: y)
        if value >= 248 { glare += 1 }
        if value <= 35 { under += 1 }
        if value >= 238 { over += 1 }
        total += 1
      }
    }

    return ExposureMetrics(
      glareRatio: total > 0 ? Double(glare) / Double(total) : 0,
      underexposureRatio: total > 0 ? Double(under) / Double(total) : 0,
      overexposureRatio: total > 0 ? Double(over) / Double(total) : 0
    )
  }

  private static func cornerVisibility(
    _ luminance: [UInt8],
    width: Int,
    height: Int,
    rowStride: Int,
    edges: [UInt8],
    corners: CardFrameAnalyserCorners,
    config: CardFrameAnalyserQualityConfig
  ) -> Bool {
    let radius = max(4, Int((Double(min(width, height)) * 0.045).rounded()))
    let points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]

    return points.allSatisfy { corner in
      let centerX = Int((corner.x * Double(width - 1)).rounded())
      let centerY = Int((corner.y * Double(height - 1)).rounded())
      var edgeCount = 0
      var total = 0
      var luminanceSum = 0

      for y in max(0, centerY - radius)...min(height - 1, centerY + radius) {
        for x in max(0, centerX - radius)...min(width - 1, centerX + radius) {
          if hypot(Double(x - centerX), Double(y - centerY)) > Double(radius) { continue }
          let index = y * width + x
          if edges[index] == 1 { edgeCount += 1 }
          luminanceSum += luminanceAt(luminance, rowStride: rowStride, x: x, y: y)
          total += 1
        }
      }

      let edgeSupportRatio = total > 0 ? Double(edgeCount) / Double(total) : 0
      let meanLuminance = total > 0 ? Double(luminanceSum) / Double(total) : 0
      return edgeSupportRatio >= config.minCornerEdgeSupportRatio &&
        meanLuminance >= config.minCornerMeanLuminance &&
        meanLuminance <= config.maxCornerMeanLuminance
    }
  }

  private static func edgeClipped(
    _ corners: CardFrameAnalyserCorners,
    component: EdgeComponent,
    width: Int,
    height: Int,
    guide: CardFrameAnalyserGuide,
    config: CardFrameAnalyserQualityConfig
  ) -> Bool {
    let margin = config.edgeClipMarginRatio
    let touchesFrame = Double(component.minX) <= Double(width) * margin ||
      Double(component.minY) <= Double(height) * margin ||
      Double(component.maxX) >= Double(width) * (1 - margin) ||
      Double(component.maxY) >= Double(height) * (1 - margin)
    let outsideGuide = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft].contains { corner in
      corner.x <= guide.x + margin ||
        corner.y <= guide.y + margin ||
        corner.x >= guide.x + guide.width - margin ||
        corner.y >= guide.y + guide.height - margin
    }
    return touchesFrame || outsideGuide
  }

  private static func calculateGeometry(
    _ corners: CardFrameAnalyserCorners,
    guide: CardFrameAnalyserGuide,
    frameWidth: Int,
    frameHeight: Int,
    config: CardFrameAnalyserQualityConfig
  ) -> GeometryMetrics {
    let top = distance(corners.topLeft, corners.topRight, frameWidth: frameWidth, frameHeight: frameHeight)
    let right = distance(corners.topRight, corners.bottomRight, frameWidth: frameWidth, frameHeight: frameHeight)
    let bottom = distance(corners.bottomLeft, corners.bottomRight, frameWidth: frameWidth, frameHeight: frameHeight)
    let left = distance(corners.topLeft, corners.bottomLeft, frameWidth: frameWidth, frameHeight: frameHeight)
    let shortSide = (top + bottom) / 2
    let longSide = (left + right) / 2
    let ratio = longSide > 0 ? shortSide / longSide : 0
    let area = polygonArea(corners)
    let guideArea = max(0.01, guide.width * guide.height)
    let sideBalance = (min(top, bottom) / max(max(top, bottom), 0.0001)) *
      (min(left, right) / max(max(left, right), 0.0001))
    let orthogonal = (
      angleScore(corners.topRight, corners.topLeft, corners.bottomLeft, frameWidth: frameWidth, frameHeight: frameHeight) +
        angleScore(corners.topLeft, corners.topRight, corners.bottomRight, frameWidth: frameWidth, frameHeight: frameHeight) +
        angleScore(corners.topRight, corners.bottomRight, corners.bottomLeft, frameWidth: frameWidth, frameHeight: frameHeight) +
        angleScore(corners.topLeft, corners.bottomLeft, corners.bottomRight, frameWidth: frameWidth, frameHeight: frameHeight)
      ) / 4

    return GeometryMetrics(
      fillRatio: clamp01(area / guideArea),
      aspectRatioScore: clamp01(1 - abs(ratio - config.expectedCardAspectRatio) / config.aspectTolerance),
      perspectiveScore: clamp01(sideBalance * orthogonal)
    )
  }

  private static func emptyResult(startedAt: Double, reasons: [CardFrameAnalyserFailureReason]) -> CardFrameAnalysisResult {
    CardFrameAnalysisResult(
      cardDetected: false,
      corners: nil,
      fillRatio: 0,
      aspectRatioScore: 0,
      blurScore: 0,
      glareRatio: 0,
      underexposureRatio: 0,
      overexposureRatio: 0,
      perspectiveScore: 0,
      allCornersVisible: false,
      edgeClipped: false,
      qualityAccepted: false,
      failureReasons: CardFrameAnalyserFailureReason.allCases.filter { reasons.contains($0) },
      processingMs: monotonicMs() - startedAt
    )
  }
}

private extension CardFrameAnalysisResult {
  func copy(
    blurScore: Double,
    glareRatio: Double,
    underexposureRatio: Double,
    overexposureRatio: Double
  ) -> CardFrameAnalysisResult {
    CardFrameAnalysisResult(
      cardDetected: cardDetected,
      corners: corners,
      fillRatio: fillRatio,
      aspectRatioScore: aspectRatioScore,
      blurScore: blurScore,
      glareRatio: glareRatio,
      underexposureRatio: underexposureRatio,
      overexposureRatio: overexposureRatio,
      perspectiveScore: perspectiveScore,
      allCornersVisible: allCornersVisible,
      edgeClipped: edgeClipped,
      qualityAccepted: qualityAccepted,
      failureReasons: failureReasons,
      processingMs: processingMs
    )
  }
}

private func normaliseGuide(_ guide: CardFrameAnalyserGuide?) -> CardFrameAnalyserGuide {
  guard let guide else { return .fullFrame }
  return CardFrameAnalyserGuide(
    x: clamp01(guide.x),
    y: clamp01(guide.y),
    width: clamp01(guide.width),
    height: clamp01(guide.height)
  )
}

private func normalisedPoint(x: Int, y: Int, width: Int, height: Int) -> CardFrameAnalyserPoint {
  CardFrameAnalyserPoint(
    x: clamp01(Double(x) / Double(width - 1)),
    y: clamp01(Double(y) / Double(height - 1))
  )
}

private func luminanceAt(_ luminance: [UInt8], rowStride: Int, x: Int, y: Int) -> Int {
  Int(luminance[y * rowStride + x])
}

private func polygonArea(_ corners: CardFrameAnalyserCorners) -> Double {
  let points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
  var area = 0.0
  for index in points.indices {
    let current = points[index]
    let next = points[(index + 1) % points.count]
    area += current.x * next.y - next.x * current.y
  }
  return abs(area) / 2
}

private func distance(_ a: CardFrameAnalyserPoint, _ b: CardFrameAnalyserPoint, frameWidth: Int, frameHeight: Int) -> Double {
  hypot((a.x - b.x) * Double(frameWidth), (a.y - b.y) * Double(frameHeight))
}

private func angleScore(
  _ a: CardFrameAnalyserPoint,
  _ b: CardFrameAnalyserPoint,
  _ c: CardFrameAnalyserPoint,
  frameWidth: Int,
  frameHeight: Int
) -> Double {
  let ux = (a.x - b.x) * Double(frameWidth)
  let uy = (a.y - b.y) * Double(frameHeight)
  let vx = (c.x - b.x) * Double(frameWidth)
  let vy = (c.y - b.y) * Double(frameHeight)
  let denominator = hypot(ux, uy) * hypot(vx, vy)
  if denominator <= 0 { return 0 }
  return clamp01(1 - abs((ux * vx + uy * vy) / denominator))
}

private func clamp01(_ value: Double) -> Double {
  max(0, min(1, value))
}

private func finiteOrZero(_ value: Double) -> Double {
  value.isFinite ? value : 0
}

private func monotonicMs() -> Double {
  CFAbsoluteTimeGetCurrent() * 1000
}
