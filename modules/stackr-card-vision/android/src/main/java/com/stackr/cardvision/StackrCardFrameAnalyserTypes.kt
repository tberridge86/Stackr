package com.stackr.cardvision

internal enum class CardFrameAnalyserFailureReason(val code: String) {
  NO_CARD("NO_CARD"),
  MULTIPLE_CARDS("MULTIPLE_CARDS"),
  LOW_FILL("LOW_FILL"),
  ASPECT_RATIO("ASPECT_RATIO"),
  BLUR("BLUR"),
  GLARE("GLARE"),
  UNDEREXPOSED("UNDEREXPOSED"),
  OVEREXPOSED("OVEREXPOSED"),
  PERSPECTIVE("PERSPECTIVE"),
  CORNER_OCCLUDED("CORNER_OCCLUDED"),
  EDGE_CLIPPED("EDGE_CLIPPED"),
  LOW_CONFIDENCE_RECTANGLE("LOW_CONFIDENCE_RECTANGLE"),
  NON_CARD_RECTANGLE("NON_CARD_RECTANGLE");

  companion object {
    val ordered = values().toList()
  }
}

internal data class CardFrameAnalyserPoint(
  val x: Double,
  val y: Double
) {
  fun toMap(): Map<String, Double> = mapOf(
    "x" to x,
    "y" to y
  )
}

internal data class CardFrameAnalyserCorners(
  val topLeft: CardFrameAnalyserPoint,
  val topRight: CardFrameAnalyserPoint,
  val bottomRight: CardFrameAnalyserPoint,
  val bottomLeft: CardFrameAnalyserPoint
) {
  fun toMap(): Map<String, Map<String, Double>> = mapOf(
    "topLeft" to topLeft.toMap(),
    "topRight" to topRight.toMap(),
    "bottomRight" to bottomRight.toMap(),
    "bottomLeft" to bottomLeft.toMap()
  )
}

internal data class CardFrameAnalyserGuide(
  val x: Double,
  val y: Double,
  val width: Double,
  val height: Double
) {
  companion object {
    val fullFrame = CardFrameAnalyserGuide(0.0, 0.0, 1.0, 1.0)
  }
}

internal data class CardFrameAnalyserQualityConfig(
  val version: String,
  val expectedCardAspectRatio: Double,
  val aspectTolerance: Double,
  val minDetectionAreaRatio: Double,
  val minQualityFillRatio: Double,
  val minAspectRatioScore: Double,
  val minBlurScore: Double,
  val maxGlareRatio: Double,
  val maxUnderexposureRatio: Double,
  val maxOverexposureRatio: Double,
  val minPerspectiveScore: Double,
  val minCornerEdgeSupportRatio: Double,
  val minCornerMeanLuminance: Double,
  val maxCornerMeanLuminance: Double,
  val edgeClipMarginRatio: Double,
  val minEdgeGradient: Double,
  val maxPlausibleCards: Int
) {
  companion object {
    val default = CardFrameAnalyserQualityConfig(
      version = "stackr-card-frame-analyser-v1.0.0",
      expectedCardAspectRatio = 0.716,
      aspectTolerance = 0.18,
      minDetectionAreaRatio = 0.08,
      minQualityFillRatio = 0.34,
      minAspectRatioScore = 0.6,
      minBlurScore = 0.32,
      maxGlareRatio = 0.08,
      maxUnderexposureRatio = 0.45,
      maxOverexposureRatio = 0.28,
      minPerspectiveScore = 0.62,
      minCornerEdgeSupportRatio = 0.035,
      minCornerMeanLuminance = 42.0,
      maxCornerMeanLuminance = 238.0,
      edgeClipMarginRatio = 0.025,
      minEdgeGradient = 18.0,
      maxPlausibleCards = 1
    )
  }
}

internal data class CardFrameAnalysisResult(
  val cardDetected: Boolean,
  val corners: CardFrameAnalyserCorners?,
  val fillRatio: Double,
  val aspectRatioScore: Double,
  val blurScore: Double,
  val glareRatio: Double,
  val underexposureRatio: Double,
  val overexposureRatio: Double,
  val perspectiveScore: Double,
  val allCornersVisible: Boolean,
  val edgeClipped: Boolean,
  val qualityAccepted: Boolean,
  val failureReasons: List<CardFrameAnalyserFailureReason>,
  val processingMs: Double
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "cardDetected" to cardDetected,
    "corners" to corners?.toMap(),
    "fillRatio" to fillRatio,
    "aspectRatioScore" to aspectRatioScore,
    "blurScore" to blurScore,
    "glareRatio" to glareRatio,
    "underexposureRatio" to underexposureRatio,
    "overexposureRatio" to overexposureRatio,
    "perspectiveScore" to perspectiveScore,
    "allCornersVisible" to allCornersVisible,
    "edgeClipped" to edgeClipped,
    "qualityAccepted" to qualityAccepted,
    "failureReasons" to failureReasons.map { it.code },
    "processingMs" to processingMs
  )
}
