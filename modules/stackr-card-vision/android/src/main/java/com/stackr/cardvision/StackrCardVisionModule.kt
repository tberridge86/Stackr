package com.stackr.cardvision

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val STACKR_CARD_VISION_MODULE_VERSION = "stackr-card-vision-native-v1"

class StackrCardVisionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StackrCardVision")
    Events(STACKR_CARD_FRAME_ANALYSIS_EVENT)

    OnCreate {
      StackrCardFrameAnalyserInstrumentation.attach(this@StackrCardVisionModule)
      try {
        StackrCardFrameAnalyserPluginRegistration.register()
      } catch (_: Throwable) {
        // Diagnostics report the unavailable frame processor runtime below.
      }
    }

    OnDestroy {
      StackrCardFrameAnalyserInstrumentation.detach(this@StackrCardVisionModule)
    }

    Function("getCardVisionRuntimeInfo") {
      val onnxBridgeClassAvailable = classAvailable("ai.onnxruntime.reactnative.OnnxruntimeModule")
      val onnxJsiLibraryLoadable = nativeLibraryLoadable("onnxruntimejsi")
      val frameClassAvailable = classAvailable("com.mrousavy.camera.frameprocessors.Frame")
      val framePluginClassAvailable = classAvailable("com.mrousavy.camera.frameprocessors.FrameProcessorPlugin")
      val workletsCoreClassAvailable = classAvailable("com.margelo.worklets.Worklets")
      val workletsClassAvailable = classAvailable("com.swmansion.worklets.WorkletsModule")
      val bitmapFactoryAvailable = classAvailable("android.graphics.BitmapFactory")

      mapOf(
        "platform" to "android",
        "moduleVersion" to STACKR_CARD_VISION_MODULE_VERSION,
        "onnxRuntimeAvailable" to (onnxBridgeClassAvailable && onnxJsiLibraryLoadable),
        "cameraFrameAccessAvailable" to (
          frameClassAvailable &&
            framePluginClassAvailable &&
            StackrCardFrameAnalyserPluginRegistration.registered &&
            workletsCoreClassAvailable
          ),
        "nativeImageProcessingAvailable" to bitmapFactoryAvailable,
        "onnxRuntimeDetail" to "bridgeClass=$onnxBridgeClassAvailable; jsiLibraryLoadable=$onnxJsiLibraryLoadable",
        "cameraFrameAccessDetail" to "visionCameraFrame=$frameClassAvailable; frameProcessorPlugin=$framePluginClassAvailable; pluginRegistered=${StackrCardFrameAnalyserPluginRegistration.registered}; reactNativeWorkletsCore=$workletsCoreClassAvailable; reactNativeWorklets=$workletsClassAvailable",
        "nativeImageProcessingDetail" to "androidBitmapFactory=$bitmapFactoryAvailable; luminanceAnalyser=${CardFrameAnalyserQualityConfig.default.version}; rectifier=stackr-card-rectification-v1.0.0; roi=stackr-pokemon-card-roi-v1.0.0; sdk=${Build.VERSION.SDK_INT}",
        "opencvAvailable" to false,
        "opencvVersion" to null
      )
    }

    Function("runCardFrameAnalyserFixtureTests") {
      StackrCardFrameAnalyserFixtures.runFixtureTests()
    }

    Function("benchmarkCardFrameAnalyserFixtures") { fixtureCount: Int? ->
      StackrCardFrameAnalyserFixtures.benchmark(fixtureCount ?: 120)
    }

    Function("rectifyCapturedCard") { request: Map<String, Any?> ->
      StackrCardRectifier.rectify(request, appContext.reactContext?.cacheDir)
    }

    Function("deleteCardRectificationOutputs") { scanId: String ->
      StackrCardRectifier.deleteOutputs(scanId, appContext.reactContext?.cacheDir)
    }

    Function("loadCardIdentitySearchCatalogue") { request: Map<String, Any?> ->
      StackrCardIdentitySearchEngine.load(request)
    }

    Function("searchCardIdentityEmbedding") { request: Map<String, Any?> ->
      StackrCardIdentitySearchEngine.search(request)
    }

    Function("benchmarkCardIdentitySearch") { request: Map<String, Any?>? ->
      StackrCardIdentitySearchEngine.benchmark(request ?: emptyMap())
    }

    Function("resetCardIdentitySearchCatalogue") {
      StackrCardIdentitySearchEngine.reset()
    }

    Function("getCardFrameAnalyserInstrumentation") {
      StackrCardFrameAnalyserInstrumentation.snapshot()
    }

    Function("resetCardFrameAnalyserInstrumentation") {
      StackrCardFrameAnalyserInstrumentation.reset()
      StackrCardFrameAnalyserInstrumentation.snapshot()
    }

    Function("recordCardFrameAnalyserFocusFailure") {
      StackrCardFrameAnalyserInstrumentation.markFocusFailure()
      StackrCardFrameAnalyserInstrumentation.snapshot()
    }
  }

  private fun classAvailable(className: String): Boolean {
    return try {
      Class.forName(className)
      true
    } catch (_: Throwable) {
      false
    }
  }

  private fun nativeLibraryLoadable(libraryName: String): Boolean {
    return try {
      System.loadLibrary(libraryName)
      true
    } catch (_: Throwable) {
      false
    }
  }
}
