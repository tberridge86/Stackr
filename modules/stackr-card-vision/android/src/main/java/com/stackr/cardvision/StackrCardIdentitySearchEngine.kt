package com.stackr.cardvision

import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import java.security.MessageDigest
import java.time.Instant
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.system.measureNanoTime

private const val CARD_IDENTITY_SEARCH_ENGINE_VERSION = "stackr-card-identity-flat-search-v1.0.0"
private const val EMBEDDING_MAGIC = "STKR-EMB-FP16"
private const val EXPECTED_DIMENSIONS = 128
private const val EXPECTED_HEADER_BYTES = 64
private const val EXPECTED_BYTES_PER_VALUE = 2

private data class CardIdentitySearchMetadata(
  val canonicalCardId: String,
  val language: String?,
  val setId: String?,
  val collectorNumber: String?,
  val era: String?,
  val modelVersion: String?
)

private data class LoadedCardIdentityCatalogue(
  val modelVersion: String?,
  val packVersion: String?,
  val dimensions: Int,
  val embeddingCount: Int,
  val vectors: FloatArray,
  val metadata: List<CardIdentitySearchMetadata>,
  val loadedAt: String,
  val loadMs: Double,
  val memoryBytes: Long
)

private data class EmbeddingBinaryHeader(
  val magic: String,
  val version: Int,
  val dimensions: Int,
  val embeddingCount: Int,
  val dataOffsetBytes: Int,
  val bytesPerValue: Int
)

internal object StackrCardIdentitySearchEngine {
  private var loadedCatalogue: LoadedCardIdentityCatalogue? = null

  fun load(request: Map<String, Any?>): Map<String, Any?> {
    val startedAt = System.nanoTime()
    return try {
      val embeddingsPath = localPath(request["embeddingsPath"] ?: request["embeddingsUri"])
        ?: return failedLoad("embedding_binary_path_required", startedAt)
      val embeddingFile = File(embeddingsPath)
      if (!embeddingFile.exists()) {
        return failedLoad("embedding_binary_missing", startedAt, mapOf("path" to embeddingsPath))
      }

      val expectedSha256 = stringValue(request["embeddingSha256"] ?: request["embeddingsSha256"])
      if (expectedSha256 != null) {
        val actualSha256 = sha256File(embeddingFile)
        if (!expectedSha256.equals(actualSha256, ignoreCase = true)) {
          return failedLoad(
            "embedding_binary_checksum_mismatch",
            startedAt,
            mapOf("expectedSha256" to expectedSha256, "actualSha256" to actualSha256)
          )
        }
      }

      RandomAccessFile(embeddingFile, "r").use { randomAccessFile ->
        val channel = randomAccessFile.channel
        val mapped = channel.map(FileChannel.MapMode.READ_ONLY, 0, channel.size())
        mapped.order(ByteOrder.LITTLE_ENDIAN)
        val header = parseHeader(mapped)
        if (header.magic != EMBEDDING_MAGIC) {
          return failedLoad("embedding_binary_magic_mismatch", startedAt, mapOf("magic" to header.magic))
        }
        if (header.version != 1) {
          return failedLoad("embedding_binary_version_mismatch", startedAt, mapOf("version" to header.version))
        }
        if (header.dimensions != EXPECTED_DIMENSIONS) {
          return failedLoad("embedding_dimension_mismatch", startedAt, mapOf("dimensions" to header.dimensions))
        }
        if (header.bytesPerValue != EXPECTED_BYTES_PER_VALUE) {
          return failedLoad("embedding_storage_mismatch", startedAt, mapOf("bytesPerValue" to header.bytesPerValue))
        }

        val expectedBytes = header.dataOffsetBytes.toLong() +
          (header.embeddingCount.toLong() * header.dimensions.toLong() * header.bytesPerValue.toLong())
        if (channel.size() < expectedBytes) {
          return failedLoad(
            "embedding_binary_truncated",
            startedAt,
            mapOf("expectedBytes" to expectedBytes, "actualBytes" to channel.size())
          )
        }

        val sqlitePath = localPath(request["sqlitePath"] ?: request["sqliteUri"])
        val metadata = if (header.embeddingCount > 0) {
          if (sqlitePath == null) {
            return failedLoad("sqlite_metadata_path_required", startedAt)
          }
          loadMetadata(sqlitePath, header.embeddingCount)
        } else {
          emptyList()
        }
        if (metadata.size != header.embeddingCount) {
          return failedLoad(
            "metadata_embedding_count_mismatch",
            startedAt,
            mapOf("metadataCount" to metadata.size, "embeddingCount" to header.embeddingCount)
          )
        }

        val expectedModelVersion = stringValue(request["expectedModelVersion"])
        val modelVersion = metadata.firstOrNull()?.modelVersion ?: stringValue(request["modelVersion"])
        if (expectedModelVersion != null && modelVersion != null && expectedModelVersion != modelVersion) {
          return failedLoad(
            "model_version_mismatch",
            startedAt,
            mapOf("expectedModelVersion" to expectedModelVersion, "catalogueModelVersion" to modelVersion)
          )
        }

        val vectors = FloatArray(header.embeddingCount * header.dimensions)
        for (embeddingIndex in 0 until header.embeddingCount) {
          val baseOffset = header.dataOffsetBytes + (embeddingIndex * header.dimensions * header.bytesPerValue)
          for (dimension in 0 until header.dimensions) {
            val offset = baseOffset + (dimension * header.bytesPerValue)
            vectors[(embeddingIndex * header.dimensions) + dimension] =
              halfToFloat(mapped.getShort(offset).toInt() and 0xffff)
          }
        }

        val loadMs = elapsedMs(startedAt)
        val loaded = LoadedCardIdentityCatalogue(
          modelVersion = modelVersion,
          packVersion = stringValue(request["packVersion"]),
          dimensions = header.dimensions,
          embeddingCount = header.embeddingCount,
          vectors = vectors,
          metadata = metadata,
          loadedAt = Instant.now().toString(),
          loadMs = loadMs,
          memoryBytes = vectors.size.toLong() * java.lang.Float.BYTES
        )
        loadedCatalogue = loaded
        mapOf(
          "status" to if (header.embeddingCount > 0) "loaded" else "empty",
          "engineVersion" to CARD_IDENTITY_SEARCH_ENGINE_VERSION,
          "modelVersion" to loaded.modelVersion,
          "packVersion" to loaded.packVersion,
          "dimensions" to loaded.dimensions,
          "embeddingCount" to loaded.embeddingCount,
          "loadMs" to loadMs,
          "memoryBytes" to loaded.memoryBytes,
          "message" to if (header.embeddingCount > 0) {
            "Card identity catalogue loaded into native flat-search memory."
          } else {
            "Embedding binary is valid but contains no searchable embeddings."
          }
        )
      }
    } catch (error: Throwable) {
      failedLoad(error.message ?: error.javaClass.simpleName, startedAt)
    }
  }

