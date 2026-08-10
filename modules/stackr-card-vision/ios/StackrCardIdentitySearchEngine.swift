import CryptoKit
import CoreFoundation
import Foundation
import SQLite3

private let cardIdentitySearchEngineVersion = "stackr-card-identity-flat-search-v1.0.0"
private let embeddingMagic = "STKR-EMB-FP16"
private let expectedDimensions = 128
private let expectedHeaderBytes = 64
private let expectedBytesPerValue = 2

private struct CardIdentitySearchMetadata {
  let canonicalCardId: String
  let language: String?
  let setId: String?
  let collectorNumber: String?
  let era: String?
  let modelVersion: String?
}

private struct LoadedCardIdentityCatalogue {
  let modelVersion: String?
  let packVersion: String?
  let dimensions: Int
  let embeddingCount: Int
  let vectors: [Float]
  let metadata: [CardIdentitySearchMetadata]
  let loadedAt: String
  let loadMs: Double
  let memoryBytes: Int
}

private struct EmbeddingBinaryHeader {
  let magic: String
  let version: Int
  let dimensions: Int
  let embeddingCount: Int
  let dataOffsetBytes: Int
  let bytesPerValue: Int
}

internal enum StackrCardIdentitySearchEngine {
  private static var loadedCatalogue: LoadedCardIdentityCatalogue?

  static func load(_ request: [String: Any?]) -> [String: Any?] {
    let startedAt = CFAbsoluteTimeGetCurrent()
    do {
      guard let embeddingsPath = localPath(request["embeddingsPath"] ?? request["embeddingsUri"]) else {
        return failedLoad("embedding_binary_path_required", startedAt: startedAt)
      }

      let embeddingsData = try Data(contentsOf: URL(fileURLWithPath: embeddingsPath), options: [.mappedIfSafe])
      if let expectedSha256 = stringValue(request["embeddingSha256"] ?? request["embeddingsSha256"]) {
        let actualSha256 = sha256Hex(embeddingsData)
        if expectedSha256.lowercased() != actualSha256 {
          return failedLoad("embedding_binary_checksum_mismatch", startedAt: startedAt, details: [
            "expectedSha256": expectedSha256,
            "actualSha256": actualSha256
          ])
        }
      }

      let header = try parseHeader(embeddingsData)
      guard header.magic == embeddingMagic else {
        return failedLoad("embedding_binary_magic_mismatch", startedAt: startedAt, details: ["magic": header.magic])
      }
      guard header.version == 1 else {
        return failedLoad("embedding_binary_version_mismatch", startedAt: startedAt, details: ["version": header.version])
      }
      guard header.dimensions == expectedDimensions else {
        return failedLoad("embedding_dimension_mismatch", startedAt: startedAt, details: ["dimensions": header.dimensions])
      }
      guard header.bytesPerValue == expectedBytesPerValue else {
        return failedLoad("embedding_storage_mismatch", startedAt: startedAt, details: ["bytesPerValue": header.bytesPerValue])
      }

      let expectedBytes = header.dataOffsetBytes + (header.embeddingCount * header.dimensions * header.bytesPerValue)
      guard embeddingsData.count >= expectedBytes else {
        return failedLoad("embedding_binary_truncated", startedAt: startedAt, details: [
          "expectedBytes": expectedBytes,
          "actualBytes": embeddingsData.count
        ])
      }

      var metadata: [CardIdentitySearchMetadata] = []
      let sqlitePath = localPath(request["sqlitePath"] ?? request["sqliteUri"])
      if header.embeddingCount > 0 {
        guard let sqlitePath else {
          return failedLoad("sqlite_metadata_path_required", startedAt: startedAt)
        }
        metadata = try loadMetadata(sqlitePath: sqlitePath, embeddingCount: header.embeddingCount)
        guard metadata.count == header.embeddingCount else {
          return failedLoad("metadata_embedding_count_mismatch", startedAt: startedAt, details: [
            "metadataCount": metadata.count,
            "embeddingCount": header.embeddingCount
          ])
        }
      }

      let expectedModelVersion = stringValue(request["expectedModelVersion"])
      let modelVersion = metadata.first?.modelVersion ?? stringValue(request["modelVersion"])
      if let expectedModelVersion, let modelVersion, expectedModelVersion != modelVersion {
        return failedLoad("model_version_mismatch", startedAt: startedAt, details: [
          "expectedModelVersion": expectedModelVersion,
          "catalogueModelVersion": modelVersion
        ])
      }

      var vectors: [Float] = []
      vectors.reserveCapacity(header.embeddingCount * header.dimensions)
      if header.embeddingCount > 0 {
        for embeddingIndex in 0..<header.embeddingCount {
          let baseOffset = header.dataOffsetBytes + (embeddingIndex * header.dimensions * header.bytesPerValue)
          for dimension in 0..<header.dimensions {
            let offset = baseOffset + (dimension * header.bytesPerValue)
            vectors.append(halfToFloat(readUInt16LE(embeddingsData, offset: offset)))
          }
        }
      }

      let loadMs = elapsedMs(startedAt)
      let loaded = LoadedCardIdentityCatalogue(
        modelVersion: modelVersion,
        packVersion: stringValue(request["packVersion"]),
        dimensions: header.dimensions,
        embeddingCount: header.embeddingCount,
        vectors: vectors,
        metadata: metadata,
        loadedAt: isoNow(),
        loadMs: loadMs,
        memoryBytes: vectors.count * MemoryLayout<Float>.size
      )
      loadedCatalogue = loaded

      return [
        "status": header.embeddingCount > 0 ? "loaded" : "empty",
        "engineVersion": cardIdentitySearchEngineVersion,
        "modelVersion": loaded.modelVersion,
        "packVersion": loaded.packVersion,
        "dimensions": loaded.dimensions,
        "embeddingCount": loaded.embeddingCount,
        "loadMs": loadMs,
        "memoryBytes": loaded.memoryBytes,
        "message": header.embeddingCount > 0
          ? "Card identity catalogue loaded into native flat-search memory."
          : "Embedding binary is valid but contains no searchable embeddings."
      ]
    } catch {
      return failedLoad(error.localizedDescription, startedAt: startedAt)
    }
  }

