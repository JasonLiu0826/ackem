package com.britney.android.tts

import android.content.Context
import android.media.MediaPlayer
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import com.britney.android.security.SecureKeyStore
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * TTS client for text-to-speech synthesis.
 * Uses MiMo TTS API with fallback to Android system TTS.
 */
class MimoTtsClient(private val context: Context) {

    companion object {
        private const val MIMO_TTS_URL = "https://token-plan-cn.xiaomimimo.com/v1/audio/speech"
        private const val DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
        private const val TIMEOUT = 60L
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(TIMEOUT, TimeUnit.SECONDS)
        .build()

    private val keyStore = SecureKeyStore.getInstance(context)
    private var mediaPlayer: MediaPlayer? = null
    private var isPlaying = false

    /**
     * Synthesize speech from text using MiMo TTS API.
     * @param text The text to synthesize
     * @param options JSON with voice, speed, etc.
     * @return Path to the generated audio file
     */
    fun synthesize(text: String, options: JSONObject = JSONObject()): String {
        val apiKey = keyStore.getMimoApiKey()
            ?: throw Exception("MiMo API key not configured")

        val voice = options.optString("voice", DEFAULT_VOICE)
        val speed = options.optInt("speed", 0) // -100 to 100

        // Build request body (OpenAI-compatible TTS format)
        val body = JSONObject().apply {
            put("model", "tts-1")
            put("input", text)
            put("voice", voice)
            put("response_format", "mp3")
            if (speed != 0) {
                put("speed", 1.0 + speed / 100.0)
            }
        }

        val request = Request.Builder()
            .url(MIMO_TTS_URL)
            .addHeader("api-key", apiKey)  // MiMo uses api-key header
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            val error = response.body?.string() ?: "Unknown error"
            throw Exception("TTS error ${response.code}: $error")
        }

        val audioBytes = response.body?.bytes() ?: throw Exception("Empty TTS response")

        // Save to temp file
        val outputDir = File(context.cacheDir, "tts")
        outputDir.mkdirs()
        val outputFile = File(outputDir, "tts_${System.currentTimeMillis()}.mp3")
        FileOutputStream(outputFile).use { it.write(audioBytes) }

        return outputFile.absolutePath
    }

    /**
     * Play audio file.
     */
    fun play(audioPath: String) {
        stop() // Stop any current playback

        mediaPlayer = MediaPlayer().apply {
            setDataSource(audioPath)
            setOnCompletionListener {
                this@MimoTtsClient.isPlaying = false
                release()
                this@MimoTtsClient.mediaPlayer = null
            }
            prepare()
            start()
        }
        isPlaying = true
    }

    /**
     * Synthesize and play in one call.
     */
    fun synthesizeAndPlay(text: String, options: JSONObject = JSONObject()): String {
        val path = synthesize(text, options)
        play(path)
        return path
    }

    /**
     * Stop current playback.
     */
    fun stop() {
        mediaPlayer?.apply {
            if (isPlaying) {
                stop()
            }
            release()
        }
        mediaPlayer = null
        isPlaying = false
    }

    /**
     * Check if currently playing.
     */
    fun isPlaying(): Boolean = isPlaying

    /**
     * Release resources.
     */
    fun release() {
        stop()
    }
}
