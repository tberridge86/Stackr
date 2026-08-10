package com.stackr.cardvision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val CARD_RECTIFICATION_VERSION = "stackr-card-rectification-v1.0.0"
private const val CARD_ROI_MAPPING_VERSION = "stackr-pokemon-card-roi-v1.0.0"
private const val RECTIFIED_CARD_ASPECT_RATIO = 0.7
private const val RECOGNITION_WIDTH = 224
private const val RECOGNITION_HEIGHT = 320
private const val THUMBNAIL_WIDTH = 112
private const val THUMBNAIL_HEIGHT = 160

internal object StackrCardRectifier {
  fun rectify(request: Map<String, Any?>, cacheDir: File?): Map<String, Any?> {
    val scanId = stringValue(request["scanId"]) ?: return failed(null, "Rectification requires a scan ID.")
    if (cacheDir == null) return failed(scanId, "Rectification requires an application cache directory.")

    val cameraPosition = stringValue(request["cameraPosition"]) ?: "unknown"
    val mirrored = booleanValue(request["mirrored"])
    if (cameraPosition == "front" || mirrored) {
      return failed(scanId, "Rectification requires an unmirrored back-camera capture.")
    }

    val sourceUri = stringValue(request["sourcePhotoUri"]) ?: return failed(scanId, "Rectification requires a source photo URI.")
    val sourceFile = fileFromUri(sourceUri)
    if (!sourceFile.exists()) return failed(scanId, "Source photo does not exist.")

    val source = BitmapFactory.decodeFile(sourceFile.absolutePath)
      ?: return failed(scanId, "Source photo could not be decoded.")

    return try {
      val photoWidth = intValue(request["photoWidth"], source.width)
      val photoHeight = intValue(request["photoHeight"], source.height)
      val previewWidth = intValue(request["previewWidth"], 1)
      val previewHeight = intValue(request["previewHeight"], 1)
      val rotationDegrees = normalizedRotation(intValue(request["rotationDegrees"], 0))
      val previewResizeMode = stringValue(request["previewResizeMode"]) ?: "cover"
      val previewCorners = quadFromMap(request["previewCorners"] as? Map<*, *>)
        ?: return failed(scanId, "Rectification requires accepted preview corner coordinates.")
      val photoCorners = previewQuadToPhotoQuad(
        previewCorners,
        photoWidth,
        photoHeight,
        previewWidth,
        previewHeight,
        rotationDegrees,
        mirrored,
        previewResizeMode
      )
      val outputSize = rectifiedOutputSize(photoCorners)
      val rectified = perspectiveWarp(source, photoCorners, outputSize.width, outputSize.height)
      val recognition = Bitmap.createScaledBitmap(rectified, RECOGNITION_WIDTH, RECOGNITION_HEIGHT, true)
      val ocrSource = cropAndScale(rectified, 0.03, 0.02, 0.94, 0.96, 672, 960)
      val thumbnail = Bitmap.createScaledBitmap(rectified, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, true)
      val leftEdge = cropAndScale(rectified, 0.0, 0.04, 0.08, 0.92, 96, 960)
      val outputDir = outputDirectory(cacheDir, scanId)
      if (!outputDir.exists()) outputDir.mkdirs()

      val rectifiedFile = File(outputDir, "rectified-full.png")
      val recognitionFile = File(outputDir, "recognition-224x320.png")
      val ocrFile = File(outputDir, "ocr-source.png")
      val thumbnailFile = File(outputDir, "thumbnail.png")
      val leftEdgeFile = File(outputDir, "roi-left-edge.png")
      savePng(rectified, rectifiedFile)
      savePng(recognition, recognitionFile)
      savePng(ocrSource, ocrFile)
      savePng(thumbnail, thumbnailFile)
      savePng(leftEdge, leftEdgeFile)

      mapOf(
        "status" to "success",
        "scanId" to scanId,
        "rectifiedFull" to imageOutput(rectifiedFile, outputSize.width, outputSize.height, "rectified_full"),
        "recognitionCrop" to imageOutput(recognitionFile, RECOGNITION_WIDTH, RECOGNITION_HEIGHT, "recognition_crop"),
        "ocrSourceCrop" to imageOutput(ocrFile, 672, 960, "ocr_source_crop"),
        "thumbnail" to imageOutput(thumbnailFile, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, "thumbnail"),
        "roiCrops" to mapOf(
          "leftEdge" to imageOutput(leftEdgeFile, 96, 960, "roi_crop")
        ),
        "transform" to mapOf(
          "version" to CARD_RECTIFICATION_VERSION,
          "sourcePreviewCorners" to previewCorners.toMap(),
          "sourcePhotoCorners" to photoCorners.toMap(),
          "rectifiedSize" to mapOf("width" to outputSize.width, "height" to outputSize.height),
          "recognitionSize" to mapOf("width" to RECOGNITION_WIDTH, "height" to RECOGNITION_HEIGHT),
          "roiMappingVersion" to CARD_ROI_MAPPING_VERSION
        ),
        "roiManifest" to roiManifest(),
        "message" to null
      )
    } catch (error: Throwable) {
      failed(scanId, error.message ?: "Card rectification failed.")
    } finally {
      source.recycle()
    }
  }

