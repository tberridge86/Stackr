import Foundation

let stackrCardFrameAnalysisEvent = "onCardFrameAnalysis"

enum StackrCardFrameAnalyserInstrumentation {
  private static let maxSamples = 80
  private static let lock = NSLock()
  private static weak var module: StackrCardVisionModule?
  private static var received: Int64 = 0
  private static var processed: Int64 = 0
  private static var dropped: Int64 = 0
  private static var focusFailures: Int64 = 0
  private static var durations: [Double] = []

  static func attach(_ module: StackrCardVisionModule) {
    lock.lock()
    self.module = module
    lock.unlock()
  }

  static func detach(_ module: StackrCardVisionModule) {
    lock.lock()
    if self.module === module {
      self.module = nil
    }
    lock.unlock()
  }

  static func reset() {
    lock.lock()
    received = 0
    processed = 0
    dropped = 0
    focusFailures = 0
    durations.removeAll()
    lock.unlock()
  }

  @discardableResult
  static func markReceived() -> Int64 {
    lock.lock()
    received += 1
    let value = received
    lock.unlock()
    return value
  }

  @discardableResult
  static func markDropped() -> Int64 {
    lock.lock()
    dropped += 1
    let value = dropped
    lock.unlock()
    return value
  }

  @discardableResult
  static func markFocusFailure() -> Int64 {
    lock.lock()
    focusFailures += 1
    let value = focusFailures
    lock.unlock()
    return value
  }

  static func emitResult(scanId: String?, result: CardFrameAnalysisResult) {
    lock.lock()
    processed += 1
    durations.append(result.processingMs)
    if durations.count > maxSamples {
      durations.removeFirst(durations.count - maxSamples)
    }
    let payload = snapshotLocked(scanId: scanId, result: result.toDictionary(), message: nil)
    let targetModule = module
    lock.unlock()

    DispatchQueue.main.async {
      targetModule?.sendEvent(stackrCardFrameAnalysisEvent, payload)
    }
  }

  static func emitAvailability(scanId: String?, message: String) {
    lock.lock()
    let payload = snapshotLocked(scanId: scanId, result: nil, message: message)
    let targetModule = module
    lock.unlock()

    DispatchQueue.main.async {
      targetModule?.sendEvent(stackrCardFrameAnalysisEvent, payload)
    }
  }

  static func snapshot() -> [String: Any?] {
    lock.lock()
    let payload = snapshotLocked(scanId: nil, result: nil, message: nil)
    lock.unlock()
    return payload
  }

  private static func snapshotLocked(
    scanId: String?,
    result: [String: Any?]?,
    message: String?
  ) -> [String: Any?] {
    var payload: [String: Any?] = [
      "scanId": scanId,
      "analysisFramesReceived": received,
      "framesProcessed": processed,
      "framesDropped": dropped,
      "focusFailures": focusFailures,
      "analyserP50Ms": percentile(durations, ratio: 0.5),
      "analyserP95Ms": percentile(durations, ratio: 0.95)
    ]
    if result != nil {
      payload["result"] = result
    }
    if message != nil {
      payload["message"] = message
    }
    return payload
  }

  private static func percentile(_ values: [Double], ratio: Double) -> Double {
    if values.isEmpty { return 0 }
    let sorted = values.sorted()
    let index = max(0, min(sorted.count - 1, Int(ceil(Double(sorted.count) * ratio)) - 1))
    return sorted[index]
  }
}
