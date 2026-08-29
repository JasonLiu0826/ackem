package com.britney.android.db

import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

/**
 * Repository for memory facts operations.
 */
class MemoryFactsRepo(private val dbHelper: BritneyDbHelper) {

    companion object {
        private const val TABLE = "memory_facts"
    }

    /**
     * Save a memory fact.
     */
    fun saveFact(category: String, content: String, source: String? = null, confidence: Double = 1.0): String {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val values = JSONObject().apply {
            put("id", id)
            put("category", category)
            put("content", content)
            source?.let { put("source", it) }
            put("confidence", confidence)
            put("created_at", now)
            put("updated_at", now)
        }
        dbHelper.insert(TABLE, values)
        return id
    }

    /**
     * Get facts by category.
     */
    fun getByCategory(category: String, limit: Int = 100): JSONArray {
        val query = JSONObject().apply {
            put("where", "category = ?")
            put("whereArgs", JSONArray().put(category))
            put("orderBy", "updated_at DESC")
            put("limit", limit)
        }
        return dbHelper.query(TABLE, query)
    }

    /**
     * Search facts by content keyword.
     */
    fun search(keyword: String, limit: Int = 20): JSONArray {
        val query = JSONObject().apply {
            put("where", "content LIKE ?")
            put("whereArgs", JSONArray().put("%$keyword%"))
            put("orderBy", "confidence DESC, updated_at DESC")
            put("limit", limit)
        }
        return dbHelper.query(TABLE, query)
    }

    /**
     * Update a fact's content.
     */
    fun updateFact(id: String, content: String, confidence: Double? = null): Boolean {
        val values = JSONObject().apply {
            put("content", content)
            put("updated_at", System.currentTimeMillis())
            confidence?.let { put("confidence", it) }
        }
        val where = JSONObject().apply {
            put("where", "id = ?")
            put("args", JSONArray().put(id))
        }
        return dbHelper.update(TABLE, values, where)
    }

    /**
     * Delete a fact.
     */
    fun deleteFact(id: String): Boolean {
        val where = JSONObject().apply {
            put("where", "id = ?")
            put("args", JSONArray().put(id))
        }
        return dbHelper.delete(TABLE, where)
    }

    /**
     * Get all facts (for sync).
     */
    fun getAll(sinceTimestamp: Long = 0): JSONArray {
        val query = JSONObject().apply {
            if (sinceTimestamp > 0) {
                put("where", "updated_at > ?")
                put("whereArgs", JSONArray().put(sinceTimestamp))
            }
            put("orderBy", "updated_at ASC")
        }
        return dbHelper.query(TABLE, query)
    }
}
