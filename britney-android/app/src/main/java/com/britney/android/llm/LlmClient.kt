package com.britney.android.llm

import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit

class LlmClient {

    companion object {
        private const val DEFAULT_BASE_URL = "https://apihub.agnes-ai.com"
        private const val CONNECT_TIMEOUT = 30L
        private const val READ_TIMEOUT = 120L
        private const val MAX_RETRIES = 2

        // Shared OkHttpClient instance (connection pool + thread pool reuse)
        private val sharedClient: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT, TimeUnit.SECONDS)
            .build()
    }

    // Track current streaming call for cancellation
    @Volatile
    private var currentCall: Call? = null

    fun chatCompletion(params: JSONObject): JSONObject {
        val baseUrl = params.optString("baseUrl", DEFAULT_BASE_URL)
        val apiKey = params.optString("apiKey", "")
        val authMode = params.optString("authMode", "bearer")
        val extraHeaders = params.optString("extraHeaders", "")

        val requestBody = buildRequestBody(params)

        val requestBuilder = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/chat/completions")
            .addHeader("Content-Type", "application/json")
            .post(requestBody.toString().toRequestBody("application/json".toMediaType()))

        applyAuth(requestBuilder, authMode, apiKey)
        applyExtraHeaders(requestBuilder, extraHeaders)

        // Retry on transient failures
        var lastException: Exception? = null
        for (attempt in 0..MAX_RETRIES) {
            try {
                sharedClient.newCall(requestBuilder.build()).execute().use { response ->
                    val body = response.body?.string() ?: throw Exception("Empty response")
                    if (!response.isSuccessful) {
                        throw Exception("API error ${response.code}: $body")
                    }
                    val json = JSONObject(body)
                    fixMiMoContent(json)
                    return json
                }
            } catch (e: SocketTimeoutException) {
                lastException = e
                if (attempt < MAX_RETRIES) continue
                throw e
            }
        }
        throw lastException ?: Exception("Unknown error")
    }

    fun chatCompletionStream(
        params: JSONObject,
        onToken: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        val baseUrl = params.optString("baseUrl", DEFAULT_BASE_URL)
        val apiKey = params.optString("apiKey", "")
        val authMode = params.optString("authMode", "bearer")
        val extraHeaders = params.optString("extraHeaders", "")

        val streamParams = buildRequestBody(params)
        streamParams.put("stream", true)

        val requestBuilder = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/chat/completions")
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "text/event-stream")
            .post(streamParams.toString().toRequestBody("application/json".toMediaType()))

        applyAuth(requestBuilder, authMode, apiKey)
        applyExtraHeaders(requestBuilder, extraHeaders)

        val call = sharedClient.newCall(requestBuilder.build())
        currentCall = call

        try {
            call.execute().use { response ->
                if (!response.isSuccessful) {
                    val errorBody = response.body?.string() ?: "Unknown error"
                    onError("Stream error ${response.code}: $errorBody")
                    return
                }

                response.body?.byteStream()?.use { inputStream ->
                    BufferedReader(InputStreamReader(inputStream)).use { reader ->
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            val l = line ?: continue
                            if (!l.startsWith("data: ")) continue
                            val data = l.removePrefix("data: ").trim()
                            if (data == "[DONE]") break

                            try {
                                val chunk = JSONObject(data)
                                val choices = chunk.optJSONArray("choices") ?: continue
                                if (choices.length() == 0) continue

                                val delta = choices.getJSONObject(0).optJSONObject("delta") ?: continue
                                var content = delta.optString("content", "")
                                if (content.isEmpty()) {
                                    content = delta.optString("reasoning_content", "")
                                }
                                if (content.isNotEmpty()) {
                                    onToken(content)
                                }
                            } catch (_: Exception) {
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            if (e is java.io.IOException && e.message?.contains("Canceled") == true) {
                return // Cancelled by user, not an error
            }
            onError(e.message ?: "Stream failed")
        } finally {
            currentCall = null
        }
    }

    fun cancelCurrentStream() {
        currentCall?.cancel()
        currentCall = null
    }

    private fun applyAuth(builder: Request.Builder, authMode: String, apiKey: String) {
        when (authMode) {
            "x-api-key" -> builder.addHeader("x-api-key", apiKey)
            else -> builder.addHeader("Authorization", "Bearer $apiKey")
        }
    }

    private fun applyExtraHeaders(builder: Request.Builder, extraHeadersJson: String) {
        if (extraHeadersJson.isEmpty()) return
        try {
            val headers = JSONObject(extraHeadersJson)
            for (key in headers.keys()) {
                builder.addHeader(key, headers.getString(key))
            }
        } catch (_: Exception) {
        }
    }

    private fun buildRequestBody(params: JSONObject): JSONObject {
        val body = JSONObject(params.toString())
        body.remove("baseUrl")
        body.remove("apiKey")
        body.remove("provider")
        body.remove("authMode")
        body.remove("extraHeaders")
        body.remove("settings")
        return body
    }

    private fun fixMiMoContent(json: JSONObject) {
        val choices = json.optJSONArray("choices") ?: return
        for (i in 0 until choices.length()) {
            val choice = choices.getJSONObject(i)
            val message = choice.optJSONObject("message") ?: continue
            val content = message.optString("content", "")
            val reasoning = message.optString("reasoning_content", "")
            if (content.isEmpty() && reasoning.isNotEmpty()) {
                message.put("content", reasoning)
            }
        }
    }
}
