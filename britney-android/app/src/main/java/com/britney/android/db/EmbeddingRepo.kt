package com.britney.android.db

import android.content.ContentValues
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

/**
 * Repository for embedding vectors storage and retrieval.
 */
class EmbeddingRepo(private val dbHelper: BritneyDbHelper) {

    companion object {
        private const val TABLE = "embeddings"
    }

    /**
     * Store an embedding vector.
     */
    fun store(sourceTable: String, sourceId: String, vector: FloatArray): String {
        val id = UUID.randomUUID().toString()
        val vectorBlob = floatArrayToBlob(vector)
        
        val values = ContentValues().apply {
            put("id", id)
            put("source_table", sourceTable)
            put("source_id", sourceId)
            put("vector", vectorBlob)
            put("dimension", vector.size)
            put("created_at", System.currentTimeMillis())
        }
        
        dbHelper.let {
            it.writableDatabase.insert(TABLE, null, values)
        }
        return id
    }

    /**
     * Get all embeddings for a source table.
     */
    fun getBySourceTable(sourceTable: String): List<EmbeddingRecord> {
        val query = JSONObject().apply {
            put("where", "source_table = ?")
            put("whereArgs", JSONArray().put(sourceTable))
        }
        val jsonArray = dbHelper.query(TABLE, query)
        
        return (0 until jsonArray.length()).map { i ->
            val obj = jsonArray.getJSONObject(i)
            EmbeddingRecord(
                id = obj.getString("id"),
                sourceTable = obj.getString("source_table"),
                sourceId = obj.getString("source_id"),
                vector = blobToFloatArray(android.util.Base64.decode(obj.getString("vector"), android.util.Base64.DEFAULT)),
                dimension = obj.getInt("dimension")
            )
        }
    }

    /**
     * Delete embeddings for a source.
     */
    fun deleteBySource(sourceTable: String, sourceId: String): Boolean {
        val where = JSONObject().apply {
            put("where", "source_table = ? AND source_id = ?")
            put("args", JSONArray().put(sourceTable).put(sourceId))
        }
        return dbHelper.delete(TABLE, where)
    }

    // ========== Helpers ==========

    private fun floatArrayToBlob(array: FloatArray): ByteArray {
        val buffer = java.nio.ByteBuffer.allocate(array.size * 4)
            .order(java.nio.ByteOrder.LITTLE_ENDIAN)
        array.forEach { buffer.putFloat(it) }
        return buffer.array()
    }

    private fun blobToFloatArray(blob: ByteArray): FloatArray {
        val buffer = java.nio.ByteBuffer.wrap(blob)
            .order(java.nio.ByteOrder.LITTLE_ENDIAN)
        return FloatArray(blob.size / 4) { buffer.float }
    }

    data class EmbeddingRecord(
        val id: String,
        val sourceTable: String,
        val sourceId: String,
        val vector: FloatArray,
        val dimension: Int
    )
}
