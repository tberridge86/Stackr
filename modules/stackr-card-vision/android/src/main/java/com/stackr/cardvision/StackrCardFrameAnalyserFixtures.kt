package com.stackr.cardvision

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

internal object StackrCardFrameAnalyserFixtures {
  private const val width = 160
  private const val height = 224

  private data class PixelPoint(
    val x: Double,
    val y: Double
  )

  private data class FixtureExpectation(
    val cardDetected: Boolean,
    val qualityAccepted: Boolean,
    val failureReasons: List<CardFrameAnalyserFailureReason>
  )

  private data class Fixture(
    val name: String,
    val luminance: ByteArray,
    val expectation: FixtureExpectation
  )

  fun runFixtureTests(): Map<String, Any?> {
    val config = CardFrameAnalyserQualityConfig.default
    val tests = fixtures().map { fixture ->
      val result = StackrCardFrameAnalyser.analyseLuminance(
        luminance = fixture.luminance,
        width = width,
        height = height,
        rowStride = width,
        guide = guide(),
        config = config
      )
      val expectedReasons = fixture.expectation.failureReasons
      val reasonsMatch = expectedReasons.all { result.failureReasons.contains(it) }
      val passed = result.cardDetected == fixture.expectation.cardDetected &&
        result.qualityAccepted == fixture.expectation.qualityAccepted &&
        reasonsMatch

      mapOf(
        "name" to fixture.name,
        "passed" to passed,
        "expectedReasons" to expectedReasons.map { it.code },
        "actualReasons" to result.failureReasons.map { it.code },
        "result" to result.toMap()
      )
    }
    val passedCount = tests.count { it["passed"] == true }
    val failedCount = tests.size - passedCount

    return mapOf(
      "status" to if (failedCount == 0) "passed" else "failed",
      "configVersion" to config.version,
      "fixtureCount" to tests.size,
      "passedCount" to passedCount,
      "failedCount" to failedCount,
      "tests" to tests,
      "message" to if (failedCount == 0) {
        "Native card frame analyser fixtures passed."
      } else {
        "Native card frame analyser fixtures reported $failedCount failure(s)."
      }
    )
  }

  fun benchmark(fixtureCount: Int): Map<String, Any?> {
    val config = CardFrameAnalyserQualityConfig.default
    val count = max(100, fixtureCount)
    val seedFixtures = fixtures().filter { it.name != "no-card" }
    val durations = ArrayList<Double>()

    for (index in 0 until count) {
      val fixture = seedFixtures[index % seedFixtures.size]
      val result = StackrCardFrameAnalyser.analyseLuminance(
        luminance = fixture.luminance.copyOf(),
        width = width,
        height = height,
        rowStride = width,
        guide = guide(),
        config = config
      )
      durations.add(result.processingMs)
    }

    durations.sort()
    return mapOf(
      "status" to "passed",
      "configVersion" to config.version,
      "fixtureCount" to count,
      "medianMs" to percentile(durations, 0.5),
      "p95Ms" to percentile(durations, 0.95),
      "maxMs" to (durations.lastOrNull() ?: 0.0),
      "message" to "Native card frame analyser processed $count procedural fixtures."
    )
  }

