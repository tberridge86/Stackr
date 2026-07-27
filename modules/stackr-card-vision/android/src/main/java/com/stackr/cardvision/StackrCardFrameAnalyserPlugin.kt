package com.stackr.cardvision

import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val STACKR_CARD_FRAME_ANALYSER_PLUGIN_NAME = "stackrCardFrameAnalyser"
private const val DEFAULT_ANALYSIS_INTERVAL_MS = 125L

internal class StackrCardFrameAnalyserPlugin(
  @Suppress("UNUSED_PARAMETER") proxy: VisionCameraProxy,
  @Suppress("UNUSED_PARAMETER") options: Map<String, Any>?
) : FrameProcessorPlugin() {
  companion object {
    private val executor = Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "StackrCardFrameAnalyser").apply { isDaemon = true }
    }
    private val busy = AtomicBoolean(false)
    private var lastAcceptedAtMs = 0L
  }

  override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    StackrCardFrameAnalyserInstrumentation.markReceived()

    val nowMs = System.currentTimeMillis()
    val minIntervalMs = ((params?.get("minIntervalMs") as? Number)?.toLong() ?: DEFAULT_ANALYSIS_INTERVAL_MS)
      .coerceIn(100L, 170L)
    val scanId = params?.get("scanId") as? String

    if (nowMs - lastAcceptedAtMs < minIntervalMs) {
      StackrCardFrameAnalyserInstrumentation.markDropped()
      return null
    }

    if (!busy.compareAndSet(false, true)) {
      StackrCardFrameAnalyserInstrumentation.markDropped()
      return null
    }

    return try {
      val guide = StackrCardFrameAnalyser.guideFromArguments(params)
      val imageProxy = frame.imageProxy
      val yPlane = imageProxy.planes.firstOrNull()
      if (yPlane == null) {
        StackrCardFrameAnalyserInstrumentation.markDropped()
        busy.set(false)
        return null
      }

      val buffer = yPlane.buffer.duplicate()
      val luminance = ByteArray(buffer.remaining())
      buffer.get(luminance)
      val width = imageProxy.width
      val height = imageProxy.height
      val rowStride = yPlane.rowStride
      lastAcceptedAtMs = nowMs

      executor.execute {
        try {
          val result = StackrCardFrameAnalyser.analyseLuminance(
            luminance = luminance,
            width = width,
            height = height,
            rowStride = rowStride,
            guide = guide
          )
          StackrCardFrameAnalyserInstrumentation.emitResult(scanId, result)
        } finally {
          busy.set(false)
        }
      }
      null
    } catch (error: Throwable) {
      busy.set(false)
      StackrCardFrameAnalyserInstrumentation.markDropped()
      StackrCardFrameAnalyserInstrumentation.emitAvailability(
        scanId,
        error.message ?: "Card frame analyser could not process this frame."
      )
      null
    }
  }
}

internal object StackrCardFrameAnalyserPluginRegistration {
  var registered = false
    private set

  fun register() {
    if (registered) return
    FrameProcessorPluginRegistry.addFrameProcessorPlugin(STACKR_CARD_FRAME_ANALYSER_PLUGIN_NAME) { proxy, options ->
      StackrCardFrameAnalyserPlugin(proxy, options)
    }
    registered = true
  }
}
