package com.britney.android.embedding

import com.britney.android.db.BritneyDbHelper
import com.britney.android.db.EmbeddingRepo
import org.json.JSONObject
import org.json.JSONArray
import kotlin.math.sqrt

/**
 * Vector similarity search using cosine distance.
 */
class VectorSearcher(
    private val dbHelper: BritneyDbHelper,
    private val embeddingEngine: EmbeddingEngine? = null
) {

    private val embeddingRepo = EmbeddingRepo(dbHelper)

    /**
     * Search for similar vectors across all embeddings.
     * @param queryVector The query vector
     * @param topK Number of results to return
     * @return JSONArray of {id, sourceTable, sourceId, score}
     */
    fun searchByVector(queryVector: FloatArray, topK: Int = 10): JSONArray {
        val allEmbeddings = getAllEmbeddings()

        val scored = allEmbeddings.map { record ->
            val score = cosineSimilarity(queryVector, record.vector)
            SearchResult(record.id, record.sourceTable, record.sourceId, score)
        }
        .sortedByDescending { it.score }
        .take(topK)

        val results = JSONArray()
        scored.forEach { result ->
            results.put(JSONObject().apply {
                put("id", result.id)
                put("sourceTable", result.sourceTable)
                put("sourceId", result.sourceId)
                put("score", result.score)
            })
        }
        return results
    }

    /**
     * Search by text (encode + search).
     * Requires EmbeddingEngine to be initialized.
     */
    fun search(queryText: String, topK: Int = 10): JSONArray {
        val engine = embeddingEngine ?: return JSONArray()
        val queryVector = engine.encode(queryText)
        return searchByVector(queryVector, topK)
    }

    /**
     * Search within a specific source table.
     */
    fun searchInTable(sourceTable: String, queryVector: FloatArray, topK: Int = 10): JSONArray {
        val embeddings = embeddingRepo.getBySourceTable(sourceTable)

        val scored = embeddings.map { record ->
            val score = cosineSimilarity(queryVector, record.vector)
            SearchResult(record.id, record.sourceTable, record.sourceId, score)
        }
        .sortedByDescending { it.score }
        .take(topK)

        val results = JSONArray()
        scored.forEach { result ->
            results.put(JSONObject().apply {
                put("id", result.id)
                put("sourceTable", result.sourceTable)
                put("sourceId", result.sourceId)
                put("score", result.score)
            })
        }
        return results
    }

    // ========== Math ==========

    /**
     * Compute cosine similarity between two vectors.
     */
    private fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size) return 0f

        var dotProduct = 0f
        var normA = 0f
        var normB = 0f

        for (i in a.indices) {
            dotProduct += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }

        val denominator = sqrt(normA) * sqrt(normB)
        return if (denominator == 0f) 0f else dotProduct / denominator
    }

    // ========== Helpers ==========

    private fun getAllEmbeddings(): List<EmbeddingRepo.EmbeddingRecord> {
        val query = JSONObject()
        val jsonArray = dbHelper.query("embeddings", query)

        return (0 until jsonArray.length()).map { i ->
            val obj = jsonArray.getJSONObject(i)
            EmbeddingRepo.EmbeddingRecord(
                id = obj.getString("id"),
                sourceTable = obj.getString("source_table"),
                sourceId = obj.getString("source_id"),
                vector = blobToFloatArray(android.util.Base64.decode(obj.getString("vector"), android.util.Base64.DEFAULT)),
                dimension = obj.getInt("dimension")
            )
        }
    }

    private fun blobToFloatArray(blob: ByteArray): FloatArray {
        val buffer = java.nio.ByteBuffer.wrap(blob)
            .order(java.nio.ByteOrder.LITTLE_ENDIAN)
        return FloatArray(blob.size / 4) { buffer.float }
    }

    private data class SearchResult(
        val id: String,
        val sourceTable: String,
        val sourceId: String,
        val score: Float
    )
}