  private fun fixtures(): List<Fixture> {
    val noCard = canvas(52)

    val correct = canvas(42)
    drawPolygon(correct, rotatedCard(PixelPoint(80.0, 112.0), 91.0, 127.0, 0.0), 184)

    val rotated = canvas(42)
    drawPolygon(rotated, rotatedCard(PixelPoint(80.0, 112.0), 86.0, 121.0, -11.0), 184)

    val severePerspective = canvas(42)
    drawPolygon(
      severePerspective,
      listOf(
        PixelPoint(60.0, 46.0),
        PixelPoint(101.0, 54.0),
        PixelPoint(129.0, 178.0),
        PixelPoint(31.0, 177.0)
      ),
      184
    )

    val blurredSource = canvas(42)
    drawPolygon(blurredSource, rotatedCard(PixelPoint(80.0, 112.0), 91.0, 127.0, 0.0), 184)
    val blurred = boxBlur(blurredSource, 4, 3)

    val glare = canvas(42)
    drawPolygon(glare, rotatedCard(PixelPoint(80.0, 112.0), 91.0, 127.0, 0.0), 184)
    drawCircle(glare, PixelPoint(105.0, 77.0), 23.0, 255)

    val dark = canvas(14)
    drawPolygon(dark, rotatedCard(PixelPoint(80.0, 112.0), 91.0, 127.0, 0.0), 25, 118)

    val clipped = canvas(42)
    drawPolygon(
      clipped,
      listOf(
        PixelPoint(-8.0, 38.0),
        PixelPoint(83.0, 38.0),
        PixelPoint(83.0, 166.0),
        PixelPoint(-8.0, 166.0)
      ),
      184
    )

    val finger = canvas(42)
    drawPolygon(finger, rotatedCard(PixelPoint(80.0, 112.0), 91.0, 127.0, 0.0), 184)
    drawCircle(finger, PixelPoint(34.0, 48.0), 20.0, 18)

    val twoCards = canvas(42)
    drawPolygon(twoCards, rotatedCard(PixelPoint(49.0, 112.0), 54.0, 76.0, 0.0), 184)
    drawPolygon(twoCards, rotatedCard(PixelPoint(112.0, 112.0), 54.0, 76.0, 0.0), 184)

    val nonCard = canvas(42)
    drawPolygon(
      nonCard,
      listOf(
        PixelPoint(20.0, 82.0),
        PixelPoint(140.0, 82.0),
        PixelPoint(140.0, 139.0),
        PixelPoint(20.0, 139.0)
      ),
      184
    )

    return listOf(
      Fixture(
        "no-card",
        noCard,
        FixtureExpectation(false, false, listOf(CardFrameAnalyserFailureReason.NO_CARD))
      ),
      Fixture(
        "correctly-framed-card",
        correct,
        FixtureExpectation(true, true, emptyList())
      ),
      Fixture(
        "rotated-card",
        rotated,
        FixtureExpectation(true, true, emptyList())
      ),
      Fixture(
        "severe-perspective",
        severePerspective,
        FixtureExpectation(false, false, listOf(CardFrameAnalyserFailureReason.PERSPECTIVE))
      ),
      Fixture(
        "blurred-card",
        blurred,
        FixtureExpectation(true, false, listOf(CardFrameAnalyserFailureReason.BLUR))
      ),
      Fixture(
        "glare",
        glare,
        FixtureExpectation(true, false, listOf(CardFrameAnalyserFailureReason.GLARE))
      ),
      Fixture(
        "dark-image",
        dark,
        FixtureExpectation(true, false, listOf(CardFrameAnalyserFailureReason.UNDEREXPOSED))
      ),
      Fixture(
        "clipped-edge",
        clipped,
        FixtureExpectation(true, false, listOf(CardFrameAnalyserFailureReason.EDGE_CLIPPED))
      ),
      Fixture(
        "finger-over-corner",
        finger,
        FixtureExpectation(true, false, listOf(CardFrameAnalyserFailureReason.CORNER_OCCLUDED))
      ),
      Fixture(
        "two-visible-cards",
        twoCards,
        FixtureExpectation(false, false, listOf(CardFrameAnalyserFailureReason.MULTIPLE_CARDS))
      ),
      Fixture(
        "rectangular-non-card-object",
        nonCard,
        FixtureExpectation(
          false,
          false,
          listOf(CardFrameAnalyserFailureReason.NON_CARD_RECTANGLE, CardFrameAnalyserFailureReason.ASPECT_RATIO)
        )
      )
    )
  }

  private fun guide(): CardFrameAnalyserGuide = CardFrameAnalyserGuide(0.08, 0.06, 0.84, 0.88)

  private fun canvas(value: Int): ByteArray = ByteArray(width * height) { value.toByte() }

  private fun setPixel(pixels: ByteArray, x: Double, y: Double, value: Int) {
    val ix = x.roundToInt()
    val iy = y.roundToInt()
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return
    pixels[iy * width + ix] = value.coerceIn(0, 255).toByte()
  }