  fun reset(): Map<String, Any?> {
    loadedCatalogue = null
    return mapOf(
      "status" to "success",
      "engineVersion" to CARD_IDENTITY_SEARCH_ENGINE_VERSION,
      "message" to "Native card identity search catalogue was unloaded."
    )
  }

  fun search(request: Map<String, Any?>): Map<String, Any?> {
    val startedAt = System.nanoTime()
    val catalogue = loadedCatalogue
      ?: return failedSearch("catalogue_not_loaded", startedAt)
    val query = doubleArray(request["queryEmbedding"])
      ?: return failedSearch("query_embedding_required", startedAt)
    if (query.size != catalogue.dimensions) {
      return failedSearch(
        "query_dimension_mismatch",
        startedAt,
        mapOf("expectedDimensions" to catalogue.dimensions, "actualDimensions" to query.size)
      )
    }
    if (!queryIsNormalised(query)) {
      return failedSearch("query_embedding_not_l2_normalised", startedAt)
    }
    if (catalogue.embeddingCount == 0) {
      return mapOf(
        "status" to "empty",
        "engineVersion" to CARD_IDENTITY_SEARCH_ENGINE_VERSION,
        "modelVersion" to catalogue.modelVersion,
        "packVersion" to catalogue.packVersion,
        "dimensions" to catalogue.dimensions,
        "embeddingCount" to catalogue.embeddingCount,
        "searchedCount" to 0,
        "candidateCount" to 0,
        "candidates" to emptyList<Map<String, Any?>>(),
        "processingMs" to elapsedMs(startedAt),
        "message" to "The loaded catalogue contains no embeddings."
      )
    }

    val topK = boundedTopK(request["topK"])
    val filters = filterSets(request["filters"])
    val candidates = mutableListOf<MutableMap<String, Any?>>()
    var searchedCount = 0

    for (embeddingIndex in 0 until catalogue.embeddingCount) {
      val metadata = catalogue.metadata[embeddingIndex]
      if (!matches(metadata.language, filters.language)) continue
      if (!matches(metadata.setId, filters.setId)) continue
      if (!matches(metadata.collectorNumber, filters.collectorNumber)) continue
      if (!matches(metadata.era, filters.era)) continue

      searchedCount += 1
      val base = embeddingIndex * catalogue.dimensions
      var similarity = 0.0
      for (dimension in 0 until catalogue.dimensions) {
        similarity += query[dimension] * catalogue.vectors[base + dimension].toDouble()
      }
      candidates.add(
        mutableMapOf(
          "canonicalCardId" to metadata.canonicalCardId,
          "similarity" to similarity,
          "rank" to 0,
          "language" to metadata.language,
          "setId" to metadata.setId,
          "collectorNumber" to metadata.collectorNumber,
          "era" to metadata.era
        )
      )
    }

    candidates.sortWith { left, right ->
      val leftSimilarity = left["similarity"] as? Double ?: Double.NEGATIVE_INFINITY
      val rightSimilarity = right["similarity"] as? Double ?: Double.NEGATIVE_INFINITY
      when {
        rightSimilarity > leftSimilarity -> 1
        rightSimilarity < leftSimilarity -> -1
        else -> (left["canonicalCardId"] as? String ?: "")
          .compareTo(right["canonicalCardId"] as? String ?: "")
      }
    }
    val ranked = candidates.take(topK).mapIndexed { index, candidate ->
      candidate["rank"] = index + 1
      candidate
    }

    return mapOf(
      "status" to if (ranked.isEmpty()) "empty" else "success",
      "engineVersion" to CARD_IDENTITY_SEARCH_ENGINE_VERSION,
      "modelVersion" to catalogue.modelVersion,
      "packVersion" to catalogue.packVersion,
      "dimensions" to catalogue.dimensions,
      "embeddingCount" to catalogue.embeddingCount,
      "searchedCount" to searchedCount,
      "candidateCount" to ranked.size,
      "candidates" to ranked,
      "processingMs" to elapsedMs(startedAt),
      "message" to if (ranked.isEmpty()) "No embeddings matched the supplied filters." else null
    )
  }