  fun deleteOutputs(scanId: String, cacheDir: File?): Map<String, Any?> {
    if (cacheDir == null) {
      return mapOf("status" to "failed", "scanId" to scanId, "deletedCount" to 0, "message" to "Cache directory unavailable.")
    }
    val root = File(cacheDir, "stackr-card-rectification").canonicalFile
    val target = File(root, scanId).canonicalFile
    if (!target.path.startsWith(root.path)) {
      return mapOf("status" to "failed", "scanId" to scanId, "deletedCount" to 0, "message" to "Refused to delete outside rectification cache.")
    }
    val deletedCount = countFiles(target)
    if (target.exists()) target.deleteRecursively()
    return mapOf("status" to "success", "scanId" to scanId, "deletedCount" to deletedCount, "message" to null)
  }

  private fun perspectiveWarp(source: Bitmap, corners: Quad, width: Int, height: Int): Bitmap {
    val target = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(target)
    canvas.drawColor(Color.WHITE)
    val matrix = Matrix()
    val src = floatArrayOf(
      corners.topLeft.x.toFloat(), corners.topLeft.y.toFloat(),
      corners.topRight.x.toFloat(), corners.topRight.y.toFloat(),
      corners.bottomRight.x.toFloat(), corners.bottomRight.y.toFloat(),
      corners.bottomLeft.x.toFloat(), corners.bottomLeft.y.toFloat()
    )
    val dst = floatArrayOf(
      0f, 0f,
      width.toFloat(), 0f,
      width.toFloat(), height.toFloat(),
      0f, height.toFloat()
    )
    if (!matrix.setPolyToPoly(src, 0, dst, 0, 4)) {
      throw IllegalArgumentException("Accepted corner coordinates cannot be perspective transformed.")
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
    canvas.drawBitmap(source, matrix, paint)
    return target
  }

  private fun cropAndScale(
    bitmap: Bitmap,
    x: Double,
    y: Double,
    width: Double,
    height: Double,
    outputWidth: Int,
    outputHeight: Int
  ): Bitmap {
    val cropX = (bitmap.width * x).roundToInt().coerceIn(0, bitmap.width - 1)
    val cropY = (bitmap.height * y).roundToInt().coerceIn(0, bitmap.height - 1)
    val cropWidth = (bitmap.width * width).roundToInt().coerceIn(1, bitmap.width - cropX)
    val cropHeight = (bitmap.height * height).roundToInt().coerceIn(1, bitmap.height - cropY)
    val crop = Bitmap.createBitmap(bitmap, cropX, cropY, cropWidth, cropHeight)
    return Bitmap.createScaledBitmap(crop, outputWidth, outputHeight, true).also {
      if (it !== crop) crop.recycle()
    }
  }

  private fun savePng(bitmap: Bitmap, file: File) {
    FileOutputStream(file).use { output ->
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
        throw IllegalStateException("Unable to write ${file.name}.")
      }
    }
  }

  private fun previewQuadToPhotoQuad(
    quad: Quad,
    photoWidth: Int,
    photoHeight: Int,
    previewWidth: Int,
    previewHeight: Int,
    rotationDegrees: Int,
    mirrored: Boolean,
    resizeMode: String
  ): Quad = Quad(
    topLeft = previewPointToPhotoPoint(quad.topLeft, photoWidth, photoHeight, previewWidth, previewHeight, rotationDegrees, mirrored, resizeMode),
    topRight = previewPointToPhotoPoint(quad.topRight, photoWidth, photoHeight, previewWidth, previewHeight, rotationDegrees, mirrored, resizeMode),
    bottomRight = previewPointToPhotoPoint(quad.bottomRight, photoWidth, photoHeight, previewWidth, previewHeight, rotationDegrees, mirrored, resizeMode),
    bottomLeft = previewPointToPhotoPoint(quad.bottomLeft, photoWidth, photoHeight, previewWidth, previewHeight, rotationDegrees, mirrored, resizeMode)
  )