  static func reset() -> [String: Any?] {
    loadedCatalogue = nil
    return [
      "status": "success",
      "engineVersion": cardIdentitySearchEngineVersion,
      "message": "Native card identity search catalogue was unloaded."
    ]
  }

  static func search(_ request: [String: Any?]) -> [String: Any?] {
    let startedAt = CFAbsoluteTimeGetCurrent()
    guard let catalogue = loadedCatalogue else {
      return failedSearch("catalogue_not_loaded", startedAt: startedAt)
    }
    guard let query = doubleArray(request["queryEmbedding"]) else {
      return failedSearch("query_embedding_required", startedAt: startedAt)
    }
    guard query.count == catalogue.dimensions else {
      return failedSearch("query_dimension_mismatch", startedAt: startedAt, details: [
        "expectedDimensions": catalogue.dimensions,
        "actualDimensions": query.count
      ])
    }
    guard queryIsNormalised(query) else {
      return failedSearch("query_embedding_not_l2_normalised", startedAt: startedAt)
    }
    if catalogue.embeddingCount == 0 {
      return [
        "status": "empty",
        "engineVersion": cardIdentitySearchEngineVersion,
        "modelVersion": catalogue.modelVersion,
        "packVersion": catalogue.packVersion,
        "dimensions": catalogue.dimensions,
        "embeddingCount": catalogue.embeddingCount,
        "searchedCount": 0,
        "candidateCount": 0,
        "candidates": [],
        "processingMs": elapsedMs(startedAt),
        "message": "The loaded catalogue contains no embeddings."
      ]
    }

    let topK = boundedTopK(request["topK"])
    let filters = filterSets(request["filters"] ?? nil)
    var searchedCount = 0
    var candidates: [[String: Any?]] = []
    candidates.reserveCapacity(min(topK * 4, catalogue.embeddingCount))

    for embeddingIndex in 0..<catalogue.embeddingCount {
      let metadata = catalogue.metadata[embeddingIndex]
      if !matches(metadata.language, filters.language) { continue }
      if !matches(metadata.setId, filters.setId) { continue }
      if !matches(metadata.collectorNumber, filters.collectorNumber) { continue }
      if !matches(metadata.era, filters.era) { continue }

      searchedCount += 1
      let base = embeddingIndex * catalogue.dimensions
      var similarity: Float = 0
      for dimension in 0..<catalogue.dimensions {
        similarity += Float(query[dimension]) * catalogue.vectors[base + dimension]
      }
      candidates.append([
        "canonicalCardId": metadata.canonicalCardId,
        "similarity": Double(similarity),
        "rank": 0,
        "language": metadata.language,
        "setId": metadata.setId,
        "collectorNumber": metadata.collectorNumber,
        "era": metadata.era
      ])
    }

    candidates.sort { left, right in
      let leftSimilarity = left["similarity"] as? Double ?? -.infinity
      let rightSimilarity = right["similarity"] as? Double ?? -.infinity
      if leftSimilarity != rightSimilarity {
        return leftSimilarity > rightSimilarity
      }
      let leftId = left["canonicalCardId"] as? String ?? ""
      let rightId = right["canonicalCardId"] as? String ?? ""
      return leftId < rightId
    }

    let ranked = candidates.prefix(topK).enumerated().map { index, candidate -> [String: Any?] in
      var rankedCandidate = candidate
      rankedCandidate["rank"] = index + 1
      return rankedCandidate
    }

    return [
      "status": ranked.isEmpty ? "empty" : "success",
      "engineVersion": cardIdentitySearchEngineVersion,
      "modelVersion": catalogue.modelVersion,
      "packVersion": catalogue.packVersion,
      "dimensions": catalogue.dimensions,
      "embeddingCount": catalogue.embeddingCount,
      "searchedCount": searchedCount,
      "candidateCount": ranked.count,
      "candidates": Array(ranked),
      "processingMs": elapsedMs(startedAt),
      "message": ranked.isEmpty ? "No embeddings matched the supplied filters." : nil
    ]
  }

