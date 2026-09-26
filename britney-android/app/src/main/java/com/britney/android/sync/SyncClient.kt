package com.britney.android.sync

import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.TimeUnit

/**
 * Sync client for data synchronization between Android and PC.
 * Handles pull/push of chat history, memory facts, and embeddings.
 */
class SyncClient {

    companion object {
        private const val DEFAULT_SERVER_URL = "http://localhost:8780"
        private const val TIMEOUT = 30L
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(TIMEOUT, TimeUnit.SECONDS)
        .build()

    private var serverUrl: String = DEFAULT_SERVER_URL
    private var authToken: String? = null

    /**
     * Configure sync server connection.
     */
    fun configure(url: String, token: String? = null) {
        serverUrl = url
        authToken = token
    }

    /**
     * Pull changes from server since a timestamp.
     * @param sinceTs Unix timestamp in milliseconds
     * @return JSONArray of change records
     */
    fun pull(sinceTs: Long): JSONArray {
        val url = "$serverUrl/api/sync/pull?since=$sinceTs"
        
        val requestBuilder = Request.Builder()
            .url(url)
            .get()
        
        authToken?.let { requestBuilder.addHeader("Authorization", "Bearer $it") }
        
        val response = client.newCall(requestBuilder.build()).execute()
        val body = response.body?.string() ?: throw Exception("Empty sync response")
        
        if (!response.isSuccessful) {
            throw Exception("Sync pull error ${response.code}: $body")
        }
        
        return JSONArray(body)
    }

    /**
     * Push local changes to server.
     * @param changes JSONArray of change records
     */
    fun push(changes: JSONArray) {
        val requestBuilder = Request.Builder()
            .url("$serverUrl/api/sync/push")
            .post(changes.toString().toRequestBody("application/json".toMediaType()))
        
        authToken?.let { requestBuilder.addHeader("Authorization", "Bearer $it") }
        
        val response = client.newCall(requestBuilder.build()).execute()
        
        if (!response.isSuccessful) {
            val error = response.body?.string() ?: "Unknown error"
            throw Exception("Sync push error ${response.code}: $error")
        }
    }

    /**
     * Initiate device pairing with a pair code.
     * @param pairCode 6-digit pairing code
     * @return JSONObject with pairing status
     */
    fun pair(pairCode: String): JSONObject {
        val body = JSONObject().apply {
            put("pairCode", pairCode)
            put("platform", "android")
            put("deviceName", android.os.Build.MODEL)
        }

        val requestBuilder = Request.Builder()
            .url("$serverUrl/api/sync/pair")
            .post(body.toString().toRequestBody("application/json".toMediaType()))

        val response = client.newCall(requestBuilder.build()).execute()
        val responseBody = response.body?.string() ?: throw Exception("Empty pair response")
        
        if (!response.isSuccessful) {
            throw Exception("Pair error ${response.code}: $responseBody")
        }
        
        return JSONObject(responseBody)
    }

    /**
     * Get sync status.
     */
    fun getStatus(): JSONObject {
        val requestBuilder = Request.Builder()
            .url("$serverUrl/api/sync/status")
            .get()
        
        authToken?.let { requestBuilder.addHeader("Authorization", "Bearer $it") }
        
        val response = client.newCall(requestBuilder.build()).execute()
        val body = response.body?.string() ?: throw Exception("Empty status response")
        
        if (!response.isSuccessful) {
            throw Exception("Status error ${response.code}: $body")
        }
        
        return JSONObject(body)
    }
}