  private fun drawPolygon(
    pixels: ByteArray,
    polygon: List<PixelPoint>,
    fillValue: Int,
    borderValue: Int = 18,
    borderThickness: Int = 3
  ) {
    val minX = floor(polygon.minOf { it.x }).toInt()
    val maxX = ceil(polygon.maxOf { it.x }).toInt()
    val minY = floor(polygon.minOf { it.y }).toInt()
    val maxY = ceil(polygon.maxOf { it.y }).toInt()

    for (y in minY..maxY) {
      for (x in minX..maxX) {
        if (pointInPolygon(PixelPoint(x.toDouble(), y.toDouble()), polygon)) {
          setPixel(pixels, x.toDouble(), y.toDouble(), fillValue)
        }
      }
    }

    polygon.forEachIndexed { index, point ->
      drawLine(pixels, point, polygon[(index + 1) % polygon.size], borderValue, borderThickness)
    }
  }

  private fun drawLine(pixels: ByteArray, from: PixelPoint, to: PixelPoint, value: Int, thickness: Int) {
    val steps = max(abs(to.x - from.x), abs(to.y - from.y)).roundToInt().coerceAtLeast(1)
    for (step in 0..steps) {
      val t = step.toDouble() / steps
      val x = from.x + (to.x - from.x) * t
      val y = from.y + (to.y - from.y) * t
      for (oy in -thickness..thickness) {
        for (ox in -thickness..thickness) {
          if (hypot(ox.toDouble(), oy.toDouble()) <= thickness) {
            setPixel(pixels, x + ox, y + oy, value)
          }
        }
      }
    }
  }

  private fun drawCircle(pixels: ByteArray, center: PixelPoint, radius: Double, value: Int) {
    for (y in floor(center.y - radius).toInt()..ceil(center.y + radius).toInt()) {
      for (x in floor(center.x - radius).toInt()..ceil(center.x + radius).toInt()) {
        if (hypot(x - center.x, y - center.y) <= radius) {
          setPixel(pixels, x.toDouble(), y.toDouble(), value)
        }
      }
    }
  }

  private fun rotatedCard(center: PixelPoint, cardWidth: Double, cardHeight: Double, degrees: Double): List<PixelPoint> {
    val radians = degrees * Math.PI / 180.0
    val cos = cos(radians)
    val sin = sin(radians)
    val halfWidth = cardWidth / 2
    val halfHeight = cardHeight / 2
    return listOf(
      PixelPoint(-halfWidth, -halfHeight),
      PixelPoint(halfWidth, -halfHeight),
      PixelPoint(halfWidth, halfHeight),
      PixelPoint(-halfWidth, halfHeight)
    ).map { point ->
      PixelPoint(
        x = center.x + point.x * cos - point.y * sin,
        y = center.y + point.x * sin + point.y * cos
      )
    }
  }

  private fun pointInPolygon(point: PixelPoint, polygon: List<PixelPoint>): Boolean {
    var inside = false
    var previousIndex = polygon.size - 1
    polygon.forEachIndexed { index, current ->
      val previous = polygon[previousIndex]
      val intersects = (current.y > point.y) != (previous.y > point.y) &&
        point.x < ((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y).takeIf { it != 0.0 } ?: 1.0) + current.x
      if (intersects) inside = !inside
      previousIndex = index
    }
    return inside
  }

  private fun boxBlur(source: ByteArray, radius: Int, passes: Int): ByteArray {
    var current = source
    repeat(passes) {
      val next = ByteArray(current.size)
      for (y in 0 until height) {
        for (x in 0 until width) {
          var total = 0
          var count = 0
          for (oy in -radius..radius) {
            for (ox in -radius..radius) {
              val sx = x + ox
              val sy = y + oy
              if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
              total += current[sy * width + sx].toInt() and 0xff
              count += 1
            }
          }
          next[y * width + x] = (total / count).toByte()
        }
      }
      current = next
    }
    return current
  }

  private fun percentile(values: List<Double>, ratio: Double): Double {
    if (values.isEmpty()) return 0.0
    val index = (ceil(values.size * ratio).toInt() - 1).coerceIn(0, values.size - 1)
    return values[index]
  }
}