  fun benchmark(request: Map<String, Any?>): Map<String, Any?> {
    val counts = intArray(request["embeddingCounts"]) ?: listOf(0, 25_000, 50_000, 100_000)
    val dimensions = intValue(request["dimensions"]) ?: EXPECTED_DIMENSIONS
    val iterations = max(1, min(intValue(request["iterations"]) ?: 12, 50))
    val topK = max(1, min(intValue(request["topK"]) ?: 10, 100))
    return mapOf(
      "status" to "passed",
      "engineVersion" to CARD_IDENTITY_SEARCH_ENGINE_VERSION,
      "dimensions" to dimensions,
      "iterations" to iterations,
      "topK" to topK,
      "targets" to counts.map { benchmarkCount(it, dimensions, iterations, topK) },
      "message" to "Native exact flat-search benchmark completed with deterministic synthetic embeddings."
    )
  }

  private fun benchmarkCount(
    count: Int,
    dimensions: Int,
    iterations: Int,
    topK: Int
  ): Map<String, Any?> {
    if (count <= 0) {
      return mapOf(
        "label" to "pilot catalogue",
        "embeddingCount" to 0,
        "loadMs" to 0,
        "memoryBytes" to 0,
        "p50SearchMs" to 0,
        "p95SearchMs" to 0,
        "maxSearchMs" to 0,
        "topKCorrect" to true,
        "status" to "empty"
      )
    }

    var vectors = FloatArray(0)
    val loadNs = measureNanoTime {
      vectors = FloatArray(count * dimensions)
      for (index in 0 until count) {
        val vector = deterministicVector(index, dimensions)
        for (dimension in 0 until dimensions) {
          vectors[(index * dimensions) + dimension] = vector[dimension]
        }
      }
    }
    val queryIndex = min(count - 1, count / 2)
    val query = deterministicVector(queryIndex, dimensions)
    val timings = mutableListOf<Double>()
    var topKCorrect = true

    repeat(iterations) {
      val best = mutableListOf<Pair<Int, Float>>()
      val searchNs = measureNanoTime {
        for (index in 0 until count) {
          val base = index * dimensions
          var score = 0f
          for (dimension in 0 until dimensions) {
            score += query[dimension] * vectors[base + dimension]
          }
          best.add(index to score)
        }
        best.sortWith { left, right ->
          when {
            right.second > left.second -> 1
            right.second < left.second -> -1
            else -> left.first.compareTo(right.first)
          }
        }
      }
      topKCorrect = topKCorrect && best.take(topK).any { it.first == queryIndex }
      timings.add(searchNs / 1_000_000.0)
    }
    timings.sort()

    return mapOf(
      "label" to "$count embeddings",
      "embeddingCount" to count,
      "loadMs" to loadNs / 1_000_000.0,
      "memoryBytes" to vectors.size.toLong() * java.lang.Float.BYTES,
      "p50SearchMs" to percentile(timings, 0.50),
      "p95SearchMs" to percentile(timings, 0.95),
      "maxSearchMs" to (timings.lastOrNull() ?: 0.0),
      "topKCorrect" to topKCorrect,
      "status" to "measured"
    )
  }