  static func benchmark(_ request: [String: Any?]) -> [String: Any?] {
    let counts = intArray(request["embeddingCounts"]) ?? [0, 25_000, 50_000, 100_000]
    let dimensions = intValue(request["dimensions"]) ?? expectedDimensions
    let iterations = max(1, min(intValue(request["iterations"]) ?? 12, 50))
    let topK = max(1, min(intValue(request["topK"]) ?? 10, 100))
    let reports = counts.map { count in
      benchmarkCount(count: count, dimensions: dimensions, iterations: iterations, topK: topK)
    }
    return [
      "status": "passed",
      "engineVersion": cardIdentitySearchEngineVersion,
      "dimensions": dimensions,
      "iterations": iterations,
      "topK": topK,
      "targets": reports,
      "message": "Native exact flat-search benchmark completed with deterministic synthetic embeddings."
    ]
  }

  private static func benchmarkCount(count: Int, dimensions: Int, iterations: Int, topK: Int) -> [String: Any?] {
    if count <= 0 {
      return [
        "label": "pilot catalogue",
        "embeddingCount": 0,
        "loadMs": 0,
        "memoryBytes": 0,
        "p50SearchMs": 0,
        "p95SearchMs": 0,
        "maxSearchMs": 0,
        "topKCorrect": true,
        "status": "empty"
      ]
    }

    let loadStarted = CFAbsoluteTimeGetCurrent()
    var vectors: [Float] = []
    vectors.reserveCapacity(count * dimensions)
    for index in 0..<count {
      vectors.append(contentsOf: deterministicVector(index: index, dimensions: dimensions))
    }
    let loadMs = elapsedMs(loadStarted)
    let queryIndex = min(count - 1, count / 2)
    let query = deterministicVector(index: queryIndex, dimensions: dimensions)
    var timings: [Double] = []
    var topKCorrect = true

    for _ in 0..<iterations {
      let searchStarted = CFAbsoluteTimeGetCurrent()
      var best: [(id: Int, score: Float)] = []
      for index in 0..<count {
        let base = index * dimensions
        var score: Float = 0
        for dimension in 0..<dimensions {
          score += query[dimension] * vectors[base + dimension]
        }
        best.append((id: index, score: score))
      }
      best.sort { left, right in
        if left.score != right.score { return left.score > right.score }
        return left.id < right.id
      }
      topKCorrect = topKCorrect && best.prefix(topK).contains { $0.id == queryIndex }
      timings.append(elapsedMs(searchStarted))
    }

    timings.sort()
    return [
      "label": "\(count) embeddings",
      "embeddingCount": count,
      "loadMs": loadMs,
      "memoryBytes": vectors.count * MemoryLayout<Float>.size,
      "p50SearchMs": percentile(timings, percentile: 0.50),
      "p95SearchMs": percentile(timings, percentile: 0.95),
      "maxSearchMs": timings.last ?? 0,
      "topKCorrect": topKCorrect,
      "status": "measured"
    ]
  }

