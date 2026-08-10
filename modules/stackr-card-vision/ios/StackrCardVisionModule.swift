import CoreImage
import ExpoModulesCore
import Foundation
import UIKit

private let stackrCardVisionModuleVersion = "stackr-card-vision-native-v1"

public class StackrCardVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StackrCardVision")
    Events(stackrCardFrameAnalysisEvent)

    OnCreate {
      StackrCardFrameAnalyserInstrumentation.attach(self)
    }

    OnDestroy {
      StackrCardFrameAnalyserInstrumentation.detach(self)
    }

    Function("getCardVisionRuntimeInfo") { () -> [String: Any?] in
      let onnxBridgeClassAvailable = classAvailable("OnnxruntimeModule")
      let frameClassAvailable = classAvailable("Frame")
      let frameProcessorClassAvailable = classAvailable("FrameProcessor") || classAvailable("FrameProcessorPlugin")
      let workletsCoreClassAvailable = classAvailable("WorkletsModule")
      _ = CIContext()
      let ciContextAvailable = true

      return [
        "platform": "ios",
        "moduleVersion": stackrCardVisionModuleVersion,
        "onnxRuntimeAvailable": onnxBridgeClassAvailable,
        "cameraFrameAccessAvailable": frameClassAvailable && frameProcessorClassAvailable && workletsCoreClassAvailable,
        "nativeImageProcessingAvailable": ciContextAvailable,
        "onnxRuntimeDetail": "bridgeClass=\(onnxBridgeClassAvailable)",
        "cameraFrameAccessDetail": "visionCameraFrame=\(frameClassAvailable); frameProcessor=\(frameProcessorClassAvailable); workletsCore=\(workletsCoreClassAvailable); pluginRegistered=false",
        "nativeImageProcessingDetail": "coreImage=\(ciContextAvailable); luminanceAnalyser=\(CardFrameAnalyserQualityConfig.default.version); rectifier=stackr-card-rectification-v1.0.0; roi=stackr-pokemon-card-roi-v1.0.0; system=\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
        "opencvAvailable": false,
        "opencvVersion": nil
      ]
    }

    Function("runCardFrameAnalyserFixtureTests") { () -> [String: Any?] in
      StackrCardFrameAnalyserFixtures.runFixtureTests()
    }

    Function("benchmarkCardFrameAnalyserFixtures") { (fixtureCount: Int?) -> [String: Any?] in
      StackrCardFrameAnalyserFixtures.benchmark(fixtureCount: fixtureCount ?? 120)
    }

    Function("rectifyCapturedCard") { (request: [String: Any?]) -> [String: Any?] in
      StackrCardRectifier.rectify(request)
    }

    Function("deleteCardRectificationOutputs") { (scanId: String) -> [String: Any?] in
      StackrCardRectifier.deleteOutputs(scanId: scanId)
    }

    Function("loadCardIdentitySearchCatalogue") { (request: [String: Any?]) -> [String: Any?] in
      StackrCardIdentitySearchEngine.load(request)
    }

    Function("searchCardIdentityEmbedding") { (request: [String: Any?]) -> [String: Any?] in
      StackrCardIdentitySearchEngine.search(request)
    }

    Function("benchmarkCardIdentitySearch") { (request: [String: Any?]?) -> [String: Any?] in
      StackrCardIdentitySearchEngine.benchmark(request ?? [:])
    }

    Function("resetCardIdentitySearchCatalogue") { () -> [String: Any?] in
      StackrCardIdentitySearchEngine.reset()
    }

    Function("getCardFrameAnalyserInstrumentation") { () -> [String: Any?] in
      StackrCardFrameAnalyserInstrumentation.snapshot()
    }

    Function("resetCardFrameAnalyserInstrumentation") { () -> [String: Any?] in
      StackrCardFrameAnalyserInstrumentation.reset()
      return StackrCardFrameAnalyserInstrumentation.snapshot()
    }

    Function("recordCardFrameAnalyserFocusFailure") { () -> [String: Any?] in
      StackrCardFrameAnalyserInstrumentation.markFocusFailure()
      return StackrCardFrameAnalyserInstrumentation.snapshot()
    }
  }
}

private func classAvailable(_ className: String) -> Bool {
  return NSClassFromString(className) != nil
}
