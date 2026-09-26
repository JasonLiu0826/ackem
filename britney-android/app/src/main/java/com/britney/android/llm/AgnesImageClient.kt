package com.britney.android.llm

import android.content.Context
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import com.britney.android.security.SecureKeyStore
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

class AgnesImageClient(private val context: Context) {

    companion object {
        private const val DEFAULT_BASE_URL = "https://apihub.agnes-ai.com"
        private const val DEFAULT_MODEL = "agnes-image-2.1-flash"
        private const val TIMEOUT = 120L

        // Shared client — reuses LlmClient's connection pool and thread pool
        private val sharedClient: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(TIMEOUT, TimeUnit.SECONDS)
            .readTimeout(TIMEOUT, TimeUnit.SECONDS)
            .build()
    }

    private val client = sharedClient

    private val keyStore = SecureKeyStore.getInstance(context)

    fun generate(prompt: String, size: String = "1024x1024"): JSONObject {
        // Load settings for API key, base URL, model, auth mode, extra headers
        val savedSettings = try { JSONObject(keyStore.getSettings()) } catch (_: Exception) { JSONObject() }

        val apiKey = savedSettings.optString("openaiApiKey", "")
            .ifEmpty { savedSettings.optString("agnesApiKey", "") }
            .ifEmpty { keyStore.getAgnesApiKey() ?: "" }

        val baseUrl = savedSettings.optString("openaiBaseUrl", "")
            .ifEmpty { DEFAULT_BASE_URL }

        val imageModel = savedSettings.optString("agnesImageModel", "")
            .ifEmpty { DEFAULT_MODEL }

        val authMode = savedSettings.optString("apiKeyHeaderMode", "bearer")
        val extraHeaders = savedSettings.optString("llmExtraHeadersJson", "")

        if (apiKey.isEmpty()) throw Exception("API key not configured")

        val body = JSONObject().apply {
            put("model", imageModel)
            put("prompt", prompt)
            put("size", size)
            put("n", 1)
        }

        val requestBuilder = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/images/generations")
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))

        when (authMode) {
            "x-api-key" -> requestBuilder.addHeader("x-api-key", apiKey)
            else -> requestBuilder.addHeader("Authorization", "Bearer $apiKey")
        }

        if (extraHeaders.isNotEmpty()) {
            try {
                val headers = JSONObject(extraHeaders)
                for (key in headers.keys()) {
                    requestBuilder.addHeader(key, headers.getString(key))
                }
            } catch (_: Exception) {}
        }

        val response = client.newCall(requestBuilder.build()).execute()
        val responseBody = response.body?.string() ?: throw Exception("Empty response")

        if (!response.isSuccessful) {
            throw Exception("Image API error ${response.code}: $responseBody")
        }

        return JSONObject(responseBody)
    }

    fun downloadAndSave(imageUrl: String, filename: String): String {
        val request = Request.Builder()
            .url(imageUrl)
            .get()
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw Exception("Image download failed: ${response.code}")
        }

        val imageBytes = response.body?.bytes() ?: throw Exception("Empty response body")

        val imagesDir = File(context.filesDir, "images")
        imagesDir.mkdirs()
        val outputFile = File(imagesDir, filename)

        FileOutputStream(outputFile).use { it.write(imageBytes) }

        return outputFile.absolutePath
    }
}