  private static func parseHeader(_ data: Data) throws -> EmbeddingBinaryHeader {
    if data.count < expectedHeaderBytes {
      throw NSError(domain: "StackrCardIdentitySearch", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Embedding binary is shorter than the required header."
      ])
    }
    let magicData = Data(data.prefix(16).prefix { $0 != 0 })
    let magic = String(data: magicData, encoding: .utf8) ?? ""
    return EmbeddingBinaryHeader(
      magic: magic,
      version: Int(readUInt32LE(data, offset: 16)),
      dimensions: Int(readUInt32LE(data, offset: 20)),
      embeddingCount: Int(readUInt32LE(data, offset: 24)),
      dataOffsetBytes: Int(readUInt32LE(data, offset: 28)),
      bytesPerValue: Int(readUInt32LE(data, offset: 32))
    )
  }

  private static func loadMetadata(sqlitePath: String, embeddingCount: Int) throws -> [CardIdentitySearchMetadata] {
    var database: OpaquePointer?
    guard sqlite3_open_v2(sqlitePath, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else {
      throw NSError(domain: "StackrCardIdentitySearch", code: 2, userInfo: [
        NSLocalizedDescriptionKey: "Unable to open card catalogue SQLite metadata."
      ])
    }
    defer { sqlite3_close(database) }

    let sql = """
      SELECT canonical_card_id, language, set_id, collector_number, model_version
      FROM cards
      WHERE embedding_status = 'ready'
      ORDER BY embedding_offset_bytes
      """
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
      throw NSError(domain: "StackrCardIdentitySearch", code: 3, userInfo: [
        NSLocalizedDescriptionKey: "Unable to prepare card catalogue metadata query."
      ])
    }
    defer { sqlite3_finalize(statement) }

    var rows: [CardIdentitySearchMetadata] = []
    rows.reserveCapacity(embeddingCount)
    while sqlite3_step(statement) == SQLITE_ROW {
      rows.append(CardIdentitySearchMetadata(
        canonicalCardId: sqliteString(statement, index: 0) ?? "",
        language: sqliteString(statement, index: 1),
        setId: sqliteString(statement, index: 2),
        collectorNumber: sqliteString(statement, index: 3),
        era: nil,
        modelVersion: sqliteString(statement, index: 4)
      ))
    }
    return rows
  }

  private static func deterministicVector(index: Int, dimensions: Int) -> [Float] {
    var values: [Float] = []
    values.reserveCapacity(dimensions)
    var sumSquares: Float = 0
    for dimension in 0..<dimensions {
      let value = Float(
        sin(Double(index + 1) * Double(dimension + 3) * 0.017) +
        cos(Double(index + 11) * Double(dimension + 1) * 0.013) * 0.5
      )
      values.append(value)
      sumSquares += value * value
    }
    let norm = sqrt(sumSquares)
    return values.map { $0 / norm }
  }

  private static func failedLoad(
    _ message: String,
    startedAt: CFAbsoluteTime,
    details: [String: Any?] = [:]
  ) -> [String: Any?] {
    return [
      "status": "failed",
      "engineVersion": cardIdentitySearchEngineVersion,
      "loadMs": elapsedMs(startedAt),
      "message": message,
      "details": details
    ]
  }

  private static func failedSearch(
    _ message: String,
    startedAt: CFAbsoluteTime,
    details: [String: Any?] = [:]
  ) -> [String: Any?] {
    return [
      "status": "failed",
      "engineVersion": cardIdentitySearchEngineVersion,
      "searchedCount": 0,
      "candidateCount": 0,
      "candidates": [],
      "processingMs": elapsedMs(startedAt),
      "message": message,
      "details": details
    ]
  }

  private static func queryIsNormalised(_ values: [Double]) -> Bool {
    var sumSquares = 0.0
    for value in values {
      if !value.isFinite { return false }
      sumSquares += value * value
    }
    return abs(sqrt(sumSquares) - 1.0) <= 0.025
  }

  private static func filterSets(_ value: Any?) -> (
    language: Set<String>?,
    setId: Set<String>?,
    collectorNumber: Set<String>?,
    era: Set<String>?
  ) {
    let filters = value as? [String: Any?] ?? [:]
    return (
      stringSet(filters["language"] ?? nil),
      stringSet(filters["setId"] ?? nil),
      stringSet(filters["collectorNumber"] ?? nil),
      stringSet(filters["era"] ?? nil)
    )
  }

  private static func matches(_ value: String?, _ allowed: Set<String>?) -> Bool {
    guard let allowed else { return true }
    guard let value else { return false }
    return allowed.contains(value)
  }

  private static func stringSet(_ value: Any?) -> Set<String>? {
    if let value = value as? String {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : Set([trimmed])
    }
    if let values = value as? [String] {
      let trimmed = values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
      return trimmed.isEmpty ? nil : Set(trimmed)
    }
    if let values = value as? [Any] {
      let trimmed = values.compactMap { stringValue($0)?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
      return trimmed.isEmpty ? nil : Set(trimmed)
    }
    return nil
  }

  private static func doubleArray(_ value: Any?) -> [Double]? {
    if let values = value as? [Double] { return values }
    if let values = value as? [NSNumber] { return values.map { $0.doubleValue } }
    if let values = value as? [Any] {
      return values.compactMap { item in
        if let item = item as? Double { return item }
        if let item = item as? NSNumber { return item.doubleValue }
        return nil
      }
    }
    return nil
  }

  private static func intArray(_ value: Any?) -> [Int]? {
    if let values = value as? [Int] { return values }
    if let values = value as? [NSNumber] { return values.map { $0.intValue } }
    if let values = value as? [Any] {
      return values.compactMap { item in
        if let item = item as? Int { return item }
        if let item = item as? NSNumber { return item.intValue }
        return nil
      }
    }
    return nil
  }

  private static func intValue(_ value: Any?) -> Int? {
    if let value = value as? Int { return value }
    if let value = value as? NSNumber { return value.intValue }
    return nil
  }

  private static func boundedTopK(_ value: Any?) -> Int {
    return max(1, min(intValue(value) ?? 10, 100))
  }

  private static func stringValue(_ value: Any?) -> String? {
    if let value = value as? String {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
    if let value = value as? NSNumber {
      return value.stringValue
    }
    return nil
  }

  private static func localPath(_ value: Any?) -> String? {
    guard let raw = stringValue(value) else { return nil }
    if raw.hasPrefix("file://"), let url = URL(string: raw) {
      return url.path
    }
    return raw
  }

  private static func sqliteString(_ statement: OpaquePointer?, index: Int32) -> String? {
    guard let text = sqlite3_column_text(statement, index) else { return nil }
    return String(cString: text)
  }

  private static func readUInt16LE(_ data: Data, offset: Int) -> UInt16 {
    return UInt16(data[offset]) | (UInt16(data[offset + 1]) << 8)
  }

  private static func readUInt32LE(_ data: Data, offset: Int) -> UInt32 {
    return UInt32(data[offset]) |
      (UInt32(data[offset + 1]) << 8) |
      (UInt32(data[offset + 2]) << 16) |
      (UInt32(data[offset + 3]) << 24)
  }

  private static func halfToFloat(_ value: UInt16) -> Float {
    let sign = UInt32(value & 0x8000) << 16
    var exponent = UInt32(value & 0x7c00) >> 10
    var mantissa = UInt32(value & 0x03ff)

    if exponent == 0 {
      if mantissa == 0 {
        return Float(bitPattern: sign)
      }
      var adjustedExponent = -14
      while (mantissa & 0x0400) == 0 {
        mantissa <<= 1
        adjustedExponent -= 1
      }
      mantissa &= 0x03ff
      let bits = sign | (UInt32(adjustedExponent + 127) << 23) | (mantissa << 13)
      return Float(bitPattern: bits)
    }

    if exponent == 0x1f {
      let bits = sign | 0x7f800000 | (mantissa << 13)
      return Float(bitPattern: bits)
    }

    exponent = exponent + 112
    let bits = sign | (exponent << 23) | (mantissa << 13)
    return Float(bitPattern: bits)
  }

  private static func sha256Hex(_ data: Data) -> String {
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private static func elapsedMs(_ startedAt: CFAbsoluteTime) -> Double {
    return (CFAbsoluteTimeGetCurrent() - startedAt) * 1000
  }

  private static func percentile(_ values: [Double], percentile: Double) -> Double {
    guard !values.isEmpty else { return 0 }
    let index = min(values.count - 1, max(0, Int(ceil(Double(values.count) * percentile)) - 1))
    return values[index]
  }

  private static func isoNow() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
  }
}
