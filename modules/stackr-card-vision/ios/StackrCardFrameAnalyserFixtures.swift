import Foundation

enum StackrCardFrameAnalyserFixtures {
  private static let width = 160
  private static let height = 224

  private struct PixelPoint {
    let x: Double
    let y: Double
  }

  private struct Expectation {
    let cardDetected: Bool
    let qualityAccepted: Bool
    let reasons: [CardFrameAnalyserFailureReason]
  }

  private struct Fixture {
    let name: String
    let luminance: [UInt8]
    let expectation: Expectation
  }

  static func runFixtureTests() -> [String: Any?] {
    let config = CardFrameAnalyserQualityConfig.default
    let tests = fixtures().map { fixture -> [String: Any?] in
      let result = StackrCardFrameAnalyser.analyseLuminance(
        fixture.luminance,
        width: width,
        height: height,
        rowStride: width,
        guide: guide(),
        config: config
      )
      let reasonsMatch = fixture.expectation.reasons.allSatisfy { result.failureReasons.contains($0) }
      let passed = result.cardDetected == fixture.expectation.cardDetected &&
        result.qualityAccepted == fixture.expectation.qualityAccepted &&
        reasonsMatch
      return [
        "name": fixture.name,
        "passed": passed,
        "expectedReasons": fixture.expectation.reasons.map(\.rawValue),
        "actualReasons": result.failureReasons.map(\.rawValue),
        "result": result.toDictionary()
      ]
    }
    let passedCount = tests.filter { $0["passed"] as? Bool == true }.count
    let failedCount = tests.count - passedCount
    return [
      "status": failedCount == 0 ? "passed" : "failed",
      "configVersion": config.version,
      "fixtureCount": tests.count,
      "passedCount": passedCount,
      "failedCount": failedCount,
      "tests": tests,
      "message": failedCount == 0
        ? "Native card frame analyser fixtures passed."
        : "Native card frame analyser fixtures reported \(failedCount) failure(s)."
    ]
  }

  static func benchmark(fixtureCount: Int) -> [String: Any?] {
    let config = CardFrameAnalyserQualityConfig.default
    let count = max(100, fixtureCount)
    let seedFixtures = fixtures().filter { $0.name != "no-card" }
    var durations: [Double] = []

    for index in 0..<count {
      let fixture = seedFixtures[index % seedFixtures.count]
      let result = StackrCardFrameAnalyser.analyseLuminance(
        fixture.luminance,
        width: width,
        height: height,
        rowStride: width,
        guide: guide(),
        config: config
      )
      durations.append(result.processingMs)
    }

    durations.sort()
    return [
      "status": "passed",
      "configVersion": config.version,
      "fixtureCount": count,
      "medianMs": percentile(durations, ratio: 0.5),
      "p95Ms": percentile(durations, ratio: 0.95),
      "maxMs": durations.last ?? 0,
      "message": "Native card frame analyser processed \(count) procedural fixtures."
    ]
  }