  private fun previewPointToPhotoPoint(
    point: Point,
    photoWidth: Int,
    photoHeight: Int,
    previewWidth: Int,
    previewHeight: Int,
    rotationDegrees: Int,
    mirrored: Boolean,
    resizeMode: String
  ): Point {
    val orientedSourceWidth = if (rotationDegrees == 90 || rotationDegrees == 270) photoHeight.toDouble() else photoWidth.toDouble()
    val orientedSourceHeight = if (rotationDegrees == 90 || rotationDegrees == 270) photoWidth.toDouble() else photoHeight.toDouble()
    val transform = previewTransform(orientedSourceWidth, orientedSourceHeight, previewWidth.toDouble(), previewHeight.toDouble(), resizeMode)
    val previewX = if (mirrored) previewWidth - point.x else point.x
    val orientedX = (previewX - transform.offsetX) / transform.scaleX
    val orientedY = (point.y - transform.offsetY) / transform.scaleY
    return when (rotationDegrees) {
      90 -> Point(orientedY, photoHeight - orientedX).clamped(photoWidth, photoHeight)
      180 -> Point(photoWidth - orientedX, photoHeight - orientedY).clamped(photoWidth, photoHeight)
      270 -> Point(photoWidth - orientedY, orientedX).clamped(photoWidth, photoHeight)
      else -> Point(orientedX, orientedY).clamped(photoWidth, photoHeight)
    }
  }

  private fun previewTransform(
    sourceWidth: Double,
    sourceHeight: Double,
    previewWidth: Double,
    previewHeight: Double,
    resizeMode: String
  ): PreviewTransform {
    if (resizeMode == "stretch") {
      return PreviewTransform(0.0, 0.0, previewWidth / sourceWidth, previewHeight / sourceHeight)
    }
    val sourceAspect = sourceWidth / sourceHeight
    val previewAspect = previewWidth / previewHeight
    val scale = if (resizeMode == "contain") {
      if (sourceAspect > previewAspect) previewWidth / sourceWidth else previewHeight / sourceHeight
    } else {
      if (sourceAspect > previewAspect) previewHeight / sourceHeight else previewWidth / sourceWidth
    }
    val displayedWidth = sourceWidth * scale
    val displayedHeight = sourceHeight * scale
    return PreviewTransform((previewWidth - displayedWidth) / 2, (previewHeight - displayedHeight) / 2, scale, scale)
  }

  private fun rectifiedOutputSize(corners: Quad): Size {
    val top = corners.topLeft.distanceTo(corners.topRight)
    val bottom = corners.bottomLeft.distanceTo(corners.bottomRight)
    val left = corners.topLeft.distanceTo(corners.bottomLeft)
    val right = corners.topRight.distanceTo(corners.bottomRight)
    val cardWidth = max(1.0, (top + bottom) / 2.0)
    val cardHeight = max(1.0, (left + right) / 2.0)
    val targetHeight = max(cardHeight, cardWidth / RECTIFIED_CARD_ASPECT_RATIO)
    val targetWidth = targetHeight * RECTIFIED_CARD_ASPECT_RATIO
    return Size(targetWidth.roundToInt().coerceAtLeast(RECOGNITION_WIDTH), targetHeight.roundToInt().coerceAtLeast(RECOGNITION_HEIGHT))
  }

  private fun outputDirectory(cacheDir: File, scanId: String): File =
    File(File(cacheDir, "stackr-card-rectification"), scanId)

  private fun imageOutput(file: File, width: Int, height: Int, role: String): Map<String, Any?> = mapOf(
    "uri" to Uri.fromFile(file).toString(),
    "width" to width,
    "height" to height,
    "role" to role,
    "mimeType" to "image/png"
  )

