package com.stackr.cardvision

import androidx.camera.core.ImageProxy
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal object StackrCardFrameAnalyser {
  private const val maxLuminance = 255.0

  fun analyseImageProxy(
    imageProxy: ImageProxy,
    guide: CardFrameAnalyserGuide? = null,
    config: CardFrameAnalyserQualityConfig = CardFrameAnalyserQualityConfig.default
  ): CardFrameAnalysisResult {
    val yPlane = imageProxy.planes.firstOrNull()
      ?: return emptyResult(System.nanoTime(), listOf(CardFrameAnalyserFailureReason.NO_CARD))
    val buffer = yPlane.buffer.duplicate()
    val luminance = ByteArray(buffer.remaining())
    buffer.get(luminance)

    return analyseLuminance(
      luminance = luminance,
      width = imageProxy.width,
      height = imageProxy.height,
      rowStride = yPlane.rowStride,
      guide = guide,
      config = config
    )
  }

  fun analyseLuminance(
    luminance: ByteArray,
    width: Int,
    height: Int,
    rowStride: Int = width,
    guide: CardFrameAnalyserGuide? = null,
    config: CardFrameAnalyserQualityConfig = CardFrameAnalyserQualityConfig.default
  ): CardFrameAnalysisResult {
    val startedAt = System.nanoTime()
    if (width < 8 || height < 8 || luminance.size < rowStride * height) {
      return emptyResult(startedAt, listOf(CardFrameAnalyserFailureReason.NO_CARD))
    }

    val normalisedGuide = normaliseGuide(guide)
    val edgeData = buildGradientAndEdges(luminance, width, height, rowStride, config)
    val components = collectComponents(width, height, edgeData.edges)
      .filter { it.edgeCount >= 24 }
      .sortedByDescending { it.edgeCount }
    val plausibleComponents = removeNestedComponents(components.filter { component ->
      val boxWidth = (component.maxX - component.minX + 1).toDouble()
      val boxHeight = (component.maxY - component.minY + 1).toDouble()
      val area = (boxWidth * boxHeight) / (width * height)
      val boxAspect = min(boxWidth, boxHeight) / max(max(boxWidth, boxHeight), 0.0001)
      area >= config.minDetectionAreaRatio && boxAspect >= 0.42 && boxAspect <= 0.92
    })

    if (plausibleComponents.size > config.maxPlausibleCards) {
      val exposure = exposureRatios(luminance, width, height, rowStride, null)
      return emptyResult(startedAt, listOf(CardFrameAnalyserFailureReason.MULTIPLE_CARDS)).copy(
        blurScore = finiteOrZero(edgeData.focusScore),
        glareRatio = finiteOrZero(exposure.glareRatio),
        underexposureRatio = finiteOrZero(exposure.underexposureRatio),
        overexposureRatio = finiteOrZero(exposure.overexposureRatio)
      )
    }

    val candidate = plausibleComponents.firstOrNull() ?: components.firstOrNull()
    if (candidate == null) {
      val exposure = exposureRatios(luminance, width, height, rowStride, null)
      return emptyResult(startedAt, listOf(CardFrameAnalyserFailureReason.NO_CARD)).copy(
        blurScore = finiteOrZero(edgeData.focusScore),
        glareRatio = finiteOrZero(exposure.glareRatio),
        underexposureRatio = finiteOrZero(exposure.underexposureRatio),
        overexposureRatio = finiteOrZero(exposure.overexposureRatio)
      )
    }

    val corners = componentCorners(candidate, width, height)
    val geometry = calculateGeometry(corners, normalisedGuide, width - 1, height - 1, config)
    val exposure = exposureRatios(luminance, width, height, rowStride, candidate)
    val clipped = edgeClipped(corners, candidate, width, height, normalisedGuide, config)
    val visibleCorners = cornerVisibility(luminance, width, height, rowStride, edgeData.edges, corners, config) &&
      geometry.aspectRatioScore >= config.minAspectRatioScore
    val reasons = linkedSetOf<CardFrameAnalyserFailureReason>()
    val boundingArea = ((candidate.maxX - candidate.minX + 1) * (candidate.maxY - candidate.minY + 1)).toDouble() /
      (width * height)
    val probablyNonCard = plausibleComponents.isEmpty() ||
      boundingArea < config.minDetectionAreaRatio ||
      geometry.aspectRatioScore <= 0.08

    if (probablyNonCard) reasons.add(CardFrameAnalyserFailureReason.NON_CARD_RECTANGLE)
    if (geometry.fillRatio < config.minQualityFillRatio) reasons.add(CardFrameAnalyserFailureReason.LOW_FILL)
    if (geometry.aspectRatioScore < config.minAspectRatioScore) reasons.add(CardFrameAnalyserFailureReason.ASPECT_RATIO)
    if (edgeData.focusScore < config.minBlurScore) reasons.add(CardFrameAnalyserFailureReason.BLUR)
    if (exposure.glareRatio > config.maxGlareRatio) reasons.add(CardFrameAnalyserFailureReason.GLARE)
    if (exposure.underexposureRatio > config.maxUnderexposureRatio) reasons.add(CardFrameAnalyserFailureReason.UNDEREXPOSED)
    if (exposure.overexposureRatio > config.maxOverexposureRatio) reasons.add(CardFrameAnalyserFailureReason.OVEREXPOSED)
    if (geometry.perspectiveScore < config.minPerspectiveScore) reasons.add(CardFrameAnalyserFailureReason.PERSPECTIVE)
    if (!visibleCorners) reasons.add(CardFrameAnalyserFailureReason.CORNER_OCCLUDED)
    if (clipped) reasons.add(CardFrameAnalyserFailureReason.EDGE_CLIPPED)
    if (candidate.edgeCount < 36) reasons.add(CardFrameAnalyserFailureReason.LOW_CONFIDENCE_RECTANGLE)

    val orderedReasons = CardFrameAnalyserFailureReason.ordered.filter { reasons.contains(it) }
    val cardDetected = !probablyNonCard

    return CardFrameAnalysisResult(
      cardDetected = cardDetected,
      corners = if (cardDetected) corners else null,
      fillRatio = finiteOrZero(geometry.fillRatio),
      aspectRatioScore = finiteOrZero(geometry.aspectRatioScore),
      blurScore = finiteOrZero(edgeData.focusScore),
      glareRatio = finiteOrZero(exposure.glareRatio),
      underexposureRatio = finiteOrZero(exposure.underexposureRatio),
      overexposureRatio = finiteOrZero(exposure.overexposureRatio),
      perspectiveScore = finiteOrZero(geometry.perspectiveScore),
      allCornersVisible = visibleCorners,
      edgeClipped = clipped,
      qualityAccepted = cardDetected && orderedReasons.isEmpty(),
      failureReasons = orderedReasons,
      processingMs = elapsedMs(startedAt)
    )
  }

  fun guideFromArguments(arguments: Map<String, Any>?): CardFrameAnalyserGuide? {
    val guide = arguments?.get("guide") as? Map<*, *> ?: return null
    val x = (guide["x"] as? Number)?.toDouble() ?: return null
    val y = (guide["y"] as? Number)?.toDouble() ?: return null
    val width = (guide["width"] as? Number)?.toDouble() ?: return null
    val height = (guide["height"] as? Number)?.toDouble() ?: return null
    return CardFrameAnalyserGuide(x, y, width, height)
  }

  private data class EdgeData(
    val edges: ByteArray,
    val focusScore: Double
  )

  private data class EdgeComponent(
    val edgeCount: Int,
    val minX: Int,
    val minY: Int,
    val maxX: Int,
    val maxY: Int,
    val points: IntArray
  )

  private data class ExposureMetrics(
    val glareRatio: Double,
    val underexposureRatio: Double,
    val overexposureRatio: Double
  )

  private data class GeometryMetrics(
    val fillRatio: Double,
    val aspectRatioScore: Double,
    val perspectiveScore: Double
  )

  private fun buildGradientAndEdges(
    luminance: ByteArray,
    width: Int,
    height: Int,
    rowStride: Int,
    config: CardFrameAnalyserQualityConfig
  ): EdgeData {
    val gradients = IntArray(width * height)
    val samples = ArrayList<Int>()
    var gradientSum = 0.0
    var sampleCount = 0

    for (y in 1 until height - 1) {
      for (x in 1 until width - 1) {
        val topLeft = luminanceAt(luminance, rowStride, x - 1, y - 1)
        val top = luminanceAt(luminance, rowStride, x, y - 1)
        val topRight = luminanceAt(luminance, rowStride, x + 1, y - 1)
        val left = luminanceAt(luminance, rowStride, x - 1, y)
        val right = luminanceAt(luminance, rowStride, x + 1, y)
        val bottomLeft = luminanceAt(luminance, rowStride, x - 1, y + 1)
        val bottom = luminanceAt(luminance, rowStride, x, y + 1)
        val bottomRight = luminanceAt(luminance, rowStride, x + 1, y + 1)
        val gx = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight
        val gy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
        val magnitude = min(255, ((abs(gx) + abs(gy)) / 4.0).roundToInt())
        val index = y * width + x
        gradients[index] = magnitude
        if (magnitude > 0) {
          samples.add(magnitude)
          gradientSum += magnitude
          sampleCount += 1
        }
      }
    }

    val meanGradient = if (sampleCount > 0) gradientSum / sampleCount else 0.0
    val edgeThreshold = min(88.0, max(config.minEdgeGradient, meanGradient * 1.1))
    val edges = ByteArray(width * height)
    gradients.forEachIndexed { index, value ->
      if (value >= edgeThreshold) edges[index] = 1
    }

    samples.sortDescending()
    val topCount = max(1, (samples.size * 0.12).toInt())
    val focusScore = if (samples.isEmpty()) {
      0.0
    } else {
      samples.take(topCount).sum().toDouble() / topCount / maxLuminance
    }

    return EdgeData(edges, clamp01(focusScore))
  }

  private fun collectComponents(width: Int, height: Int, edges: ByteArray): List<EdgeComponent> {
    val visited = ByteArray(edges.size)
    val components = ArrayList<EdgeComponent>()
    val queue = IntArray(edges.size)

    for (start in edges.indices) {
      if (edges[start].toInt() == 0 || visited[start].toInt() == 1) continue

      var head = 0
      var tail = 0
      visited[start] = 1
      queue[tail++] = start
      var minX = width
      var minY = height
      var maxX = 0
      var maxY = 0
      val points = ArrayList<Int>()

      while (head < tail) {
        val index = queue[head++]
        val x = index % width
        val y = index / width
        points.add(index)
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)

        for (dy in -1..1) {
          for (dx in -1..1) {
            if (dx == 0 && dy == 0) continue
            val nx = x + dx
            val ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            val nextIndex = ny * width + nx
            if (edges[nextIndex].toInt() == 0 || visited[nextIndex].toInt() == 1) continue
            visited[nextIndex] = 1
            queue[tail++] = nextIndex
          }
        }
      }

      components.add(
        EdgeComponent(
          edgeCount = points.size,
          minX = minX,
          minY = minY,
          maxX = maxX,
          maxY = maxY,
          points = points.toIntArray()
        )
      )
    }

    return components
  }

  private fun removeNestedComponents(components: List<EdgeComponent>): List<EdgeComponent> {
    val distinct = ArrayList<EdgeComponent>()
    components.forEach { component ->
      val overlapsExisting = distinct.any { accepted -> boxIntersectionOverUnion(accepted, component) >= 0.72 }
      if (!overlapsExisting) {
        distinct.add(component)
      }
    }
    return distinct
  }

  private fun boxIntersectionOverUnion(left: EdgeComponent, right: EdgeComponent): Double {
    val intersectionWidth = max(0, min(left.maxX, right.maxX) - max(left.minX, right.minX) + 1)
    val intersectionHeight = max(0, min(left.maxY, right.maxY) - max(left.minY, right.minY) + 1)
    val intersection = intersectionWidth * intersectionHeight
    val leftArea = (left.maxX - left.minX + 1) * (left.maxY - left.minY + 1)
    val rightArea = (right.maxX - right.minX + 1) * (right.maxY - right.minY + 1)
    return intersection.toDouble() / max(1, leftArea + rightArea - intersection)
  }

  private fun componentCorners(component: EdgeComponent, width: Int, height: Int): CardFrameAnalyserCorners {
    var topLeftScore = Double.POSITIVE_INFINITY
    var topRightScore = Double.NEGATIVE_INFINITY
    var bottomRightScore = Double.NEGATIVE_INFINITY
    var bottomLeftScore = Double.POSITIVE_INFINITY
    var topLeft = component.minX to component.minY
    var topRight = component.maxX to component.minY
    var bottomRight = component.maxX to component.maxY
    var bottomLeft = component.minX to component.maxY

    component.points.forEach { index ->
      val x = index % width
      val y = index / width
      val sum = (x + y).toDouble()
      val diff = (x - y).toDouble()
      if (sum < topLeftScore) {
        topLeftScore = sum
        topLeft = x to y
      }
      if (diff > topRightScore) {
        topRightScore = diff
        topRight = x to y
      }
      if (sum > bottomRightScore) {
        bottomRightScore = sum
        bottomRight = x to y
      }
      if (diff < bottomLeftScore) {
        bottomLeftScore = diff
        bottomLeft = x to y
      }
    }

    return CardFrameAnalyserCorners(
      topLeft = normalisedPoint(topLeft, width, height),
      topRight = normalisedPoint(topRight, width, height),
      bottomRight = normalisedPoint(bottomRight, width, height),
      bottomLeft = normalisedPoint(bottomLeft, width, height)
    )
  }

  private fun exposureRatios(
    luminance: ByteArray,
    width: Int,
    height: Int,
    rowStride: Int,
    component: EdgeComponent?
  ): ExposureMetrics {
    val minX = component?.minX ?: 0
    val minY = component?.minY ?: 0
    val maxX = component?.maxX ?: width - 1
    val maxY = component?.maxY ?: height - 1
    var glare = 0
    var under = 0
    var over = 0
    var total = 0

    for (y in minY..maxY) {
      for (x in minX..maxX) {
        val value = luminanceAt(luminance, rowStride, x, y)
        if (value >= 248) glare += 1
        if (value <= 35) under += 1
        if (value >= 238) over += 1
        total += 1
      }
    }

    return ExposureMetrics(
      glareRatio = if (total > 0) glare.toDouble() / total else 0.0,
      underexposureRatio = if (total > 0) under.toDouble() / total else 0.0,
      overexposureRatio = if (total > 0) over.toDouble() / total else 0.0
    )
  }

  private fun cornerVisibility(
    luminance: ByteArray,
    width: Int,
    height: Int,
    rowStride: Int,
    edges: ByteArray,
    corners: CardFrameAnalyserCorners,
    config: CardFrameAnalyserQualityConfig
  ): Boolean {
    val radius = max(4, (min(width, height) * 0.045).roundToInt())
    val points = listOf(corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft)

    return points.all { corner ->
      val centerX = (corner.x * (width - 1)).roundToInt()
      val centerY = (corner.y * (height - 1)).roundToInt()
      var edgeCount = 0
      var total = 0
      var luminanceSum = 0

      for (y in max(0, centerY - radius)..min(height - 1, centerY + radius)) {
        for (x in max(0, centerX - radius)..min(width - 1, centerX + radius)) {
          if (hypot((x - centerX).toDouble(), (y - centerY).toDouble()) > radius) continue
          val index = y * width + x
          if (edges[index].toInt() == 1) edgeCount += 1
          luminanceSum += luminanceAt(luminance, rowStride, x, y)
          total += 1
        }
      }

      val edgeSupportRatio = if (total > 0) edgeCount.toDouble() / total else 0.0
      val meanLuminance = if (total > 0) luminanceSum.toDouble() / total else 0.0
      edgeSupportRatio >= config.minCornerEdgeSupportRatio &&
        meanLuminance >= config.minCornerMeanLuminance &&
        meanLuminance <= config.maxCornerMeanLuminance
    }
  }

  private fun edgeClipped(
    corners: CardFrameAnalyserCorners,
    component: EdgeComponent,
    width: Int,
    height: Int,
    guide: CardFrameAnalyserGuide,
    config: CardFrameAnalyserQualityConfig
  ): Boolean {
    val margin = config.edgeClipMarginRatio
    val touchesFrame = component.minX <= width * margin ||
      component.minY <= height * margin ||
      component.maxX >= width * (1 - margin) ||
      component.maxY >= height * (1 - margin)
    val outsideGuide = listOf(corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft).any { corner ->
      corner.x <= guide.x + margin ||
        corner.y <= guide.y + margin ||
        corner.x >= guide.x + guide.width - margin ||
        corner.y >= guide.y + guide.height - margin
    }
    return touchesFrame || outsideGuide
  }

  private fun calculateGeometry(
    corners: CardFrameAnalyserCorners,
    guide: CardFrameAnalyserGuide,
    frameWidth: Int,
    frameHeight: Int,
    config: CardFrameAnalyserQualityConfig
  ): GeometryMetrics {
    val top = distance(corners.topLeft, corners.topRight, frameWidth, frameHeight)
    val right = distance(corners.topRight, corners.bottomRight, frameWidth, frameHeight)
    val bottom = distance(corners.bottomLeft, corners.bottomRight, frameWidth, frameHeight)
    val left = distance(corners.topLeft, corners.bottomLeft, frameWidth, frameHeight)
    val shortSide = (top + bottom) / 2
    val longSide = (left + right) / 2
    val ratio = if (longSide > 0) shortSide / longSide else 0.0
    val area = polygonArea(corners)
    val guideArea = max(0.01, guide.width * guide.height)
    val sideBalance = (min(top, bottom) / max(max(top, bottom), 0.0001)) *
      (min(left, right) / max(max(left, right), 0.0001))
    val orthogonal = (
      angleScore(corners.topRight, corners.topLeft, corners.bottomLeft, frameWidth, frameHeight) +
        angleScore(corners.topLeft, corners.topRight, corners.bottomRight, frameWidth, frameHeight) +
        angleScore(corners.topRight, corners.bottomRight, corners.bottomLeft, frameWidth, frameHeight) +
        angleScore(corners.topLeft, corners.bottomLeft, corners.bottomRight, frameWidth, frameHeight)
      ) / 4

    return GeometryMetrics(
      fillRatio = clamp01(area / guideArea),
      aspectRatioScore = clamp01(1 - abs(ratio - config.expectedCardAspectRatio) / config.aspectTolerance),
      perspectiveScore = clamp01(sideBalance * orthogonal)
    )
  }

  private fun emptyResult(
    startedAt: Long,
    reasons: List<CardFrameAnalyserFailureReason>
  ): CardFrameAnalysisResult = CardFrameAnalysisResult(
    cardDetected = false,
    corners = null,
    fillRatio = 0.0,
    aspectRatioScore = 0.0,
    blurScore = 0.0,
    glareRatio = 0.0,
    underexposureRatio = 0.0,
    overexposureRatio = 0.0,
    perspectiveScore = 0.0,
    allCornersVisible = false,
    edgeClipped = false,
    qualityAccepted = false,
    failureReasons = CardFrameAnalyserFailureReason.ordered.filter { reasons.contains(it) },
    processingMs = elapsedMs(startedAt)
  )

  private fun normaliseGuide(guide: CardFrameAnalyserGuide?): CardFrameAnalyserGuide {
    if (guide == null) return CardFrameAnalyserGuide.fullFrame
    return CardFrameAnalyserGuide(
      x = clamp01(guide.x),
      y = clamp01(guide.y),
      width = clamp01(guide.width),
      height = clamp01(guide.height)
    )
  }

  private fun normalisedPoint(point: Pair<Int, Int>, width: Int, height: Int): CardFrameAnalyserPoint =
    CardFrameAnalyserPoint(
      x = clamp01(point.first.toDouble() / (width - 1)),
      y = clamp01(point.second.toDouble() / (height - 1))
    )

  private fun luminanceAt(luminance: ByteArray, rowStride: Int, x: Int, y: Int): Int =
    luminance[y * rowStride + x].toInt() and 0xff

  private fun polygonArea(corners: CardFrameAnalyserCorners): Double {
    val points = listOf(corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft)
    var area = 0.0
    points.forEachIndexed { index, current ->
      val next = points[(index + 1) % points.size]
      area += current.x * next.y - next.x * current.y
    }
    return abs(area) / 2
  }

  private fun distance(
    a: CardFrameAnalyserPoint,
    b: CardFrameAnalyserPoint,
    frameWidth: Int,
    frameHeight: Int
  ): Double =
    hypot((a.x - b.x) * frameWidth, (a.y - b.y) * frameHeight)

  private fun angleScore(
    a: CardFrameAnalyserPoint,
    b: CardFrameAnalyserPoint,
    c: CardFrameAnalyserPoint,
    frameWidth: Int,
    frameHeight: Int
  ): Double {
    val ux = (a.x - b.x) * frameWidth
    val uy = (a.y - b.y) * frameHeight
    val vx = (c.x - b.x) * frameWidth
    val vy = (c.y - b.y) * frameHeight
    val denominator = hypot(ux, uy) * hypot(vx, vy)
    if (denominator <= 0.0) return 0.0
    return clamp01(1 - abs((ux * vx + uy * vy) / denominator))
  }

  private fun clamp01(value: Double): Double = max(0.0, min(1.0, value))

  private fun finiteOrZero(value: Double): Double = if (value.isFinite()) value else 0.0

  private fun elapsedMs(startedAt: Long): Double = (System.nanoTime() - startedAt).toDouble() / 1_000_000.0
}