  private static func fixtures() -> [Fixture] {
    let noCard = canvas(52)

    var correct = canvas(42)
    drawPolygon(&correct, polygon: rotatedCard(center: PixelPoint(x: 80, y: 112), cardWidth: 91, cardHeight: 127, degrees: 0), fillValue: 184)

    var rotated = canvas(42)
    drawPolygon(&rotated, polygon: rotatedCard(center: PixelPoint(x: 80, y: 112), cardWidth: 86, cardHeight: 121, degrees: -11), fillValue: 184)

    var severePerspective = canvas(42)
    drawPolygon(
      &severePerspective,
      polygon: [
        PixelPoint(x: 60, y: 46),
        PixelPoint(x: 101, y: 54),
        PixelPoint(x: 129, y: 178),
        PixelPoint(x: 31, y: 177)
      ],
      fillValue: 184
    )

    var blurredSource = canvas(42)
    drawPolygon(&blurredSource, polygon: rotatedCard(center: PixelPoint(x: 80, y: 112), cardWidth: 91, cardHeight: 127, degrees: 0), fillValue: 184)
    let blurred = boxBlur(blurredSource, radius: 4, passes: 3)

    var glare = canvas(42)
    drawPolygon(&glare, polygon: rotatedCard(center: PixelPoint(x: 80, y: 112), cardWidth: 91, cardHeight: 127, degrees: 0), fillValue: 184)
    drawCircle(&glare, center: PixelPoint(x: 105, y: 77), radius: 23, value: 255)

    var dark = canvas(14)
    drawPolygon(&dark, polygon: rotatedCard(center: PixelPoint(x: 80, y: 112), cardWidth: 91, cardHeight: 127, degrees: 0), fillValue: 25, borderValue: 118)

    var clipped = canvas(42)
    drawPolygon(
      &clipped,
      polygon: [
        PixelPoint(x: -8, y: 38),
        PixelPoint(x: 83, y: 38),
        PixelPoint(x: 83, y: 166),
        PixelPoint(x: -8, y: 166)
      ],
      fillValue: 184
    )

    var finger = canvas(42)
    drawPolygon(&finger, polygon: rotatedCard(center: PixelPoint(x: 80, y: 112), cardWidth: 91, cardHeight: 127, degrees: 0), fillValue: 184)
    drawCircle(&finger, center: PixelPoint(x: 34, y: 48), radius: 20, value: 18)

    var twoCards = canvas(42)
    drawPolygon(&twoCards, polygon: rotatedCard(center: PixelPoint(x: 49, y: 112), cardWidth: 54, cardHeight: 76, degrees: 0), fillValue: 184)
    drawPolygon(&twoCards, polygon: rotatedCard(center: PixelPoint(x: 112, y: 112), cardWidth: 54, cardHeight: 76, degrees: 0), fillValue: 184)

    var nonCard = canvas(42)
    drawPolygon(
      &nonCard,
      polygon: [
        PixelPoint(x: 20, y: 82),
        PixelPoint(x: 140, y: 82),
        PixelPoint(x: 140, y: 139),
        PixelPoint(x: 20, y: 139)
      ],
      fillValue: 184
    )

    return [
      Fixture(name: "no-card", luminance: noCard, expectation: Expectation(cardDetected: false, qualityAccepted: false, reasons: [.noCard])),
      Fixture(name: "correctly-framed-card", luminance: correct, expectation: Expectation(cardDetected: true, qualityAccepted: true, reasons: [])),
      Fixture(name: "rotated-card", luminance: rotated, expectation: Expectation(cardDetected: true, qualityAccepted: true, reasons: [])),
      Fixture(name: "severe-perspective", luminance: severePerspective, expectation: Expectation(cardDetected: false, qualityAccepted: false, reasons: [.perspective])),
      Fixture(name: "blurred-card", luminance: blurred, expectation: Expectation(cardDetected: true, qualityAccepted: false, reasons: [.blur])),
      Fixture(name: "glare", luminance: glare, expectation: Expectation(cardDetected: true, qualityAccepted: false, reasons: [.glare])),
      Fixture(name: "dark-image", luminance: dark, expectation: Expectation(cardDetected: true, qualityAccepted: false, reasons: [.underexposed])),
      Fixture(name: "clipped-edge", luminance: clipped, expectation: Expectation(cardDetected: true, qualityAccepted: false, reasons: [.edgeClipped])),
      Fixture(name: "finger-over-corner", luminance: finger, expectation: Expectation(cardDetected: true, qualityAccepted: false, reasons: [.cornerOccluded])),
      Fixture(name: "two-visible-cards", luminance: twoCards, expectation: Expectation(cardDetected: false, qualityAccepted: false, reasons: [.multipleCards])),
      Fixture(name: "rectangular-non-card-object", luminance: nonCard, expectation: Expectation(cardDetected: false, qualityAccepted: false, reasons: [.nonCardRectangle, .aspectRatio]))
    ]
  }

  private static func guide() -> CardFrameAnalyserGuide {
    CardFrameAnalyserGuide(x: 0.08, y: 0.06, width: 0.84, height: 0.88)
  }

  private static func canvas(_ value: UInt8) -> [UInt8] {
    Array(repeating: value, count: width * height)
  }

  private static func setPixel(_ pixels: inout [UInt8], x: Double, y: Double, value: UInt8) {
    let ix = Int(x.rounded())
    let iy = Int(y.rounded())
    if ix < 0 || iy < 0 || ix >= width || iy >= height { return }
    pixels[iy * width + ix] = value
  }