  private fun parseHeader(buffer: ByteBuffer): EmbeddingBinaryHeader {
    if (buffer.limit() < EXPECTED_HEADER_BYTES) {
      throw IllegalArgumentException("Embedding binary is shorter than the required header.")
    }
    val magicBytes = ByteArray(16)
    val duplicate = buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN)
    duplicate.position(0)
    duplicate.get(magicBytes)
    val nulIndex = magicBytes.indexOf(0)
    val magicLength = if (nulIndex >= 0) nulIndex else magicBytes.size
    val magic = String(magicBytes, 0, magicLength, Charsets.UTF_8)
    return EmbeddingBinaryHeader(
      magic = magic,
      version = buffer.getInt(16),
      dimensions = buffer.getInt(20),
      embeddingCount = buffer.getInt(24),
      dataOffsetBytes = buffer.getInt(28),
      bytesPerValue = buffer.getInt(32)
    )
  }

  private fun loadMetadata(sqlitePath: String, embeddingCount: Int): List<CardIdentitySearchMetadata> {
    val rows = ArrayList<CardIdentitySearchMetadata>(embeddingCount)
    SQLiteDatabase.openDatabase(sqlitePath, null, SQLiteDatabase.OPEN_READONLY).use { database ->
      database.rawQuery(
        """
        SELECT canonical_card_id, language, set_id, collector_number, model_version
        FROM cards
        WHERE embedding_status = 'ready'
        ORDER BY embedding_offset_bytes
        """.trimIndent(),
        emptyArray()
      ).use { cursor ->
        while (cursor.moveToNext()) {
          rows.add(
            CardIdentitySearchMetadata(
              canonicalCardId = cursor.getString(0),
              language = cursor.getString(1),
              setId = cursor.getString(2),
              collectorNumber = cursor.getString(3),
              era = null,
              modelVersion = cursor.getString(4)
            )
          )
        }
      }
    }
    return rows
  }

  private fun deterministicVector(index: Int, dimensions: Int): FloatArray {
    val values = FloatArray(dimensions)
    var sumSquares = 0f
    for (dimension in 0 until dimensions) {
      val value = (
        sin((index + 1).toDouble() * (dimension + 3).toDouble() * 0.017) +
          cos((index + 11).toDouble() * (dimension + 1).toDouble() * 0.013) * 0.5
        ).toFloat()
      values[dimension] = value
      sumSquares += value * value
    }
    val norm = sqrt(sumSquares)
    for (dimension in 0 until dimensions) {
      values[dimension] = values[dimension] / norm
    }
    return values
  }

  private fun failedLoad(
    message: String,
    startedAt: Long,
    details: Map<String, Any?> = emptyMap()
  ): Map<String, Any?> = mapOf(
    "status" to "failed",
    "engineVersion" to CARD_IDENTITY_SEARCH_ENGINE_VERSION,
    "loadMs" to elapsedMs(startedAt),
    "message" to message,
    "details" to details
  )

  private fun failedSearch(
    message: String,
    startedAt: Long,
    details: Map<String, Any?> = emptyMap()
  ): Map<String, Any?> = mapOf(
    "status" to "failed",
    "engineVersion" to CARD_IDENTITY_SEARCH_ENGINE_VERSION,
    "searchedCount" to 0,
    "candidateCount" to 0,
    "candidates" to emptyList<Map<String, Any?>>(),
    "processingMs" to elapsedMs(startedAt),
    "message" to message,
    "details" to details
  )

  private fun queryIsNormalised(values: List<Double>): Boolean {
    var sumSquares = 0.0
    for (value in values) {
      if (!value.isFinite()) return false
      sumSquares += value * value
    }
    return abs(sqrt(sumSquares) - 1.0) <= 0.025
  }

  private data class FilterSets(
    val language: Set<String>?,
    val setId: Set<String>?,
    val collectorNumber: Set<String>?,
    val era: Set<String>?
  )

  @Suppress("UNCHECKED_CAST")
  private fun filterSets(value: Any?): FilterSets {
    val filters = value as? Map<String, Any?> ?: emptyMap()
    return FilterSets(
      language = stringSet(filters["language"]),
      setId = stringSet(filters["setId"]),
      collectorNumber = stringSet(filters["collectorNumber"]),
      era = stringSet(filters["era"])
    )
  }

  private fun matches(value: String?, allowed: Set<String>?): Boolean {
    if (allowed == null) return true
    if (value == null) return false
    return allowed.contains(value)
  }

  private fun stringSet(value: Any?): Set<String>? {
    val values = when (value) {
      null -> emptyList()
      is String -> listOf(value)
      is List<*> -> value.mapNotNull { it?.toString() }
      else -> listOf(value.toString())
    }.map { it.trim() }.filter { it.isNotEmpty() }
    return if (values.isEmpty()) null else values.toSet()
  }

  private fun doubleArray(value: Any?): List<Double>? {
    return when (value) {
      is List<*> -> value.mapNotNull {
        when (it) {
          is Number -> it.toDouble()
          else -> null
        }
      }.takeIf { it.size == value.size }
      else -> null
    }
  }

  private fun intArray(value: Any?): List<Int>? {
    return when (value) {
      is List<*> -> value.mapNotNull {
        when (it) {
          is Number -> it.toInt()
          else -> null
        }
      }.takeIf { it.size == value.size }
      else -> null
    }
  }

  private fun intValue(value: Any?): Int? {
    return when (value) {
      is Number -> value.toInt()
      else -> null
    }
  }

  private fun boundedTopK(value: Any?): Int = max(1, min(intValue(value) ?: 10, 100))

  private fun stringValue(value: Any?): String? {
    return value?.toString()?.trim()?.takeIf { it.isNotEmpty() }
  }

  private fun localPath(value: Any?): String? {
    val raw = stringValue(value) ?: return null
    return if (raw.startsWith("file://")) {
      java.net.URI(raw).path
    } else {
      raw
    }
  }

  private fun halfToFloat(bits: Int): Float {
    val sign = (bits and 0x8000) shl 16
    var exponent = (bits ushr 10) and 0x1f
    var mantissa = bits and 0x03ff

    if (exponent == 0) {
      if (mantissa == 0) {
        return Float.fromBits(sign)
      }
      var adjustedExponent = -14
      while ((mantissa and 0x0400) == 0) {
        mantissa = mantissa shl 1
        adjustedExponent -= 1
      }
      mantissa = mantissa and 0x03ff
      val floatBits = sign or ((adjustedExponent + 127) shl 23) or (mantissa shl 13)
      return Float.fromBits(floatBits)
    }

    if (exponent == 0x1f) {
      return Float.fromBits(sign or 0x7f800000 or (mantissa shl 13))
    }

    exponent += 112
    return Float.fromBits(sign or (exponent shl 23) or (mantissa shl 13))
  }

  private fun sha256File(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }

  private fun elapsedMs(startedAt: Long): Double = (System.nanoTime() - startedAt) / 1_000_000.0

  private fun percentile(values: List<Double>, percentile: Double): Double {
    if (values.isEmpty()) return 0.0
    val index = min(values.size - 1, max(0, ceil(values.size * percentile).toInt() - 1))
    return values[index]
  }
}
