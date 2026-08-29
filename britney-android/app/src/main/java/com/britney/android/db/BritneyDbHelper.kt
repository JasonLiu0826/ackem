package com.britney.android.db

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import org.json.JSONArray

/**
 * SQLite database helper for Britney.
 * Manages chat history, memory facts, embeddings, and sync metadata.
 */
class BritneyDbHelper(context: Context) : SQLiteOpenHelper(
    context, DATABASE_NAME, null, DATABASE_VERSION
) {
    companion object {
        private const val DATABASE_NAME = "britney.db"
        private const val DATABASE_VERSION = 1
    }

    override fun onCreate(db: SQLiteDatabase) {
        // Chat history table
        db.execSQL("""
            CREATE TABLE chat_history (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT,
                tokens_used INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                synced_at INTEGER DEFAULT 0
            )
        """)

        // Memory facts table
        db.execSQL("""
            CREATE TABLE memory_facts (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT,
                confidence REAL DEFAULT 1.0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                synced_at INTEGER DEFAULT 0
            )
        """)

        // Embeddings table (for vector search)
        db.execSQL("""
            CREATE TABLE embeddings (
                id TEXT PRIMARY KEY,
                source_table TEXT NOT NULL,
                source_id TEXT NOT NULL,
                vector BLOB NOT NULL,
                dimension INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)

        // Sync metadata
        db.execSQL("""
            CREATE TABLE sync_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)

        // Settings table
        db.execSQL("""
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // TODO: Add migration logic for future schema changes
    }

    /**
     * Insert a row into the specified table.
     */
    fun insert(table: String, values: JSONObject): Boolean {
        val cv = jsonToContentValues(values)
        val id = writableDatabase.insert(table, null, cv)
        return id != -1L
    }

    /**
     * Query rows from the specified table.
     * @param table Table name
     * @param query JSON with keys: where, orderBy, limit, columns
     * @return JSONArray of matching rows
     */
    fun query(table: String, query: JSONObject): JSONArray {
        val where = query.optString("where", null)
        val whereArgs = query.optJSONArray("whereArgs")?.let { arr ->
            Array(arr.length()) { arr.getString(it) }
        }
        val orderBy = query.optString("orderBy", null)
        val limit = query.optInt("limit", 0).let { if (it > 0) it.toString() else null }
        val columns = query.optJSONArray("columns")?.let { arr ->
            Array(arr.length()) { arr.getString(it) }
        }

        val cursor = readableDatabase.query(
            table,
            columns,
            where,
            whereArgs,
            null, null,
            orderBy,
            limit
        )

        return cursorToJsonArray(cursor)
    }

    /**
     * Update rows in the specified table.
     */
    fun update(table: String, values: JSONObject, where: JSONObject): Boolean {
        val cv = jsonToContentValues(values)
        val whereClause = where.optString("where", null)
        val whereArgs = where.optJSONArray("args")?.let { arr ->
            Array(arr.length()) { arr.getString(it) }
        }
        val count = writableDatabase.update(table, cv, whereClause, whereArgs)
        return count > 0
    }

    /**
     * Delete rows from the specified table.
     */
    fun delete(table: String, where: JSONObject): Boolean {
        val whereClause = where.optString("where", null)
        val whereArgs = where.optJSONArray("args")?.let { arr ->
            Array(arr.length()) { arr.getString(it) }
        }
        val count = writableDatabase.delete(table, whereClause, whereArgs)
        return count > 0
    }

    // ========== Helpers ==========

    private fun jsonToContentValues(json: JSONObject): ContentValues {
        val cv = ContentValues()
        json.keys().forEach { key ->
            when (val value = json.get(key)) {
                is String -> cv.put(key, value)
                is Int -> cv.put(key, value)
                is Long -> cv.put(key, value)
                is Double -> cv.put(key, value)
                is Boolean -> cv.put(key, value)
                is Float -> cv.put(key, value)
                else -> cv.put(key, value.toString())
            }
        }
        return cv
    }

    private fun cursorToJsonArray(cursor: Cursor): JSONArray {
        val result = JSONArray()
        cursor.use {
            while (it.moveToNext()) {
                val row = JSONObject()
                for (i in 0 until it.columnCount) {
                    val colName = it.getColumnName(i)
                    when (it.getType(i)) {
                        Cursor.FIELD_TYPE_STRING -> row.put(colName, it.getString(i))
                        Cursor.FIELD_TYPE_INTEGER -> row.put(colName, it.getLong(i))
                        Cursor.FIELD_TYPE_FLOAT -> row.put(colName, it.getDouble(i))
                        Cursor.FIELD_TYPE_BLOB -> row.put(colName, android.util.Base64.encodeToString(it.getBlob(i), android.util.Base64.NO_WRAP))
                        Cursor.FIELD_TYPE_NULL -> row.put(colName, JSONObject.NULL)
                    }
                }
                result.put(row)
            }
        }
        return result
    }
}