  private static func drawPolygon(
    _ pixels: inout [UInt8],
    polygon: [PixelPoint],
    fillValue: UInt8,
    borderValue: UInt8 = 18,
    borderThickness: Int = 3
  ) {
    let minX = Int(floor(polygon.map(\.x).min() ?? 0))
    let maxX = Int(ceil(polygon.map(\.x).max() ?? 0))
    let minY = Int(floor(polygon.map(\.y).min() ?? 0))
    let maxY = Int(ceil(polygon.map(\.y).max() ?? 0))

    for y in minY...maxY {
      for x in minX...maxX where pointInPolygon(PixelPoint(x: Double(x), y: Double(y)), polygon: polygon) {
        setPixel(&pixels, x: Double(x), y: Double(y), value: fillValue)
      }
    }

    for index in polygon.indices {
      drawLine(&pixels, from: polygon[index], to: polygon[(index + 1) % polygon.count], value: borderValue, thickness: borderThickness)
    }
  }

  private static func drawLine(_ pixels: inout [UInt8], from: PixelPoint, to: PixelPoint, value: UInt8, thickness: Int) {
    let steps = max(Int(max(abs(to.x - from.x), abs(to.y - from.y)).rounded()), 1)
    for step in 0...steps {
      let t = Double(step) / Double(steps)
      let x = from.x + (to.x - from.x) * t
      let y = from.y + (to.y - from.y) * t
      for oy in -thickness...thickness {
        for ox in -thickness...thickness where hypot(Double(ox), Double(oy)) <= Double(thickness) {
          setPixel(&pixels, x: x + Double(ox), y: y + Double(oy), value: value)
        }
      }
    }
  }

  private static func drawCircle(_ pixels: inout [UInt8], center: PixelPoint, radius: Double, value: UInt8) {
    for y in Int(floor(center.y - radius))...Int(ceil(center.y + radius)) {
      for x in Int(floor(center.x - radius))...Int(ceil(center.x + radius)) where hypot(Double(x) - center.x, Double(y) - center.y) <= radius {
        setPixel(&pixels, x: Double(x), y: Double(y), value: value)
      }
    }
  }

  private static func rotatedCard(center: PixelPoint, cardWidth: Double, cardHeight: Double, degrees: Double) -> [PixelPoint] {
    let radians = degrees * Double.pi / 180
    let cosValue = cos(radians)
    let sinValue = sin(radians)
    let halfWidth = cardWidth / 2
    let halfHeight = cardHeight / 2
    return [
      PixelPoint(x: -halfWidth, y: -halfHeight),
      PixelPoint(x: halfWidth, y: -halfHeight),
      PixelPoint(x: halfWidth, y: halfHeight),
      PixelPoint(x: -halfWidth, y: halfHeight)
    ].map { point in
      PixelPoint(
        x: center.x + point.x * cosValue - point.y * sinValue,
        y: center.y + point.x * sinValue + point.y * cosValue
      )
    }
  }

  private static func pointInPolygon(_ point: PixelPoint, polygon: [PixelPoint]) -> Bool {
    var inside = false
    var previousIndex = polygon.count - 1
    for (index, current) in polygon.enumerated() {
      let previous = polygon[previousIndex]
      let intersects = (current.y > point.y) != (previous.y > point.y) &&
        point.x < ((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y) == 0 ? 1 : (previous.y - current.y)) + current.x
      if intersects { inside.toggle() }
      previousIndex = index
    }
    return inside
  }

  private static func boxBlur(_ source: [UInt8], radius: Int, passes: Int) -> [UInt8] {
    var current = source
    for _ in 0..<passes {
      var next = current
      for y in 0..<height {
        for x in 0..<width {
          var total = 0
          var count = 0
          for oy in -radius...radius {
            for ox in -radius...radius {
              let sx = x + ox
              let sy = y + oy
              if sx < 0 || sy < 0 || sx >= width || sy >= height { continue }
              total += Int(current[sy * width + sx])
              count += 1
            }
          }
          next[y * width + x] = UInt8(total / count)
        }
      }
      current = next
    }
    return current
  }

  private static func percentile(_ values: [Double], ratio: Double) -> Double {
    if values.isEmpty { return 0 }
    let index = min(values.count - 1, max(0, Int(ceil(Double(values.count) * ratio)) - 1))
    return values[index]
  }
}
