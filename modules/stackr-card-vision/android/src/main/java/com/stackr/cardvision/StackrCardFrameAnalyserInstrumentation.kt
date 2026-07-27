package com.stackr.cardvision

import android.os.Handler
import android.os.Looper
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.ceil
import kotlin.math.max

internal const val STACKR_CARD_FRAME_ANALYSIS_EVENT = "onCardFrameAnalysis"

internal object StackrCardFrameAnalyserInstrumentation {
  private const val maxSamples = 80
  private val mainHandler = Handler(Looper.getMainLooper())
  private var moduleReference: WeakReference<StackrCardVisionModule>? = null
  private val received = AtomicLong(0)
  private val processed = AtomicLong(0)
  private val dropped = AtomicLong(0)
  private val focusFailures = AtomicLong(0)
  private val durations = ArrayDeque<Double>()

  @Synchronized
  fun attach(module: StackrCardVisionModule) {
    moduleReference = WeakReference(module)
  }

  @Synchronized
  fun detach(module: StackrCardVisionModule) {
    if (moduleReference?.get() === module) {
      moduleReference = null
    }
  }

  @Synchronized
  fun reset() {
    received.set(0)
    processed.set(0)
    dropped.set(0)
    focusFailures.set(0)
    durations.clear()
  }

  fun markReceived(): Long = received.incrementAndGet()

  fun markDropped(): Long = dropped.incrementAndGet()

  fun markFocusFailure(): Long = focusFailures.incrementAndGet()

  @Synchronized
  fun emitResult(scanId: String?, result: CardFrameAnalysisResult) {
    processed.incrementAndGet()
    durations.addLast(result.processingMs)
    while (durations.size > maxSamples) {
      durations.removeFirst()
    }
    val payload = mapOf(
      "scanId" to scanId,
      "analysisFramesReceived" to received.get(),
      "framesProcessed" to processed.get(),
      "framesDropped" to dropped.get(),
      "focusFailures" to focusFailures.get(),
      "analyserP50Ms" to percentile(durations.toList(), 0.5),
      "analyserP95Ms" to percentile(durations.toList(), 0.95),
      "result" to result.toMap()
    )
    emit(payload)
  }

  fun emitAvailability(scanId: String?, message: String) {
    emit(
      mapOf(
        "scanId" to scanId,
        "analysisFramesReceived" to received.get(),
        "framesProcessed" to processed.get(),
        "framesDropped" to dropped.get(),
        "focusFailures" to focusFailures.get(),
        "analyserP50Ms" to percentileSafe(),
        "analyserP95Ms" to percentileSafe(0.95),
        "result" to null,
        "message" to message
      )
    )
  }

  @Synchronized
  fun snapshot(): Map<String, Any?> = mapOf(
    "analysisFramesReceived" to received.get(),
    "framesProcessed" to processed.get(),
    "framesDropped" to dropped.get(),
    "focusFailures" to focusFailures.get(),
    "analyserP50Ms" to percentile(durations.toList(), 0.5),
    "analyserP95Ms" to percentile(durations.toList(), 0.95)
  )

  private fun emit(payload: Map<String, Any?>) {
    val module = moduleReference?.get() ?: return
    mainHandler.post {
      module.sendEvent(STACKR_CARD_FRAME_ANALYSIS_EVENT, payload)
    }
  }

  @Synchronized
  private fun percentileSafe(ratio: Double = 0.5): Double = percentile(durations.toList(), ratio)

  private fun percentile(values: List<Double>, ratio: Double): Double {
    if (values.isEmpty()) return 0.0
    val sorted = values.sorted()
    val index = (ceil(sorted.size * ratio).toInt() - 1).coerceIn(0, max(0, sorted.size - 1))
    return sorted[index]
  }
}
