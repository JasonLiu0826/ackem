package com.britney.android.bridge

import android.webkit.JavascriptInterface
import com.britney.android.MainActivity
import com.britney.android.AssetCopier
import com.britney.android.llm.LlmClient
import com.britney.android.llm.AgnesImageClient
import com.britney.android.tts.MimoTtsClient
import com.britney.android.db.BritneyDbHelper
import com.britney.android.embedding.EmbeddingEngine
import com.britney.android.embedding.VectorSearcher
import com.britney.android.sync.SyncClient
import com.britney.android.security.SecureKeyStore
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.Executors
import java.io.File
import android.database.sqlite.SQLiteDatabase

class BritneyJSBridge(
    private val activity: MainActivity,
    private val webView: android.webkit.WebView
) {
    private val executor = Executors.newFixedThreadPool(8)
    private val llmClient = LlmClient()
    private val imageClient = AgnesImageClient(activity)
    private val ttsClient = MimoTtsClient(activity)
    private val dbHelper = BritneyDbHelper(activity)
    private val embeddingEngine = EmbeddingEngine(activity)
    private val vectorSearcher = VectorSearcher(dbHelper, embeddingEngine)
    private val syncClient = SyncClient()
    private val keyStore = SecureKeyStore.getInstance(activity)

    // Track current streaming call for cancellation
    @Volatile
    private var currentStreamCallbackId: String? = null

    // ========== LLM Settings Resolution (shared by chatCompletion & startChat) ==========

    private data class LlmSettings(
        val apiKey: String,
        val baseUrl: String,
        val model: String,
        val authMode: String,
        val extraHeaders: String
    )

    private fun resolveLlmSettings(payloadSettings: JSONObject): LlmSettings {
        val saved = try { JSONObject(keyStore.getSettings()) } catch (_: Exception) { JSONObject() }
        val apiKey = payloadSettings.optString("openaiApiKey", "")
            .ifEmpty { payloadSettings.optString("agnesApiKey", "") }
            .ifEmpty { payloadSettings.optString("apiKey", "") }
            .ifEmpty { saved.optString("openaiApiKey", "") }
            .ifEmpty { saved.optString("agnesApiKey", "") }
            .ifEmpty { keyStore.getAgnesApiKey() ?: "" }
        val baseUrl = payloadSettings.optString("openaiBaseUrl", "")
            .ifEmpty { payloadSettings.optString("baseUrl", "") }
            .ifEmpty { saved.optString("openaiBaseUrl", "") }
            .ifEmpty { "https://apihub.agnes-ai.com" }
        val model = payloadSettings.optString("model", "")
            .ifEmpty { payloadSettings.optString("openaiModel", "") }
            .ifEmpty { payloadSettings.optString("agnesChatModel", "") }
            .ifEmpty { saved.optString("model", "") }
            .ifEmpty { saved.optString("openaiModel", "") }
            .ifEmpty { "agnes-2.0-flash" }
        val authMode = payloadSettings.optString("apiKeyHeaderMode", "")
            .ifEmpty { saved.optString("apiKeyHeaderMode", "bearer") }
        val extraHeaders = payloadSettings.optString("llmExtraHeadersJson", "")
            .ifEmpty { saved.optString("llmExtraHeadersJson", "") }
        return LlmSettings(apiKey, baseUrl, model, authMode, extraHeaders)
    }

    // ========== Path Safety ==========

    private fun resolveSafeFile(relPath: String): File? {
        val dataDir = AssetCopier.getDataDir(activity)
        val target = File(dataDir, relPath).canonicalFile
        if (!target.path.startsWith(dataDir.canonicalPath)) {
            return null // path traversal attempt blocked
        }
        return target
    }

    // ========== LLM Chat ==========

    @JavascriptInterface
    fun chatCompletion(params: String, callbackId: String) {
        executor.execute {
            try {
                val p = JSONObject(params)
                val settings = p.optJSONObject("settings") ?: JSONObject()
                val llmSettings = resolveLlmSettings(settings)
                p.put("apiKey", llmSettings.apiKey)
                p.put("baseUrl", llmSettings.baseUrl)
                p.put("model", llmSettings.model)
                p.put("authMode", llmSettings.authMode)
                if (llmSettings.extraHeaders.isNotEmpty()) p.put("extraHeaders", llmSettings.extraHeaders)
                p.remove("settings")
                val result = llmClient.chatCompletion(p)
                callbackSuccess(callbackId, result.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "chat failed")
            }
        }
    }

    @JavascriptInterface
    fun chatCompletionStream(params: String, streamId: String) {
        executor.execute {
            try {
                val p = JSONObject(params)
                val settings = p.optJSONObject("settings") ?: JSONObject()
                val llmSettings = resolveLlmSettings(settings)
                p.put("apiKey", llmSettings.apiKey)
                p.put("baseUrl", llmSettings.baseUrl)
                p.put("model", llmSettings.model)
                p.put("authMode", llmSettings.authMode)
                if (llmSettings.extraHeaders.isNotEmpty()) p.put("extraHeaders", llmSettings.extraHeaders)
                p.remove("settings")

                llmClient.chatCompletionStream(p,
                    onToken = { token ->
                        activity.evaluateJs(
                            "window.__britneyNativeStreamToken('$streamId', ${escapeJs(token)}, false)"
                        )
                    },
                    onError = { error ->
                        activity.evaluateJs(
                            "window.__britneyNativeStreamError('$streamId', '${escapeJs(error)}')"
                        )
                    }
                )
                activity.evaluateJs(
                    "window.__britneyNativeStreamToken('$streamId', '', true)"
                )
            } catch (e: Exception) {
                activity.evaluateJs(
                    "window.__britneyNativeStreamError('$streamId', '${escapeJs(e.message ?: "stream failed")}')"
                )
                activity.evaluateJs(
                    "window.__britneyNativeStreamToken('$streamId', '', true)"
                )
            }
        }
    }

    @JavascriptInterface
    fun startChat(params: String, callbackId: String) {
        executor.execute {
            try {
                currentStreamCallbackId = callbackId
                val payload = JSONObject(params)
                val messages = payload.getJSONArray("messages")
                val settings = payload.optJSONObject("settings") ?: JSONObject()
                val llmSettings = resolveLlmSettings(settings)

                val llmParams = JSONObject().apply {
                    put("messages", messages)
                    put("stream", true)
                    put("apiKey", llmSettings.apiKey)
                    put("baseUrl", llmSettings.baseUrl)
                    put("model", llmSettings.model)
                    put("authMode", llmSettings.authMode)
                    if (llmSettings.extraHeaders.isNotEmpty()) put("extraHeaders", llmSettings.extraHeaders)
                }

                llmClient.chatCompletionStream(llmParams,
                    onToken = { token ->
                        activity.evaluateJs(
                            "window.__britneyNativeStreamToken('$callbackId', ${escapeJs(token)}, false)"
                        )
                    },
                    onError = { error ->
                        activity.evaluateJs(
                            "window.__britneyNativeStreamError('$callbackId', '${escapeJs(error)}')"
                        )
                    }
                )
                activity.evaluateJs(
                    "window.__britneyNativeStreamToken('$callbackId', '', true)"
                )
                callbackSuccess(callbackId, "{\"ok\":true}")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "startChat failed")
            } finally {
                currentStreamCallbackId = null
            }
        }
    }

    @JavascriptInterface
    fun cancelChat() {
        try {
            llmClient.cancelCurrentStream()
        } catch (_: Exception) {}
    }

    // ========== Image Generation ==========

    @JavascriptInterface
    fun generateImage(prompt: String, size: String, callbackId: String) {
        executor.execute {
            try {
                val result = imageClient.generate(prompt, size)
                callbackSuccess(callbackId, result.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "image gen failed")
            }
        }
    }

    // ========== TTS ==========

    @JavascriptInterface
    fun synthesizeSpeech(text: String, options: String, callbackId: String) {
        executor.execute {
            try {
                val path = ttsClient.synthesize(text, JSONObject(options))
                callbackSuccess(callbackId, "\"$path\"")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "tts failed")
            }
        }
    }

    @JavascriptInterface
    fun stopSpeech() {
        ttsClient.stop()
    }

    // ========== Database (async via executor) ==========

    @JavascriptInterface
    fun dbInsert(table: String, values: String, callbackId: String) {
        executor.execute {
            try {
                val cv = jsonToContentValues(JSONObject(values))
                val id = dbHelper.writableDatabase.insertWithOnConflict(
                    table, null, cv, SQLiteDatabase.CONFLICT_REPLACE
                )
                callbackSuccess(callbackId, if (id != -1L) "true" else "false")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "dbInsert failed")
            }
        }
    }

    @JavascriptInterface
    fun dbQuery(table: String, query: String, callbackId: String) {
        executor.execute {
            try {
                val result = dbHelper.query(table, JSONObject(query))
                callbackSuccess(callbackId, result.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "dbQuery failed")
            }
        }
    }

    @JavascriptInterface
    fun dbUpdate(table: String, values: String, where: String, callbackId: String) {
        executor.execute {
            try {
                val result = dbHelper.update(table, JSONObject(values), JSONObject(where))
                callbackSuccess(callbackId, if (result) "true" else "false")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "dbUpdate failed")
            }
        }
    }

    @JavascriptInterface
    fun dbDelete(table: String, where: String, callbackId: String) {
        executor.execute {
            try {
                val result = dbHelper.delete(table, JSONObject(where))
                callbackSuccess(callbackId, if (result) "true" else "false")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "dbDelete failed")
            }
        }
    }

    private fun jsonToContentValues(json: JSONObject): android.content.ContentValues {
        val cv = android.content.ContentValues()
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

    // ========== Embedding ==========

    @JavascriptInterface
    fun embeddingEncode(text: String, callbackId: String) {
        executor.execute {
            try {
                val vector = embeddingEngine.encode(text)
                callbackSuccess(callbackId, vector.joinToString(prefix = "[", postfix = "]"))
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "embedding failed")
            }
        }
    }

    @JavascriptInterface
    fun vectorSearch(query: String, topK: Int, callbackId: String) {
        executor.execute {
            try {
                val results = vectorSearcher.search(query, topK)
                callbackSuccess(callbackId, results.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "search failed")
            }
        }
    }

    // ========== Sync ==========

    @JavascriptInterface
    fun syncPull(sinceTs: Long, callbackId: String) {
        executor.execute {
            try {
                val changes = syncClient.pull(sinceTs)
                callbackSuccess(callbackId, changes.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "sync pull failed")
            }
        }
    }

    @JavascriptInterface
    fun syncPush(changes: String, callbackId: String) {
        executor.execute {
            try {
                syncClient.push(JSONArray(changes))
                callbackSuccess(callbackId, "true")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "sync push failed")
            }
        }
    }

    @JavascriptInterface
    fun syncPair(pairCode: String, callbackId: String) {
        executor.execute {
            try {
                val result = syncClient.pair(pairCode)
                callbackSuccess(callbackId, result.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "pair failed")
            }
        }
    }

    // ========== Chat Flow ==========

    @JavascriptInterface
    fun buildContext(args: String, callbackId: String) {
        executor.execute {
            try {
                val input = JSONObject(args)
                val userText = input.optString("userText", "")
                val recentMessages = input.optJSONArray("recentMessages") ?: JSONArray()
                val sessionId = input.optString("sessionId", "default")
                val systemHint = input.optString("systemHint", "")

                // Read companion config from saved settings
                val savedSettings = try { JSONObject(keyStore.getSettings()) } catch (_: Exception) { JSONObject() }
                val companionName = savedSettings.optString("companionName", "Britney")
                val personalityId = savedSettings.optString("personalityPresetId", "")
                val companionGender = savedSettings.optString("companionGender", "female")
                val companionAppearance = savedSettings.optString("companionAppearance", "")
                val userNickname = savedSettings.optString("userNickname", "")

                // Build personality description based on preset ID
                val personalityDesc = when (personalityId) {
                    "gentle", "gentle_m" -> "温柔体贴，善解人意，说话轻声细语，总是关心对方的感受"
                    "lively", "lively_m" -> "活泼开朗，充满活力，喜欢开玩笑和打闹，语速较快"
                    "cool", "cool_m" -> "酷酷的，话不多但每句都有分量，表面冷淡内心热情"
                    "mystery", "mystery_m" -> "神秘莫测，说话喜欢留悬念，不轻易表露真实想法"
                    "tsundere", "tsundere_m" -> "傲娇，嘴上说着不在意但其实很关心对方，容易害羞"
                    "mature", "mature_m" -> "成熟稳重，做事有条理，给人安全感，偶尔展露温柔"
                    else -> "友善、真诚、有同理心"
                }

                val systemParts = mutableListOf<String>()
                val genderWord = if (companionGender == "male") "男性" else "女性"
                systemParts.add("你是$companionName，一个$genderWord AI伙伴。你的性格特点：$personalityDesc。")
                systemParts.add("请始终保持角色设定，用自然口语化的中文回复，不要使用markdown格式。")
                systemParts.add("回复要简洁有力，像真实聊天一样，避免长篇大论。")
                if (companionAppearance.isNotEmpty()) {
                    systemParts.add("你的外貌特征：$companionAppearance")
                }
                if (userNickname.isNotEmpty()) {
                    systemParts.add("用户的名字是$userNickname。")
                }
                if (systemHint.isNotEmpty()) {
                    systemParts.add(systemHint)
                }

                val messages = JSONArray()
                messages.put(JSONObject().apply {
                    put("role", "system")
                    put("content", systemParts.joinToString(" "))
                })

                for (i in 0 until recentMessages.length()) {
                    val msg = recentMessages.getJSONObject(i)
                    messages.put(JSONObject().apply {
                        put("role", msg.optString("role", "user"))
                        put("content", msg.optString("content", ""))
                    })
                }

                if (userText.isNotEmpty()) {
                    messages.put(JSONObject().apply {
                        put("role", "user")
                        put("content", userText)
                    })
                }

                val ctx = JSONObject().apply {
                    put("messages", messages)
                    put("skipLlm", false)
                    put("turnId", "android_${System.currentTimeMillis()}")
                    put("sessionId", sessionId)
                }
                callbackSuccess(callbackId, ctx.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "buildContext failed")
            }
        }
    }

    @JavascriptInterface
    fun loadChatHistory(callbackId: String) {
        executor.execute {
            try {
                val result = dbHelper.query("chat_messages", JSONObject())
                callbackSuccess(callbackId, result.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "loadChatHistory failed")
            }
        }
    }

    @JavascriptInterface
    fun saveChatHistory(rows: String, callbackId: String) {
        executor.execute {
            try {
                val arr = JSONArray(rows)
                val db = dbHelper.writableDatabase
                db.beginTransaction()
                try {
                    for (i in 0 until arr.length()) {
                        val cv = jsonToContentValues(arr.getJSONObject(i))
                        db.insertWithOnConflict("chat_messages", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
                    }
                    db.setTransactionSuccessful()
                } finally {
                    db.endTransaction()
                }
                callbackSuccess(callbackId, "true")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "saveChatHistory failed")
            }
        }
    }

    // ========== File Operations ==========

    @JavascriptInterface
    fun saveImageBase64(base64: String, filename: String): String {
        val dir = java.io.File(activity.filesDir, "images")
        dir.mkdirs()
        val file = java.io.File(dir, filename)
        file.writeBytes(android.util.Base64.decode(base64, android.util.Base64.DEFAULT))
        return file.absolutePath
    }

    @JavascriptInterface
    fun loadImageBase64(path: String): String {
        val bytes = java.io.File(path).readBytes()
        return android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
    }

    // ========== Settings ==========

    @JavascriptInterface
    fun getSettings(): String {
        val stored = keyStore.getSettings()
        val storedJson = JSONObject(stored)
        val defaults = JSONObject().apply {
            put("llmProvider", "openai")
            put("openaiBaseUrl", "https://apihub.agnes-ai.com")
            put("openaiApiKey", keyStore.getAgnesApiKey() ?: "")
            put("openaiModel", "agnes-2.0-flash")
            put("model", "agnes-2.0-flash")
            put("agnesChatModel", "agnes-2.0-flash")
            put("agnesImageModel", "agnes-image-2.1-flash")
            put("agnesApiKey", keyStore.getAgnesApiKey() ?: "")
            put("anthropicBaseUrl", "")
            put("anthropicApiKey", "")
            put("openforuBaseUrl", "")
            put("openforuModel", "")
            put("openforuApiKey", "")
            put("llmExtraHeadersJson", "")
            put("apiKeyHeaderMode", "bearer")
            // Android端默认已确认年龄，无需弹窗验证
            put("ageConfirmed18", true)
            put("activeSessionId", "default")
            put("language", "zh")
            put("theme", "dark")
            put("companionName", "Britney")
            put("companionAppearance", "")
        }
        for (key in storedJson.keys()) {
            defaults.put(key, storedJson.get(key))
        }
        return defaults.toString()
    }

    @JavascriptInterface
    fun saveSettings(settings: String): Boolean {
        return keyStore.saveSettings(settings)
    }

    // ========== File System (data directory) ==========

    @JavascriptInterface
    fun readRel(relPath: String, callbackId: String) {
        executor.execute {
            try {
                val file = resolveSafeFile(relPath)
                if (file == null || !file.exists() || !file.isFile) {
                    callbackSuccess(callbackId, "{\"ok\":false,\"text\":\"\",\"error\":\"not found\"}")
                    return@execute
                }
                val content = file.readText(Charsets.UTF_8)
                // Frontend expects {ok, text, error}
                val result = JSONObject().apply {
                    put("ok", true)
                    put("text", content)
                    put("error", null as Any?)
                }
                callbackSuccess(callbackId, result.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "readRel failed")
            }
        }
    }

    @JavascriptInterface
    fun writeRel(relPath: String, content: String, callbackId: String) {
        executor.execute {
            try {
                val file = resolveSafeFile(relPath)
                if (file == null) {
                    callbackError(callbackId, "invalid path")
                    return@execute
                }
                file.parentFile?.mkdirs()
                file.writeText(content, Charsets.UTF_8)
                callbackSuccess(callbackId, "true")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "writeRel failed")
            }
        }
    }

    @JavascriptInterface
    fun listRel(relPath: String, callbackId: String) {
        executor.execute {
            try {
                val dir = resolveSafeFile(relPath)
                if (dir == null || !dir.exists() || !dir.isDirectory) {
                    callbackSuccess(callbackId, "[]")
                    return@execute
                }
                val files = dir.listFiles()?.map { it.name } ?: emptyList()
                val arr = JSONArray()
                files.forEach { arr.put(it) }
                callbackSuccess(callbackId, arr.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "listRel failed")
            }
        }
    }

    @JavascriptInterface
    fun existsRel(relPath: String, callbackId: String) {
        executor.execute {
            try {
                val file = resolveSafeFile(relPath)
                callbackSuccess(callbackId, if (file != null && file.exists()) "true" else "false")
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "existsRel failed")
            }
        }
    }

    @JavascriptInterface
    fun archiveRead(relPath: String, callbackId: String) {
        executor.execute {
            try {
                val file = resolveSafeFile("memory/archive/$relPath")
                if (file == null || !file.exists() || !file.isFile) {
                    callbackSuccess(callbackId, "{\"ok\":false,\"text\":\"\",\"error\":\"not found\"}")
                    return@execute
                }
                val content = file.readText(Charsets.UTF_8)
                val result = JSONObject().apply {
                    put("ok", true)
                    put("text", content)
                    put("error", null as Any?)
                }
                callbackSuccess(callbackId, result.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "archiveRead failed")
            }
        }
    }

    @JavascriptInterface
    fun archiveList(relPath: String, callbackId: String) {
        executor.execute {
            try {
                val dir = resolveSafeFile("memory/archive/$relPath")
                if (dir == null || !dir.exists() || !dir.isDirectory) {
                    callbackSuccess(callbackId, "[]")
                    return@execute
                }
                val files = dir.listFiles()?.map { it.name } ?: emptyList()
                val arr = JSONArray()
                files.forEach { arr.put(it) }
                callbackSuccess(callbackId, arr.toString())
            } catch (e: Exception) {
                callbackError(callbackId, e.message ?: "archiveList failed")
            }
        }
    }

    // ========== Platform Info ==========

    @JavascriptInterface
    fun getPlatform(): String = "android"

    @JavascriptInterface
    fun getAppVersion(): String {
        return try {
            activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }

    @JavascriptInterface
    fun getDeviceInfo(): String {
        val deviceId = keyStore.getDeviceId()
        val deviceName = android.os.Build.MODEL
        return JSONObject().apply {
            put("platform", "android")
            put("deviceId", deviceId)
            put("deviceName", deviceName)
        }.toString()
    }

    // ========== Helpers ==========

    private fun callbackSuccess(callbackId: String, result: String) {
        activity.evaluateJs(
            "window.__britneyNativeCallback('$callbackId', $result)"
        )
    }

    private fun callbackError(callbackId: String, error: String) {
        activity.evaluateJs(
            "window.__britneyNativeCallback('$callbackId', null, '${escapeJs(error)}')"
        )
    }

    private fun escapeJs(str: String): String {
        return str
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
            .replace("<", "\\u003c")
            .replace(">", "\\u003e")
            .replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029")
    }
}