  private fun roiManifest(): Map<String, Any?> = mapOf(
    "version" to CARD_ROI_MAPPING_VERSION,
    "cardAspectRatio" to RECTIFIED_CARD_ASPECT_RATIO,
    "coordinateSpace" to "rectified_card_normalized",
    "regions" to listOf(
      roi("fullFront", "Full front", 0.0, 0.0, 1.0, 1.0),
      roi("fullBack", "Full back", 0.0, 0.0, 1.0, 1.0),
      roi("cardTitle", "Card title", 0.07, 0.035, 0.66, 0.085),
      roi("artwork", "Artwork", 0.075, 0.18, 0.85, 0.36),
      roi("collectorNumber", "Collector number", 0.06, 0.855, 0.34, 0.055),
      roi("setRarity", "Set / rarity", 0.38, 0.845, 0.3, 0.07),
      roi("regulationCopyright", "Regulation / copyright", 0.055, 0.905, 0.89, 0.07),
      roi("leftEdge", "Left edge", 0.0, 0.04, 0.08, 0.92)
    )
  )

  private fun roi(id: String, label: String, x: Double, y: Double, width: Double, height: Double): Map<String, Any?> = mapOf(
    "id" to id,
    "label" to label,
    "rect" to mapOf("x" to x, "y" to y, "width" to width, "height" to height)
  )

  private fun countFiles(file: File): Int {
    if (!file.exists()) return 0
    if (file.isFile) return 1
    return file.listFiles()?.sumOf { countFiles(it) } ?: 0
  }

  private fun fileFromUri(uri: String): File {
    if (uri.startsWith("file://")) return File(Uri.parse(uri).path ?: "")
    return File(uri)
  }

  private fun failed(scanId: String?, message: String): Map<String, Any?> = mapOf(
    "status" to "failed",
    "scanId" to scanId,
    "rectifiedFull" to null,
    "recognitionCrop" to null,
    "ocrSourceCrop" to null,
    "thumbnail" to null,
    "roiCrops" to null,
    "transform" to null,
    "roiManifest" to roiManifest(),
    "message" to message
  )

  private fun quadFromMap(value: Map<*, *>?): Quad? {
    if (value == null) return null
    return Quad(
      topLeft = pointFromMap(value["topLeft"] as? Map<*, *>) ?: return null,
      topRight = pointFromMap(value["topRight"] as? Map<*, *>) ?: return null,
      bottomRight = pointFromMap(value["bottomRight"] as? Map<*, *>) ?: return null,
      bottomLeft = pointFromMap(value["bottomLeft"] as? Map<*, *>) ?: return null
    )
  }

  private fun pointFromMap(value: Map<*, *>?): Point? {
    if (value == null) return null
    return Point(
      x = doubleValue(value["x"], Double.NaN),
      y = doubleValue(value["y"], Double.NaN)
    ).takeIf { it.x.isFinite() && it.y.isFinite() }
  }

  private fun normalizedRotation(value: Int): Int {
    val normalized = ((value / 90) * 90 % 360 + 360) % 360
    return if (normalized == 90 || normalized == 180 || normalized == 270) normalized else 0
  }

  private fun stringValue(value: Any?): String? = value as? String
  private fun booleanValue(value: Any?): Boolean = value as? Boolean ?: false
  private fun intValue(value: Any?, fallback: Int): Int = (value as? Number)?.toInt() ?: fallback
  private fun doubleValue(value: Any?, fallback: Double): Double = (value as? Number)?.toDouble() ?: fallback

  private data class Point(val x: Double, val y: Double) {
    fun distanceTo(other: Point): Double = hypot(x - other.x, y - other.y)
    fun clamped(width: Int, height: Int): Point = Point(
      x = min(max(0.0, x), width.toDouble()),
      y = min(max(0.0, y), height.toDouble())
    )
    fun toMap(): Map<String, Double> = mapOf("x" to x, "y" to y)
  }

  private data class Quad(
    val topLeft: Point,
    val topRight: Point,
    val bottomRight: Point,
    val bottomLeft: Point
  ) {
    fun toMap(): Map<String, Map<String, Double>> = mapOf(
      "topLeft" to topLeft.toMap(),
      "topRight" to topRight.toMap(),
      "bottomRight" to bottomRight.toMap(),
      "bottomLeft" to bottomLeft.toMap()
    )
  }

  private data class PreviewTransform(
    val offsetX: Double,
    val offsetY: Double,
    val scaleX: Double,
    val scaleY: Double
  )

  private data class Size(val width: Int, val height: Int)
}
