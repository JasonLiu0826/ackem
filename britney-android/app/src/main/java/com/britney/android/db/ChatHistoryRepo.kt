package com.britney.android.db

import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

/**
 * Repository for chat history operations.
 */
class ChatHistoryRepo(private val dbHelper: BritneyDbHelper) {

    companion object {
        private const val TABLE = "chat_history"
    }

    /**
     * Save a chat message.
     */
    fun saveMessage(role: String, content: String, model: String? = null, tokensUsed: Int = 0): String {
        val id = UUID.randomUUID().toString()
        val values = JSONObject().apply {
            put("id", id)
            put("role", role)
            put("content", content)
            model?.let { put("model", it) }
            put("tokens_used", tokensUsed)
            put("created_at", System.currentTimeMillis())
        }
        dbHelper.insert(TABLE, values)
        return id
    }

    /**
     * Get recent messages.
     */
    fun getRecent(limit: Int = 50): JSONArray {
        val query = JSONObject().apply {
            put("orderBy", "created_at DESC")
            put("limit", limit)
        }
        return dbHelper.query(TABLE, query)
    }

    /**
     * Get messages for a specific conversation context.
     */
    fun getContextMessages(maxTokens: Int = 4000): JSONArray {
        val messages = getRecent(100)
        val result = JSONArray()
        var tokenEstimate = 0

        for (i in messages.length() - 1 downTo 0) {
            val msg = messages.getJSONObject(i)
            val content = msg.optString("content", "")
            val estimatedTokens = content.length / 2 // rough estimate
            
            if (tokenEstimate + estimatedTokens > maxTokens) break
            tokenEstimate += estimatedTokens
            result.put(msg)
        }

        return result
    }

    /**
     * Clear all chat history.
     */
    fun clearAll(): Boolean {
        return dbHelper.delete(TABLE, JSONObject().apply {
            put("where", "1=1")
        })
    }
}
