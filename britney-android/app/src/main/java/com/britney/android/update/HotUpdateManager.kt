package com.britney.android.update

import android.content.Context
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream

/**
 * Hot update manager for Britney Android.
 * Downloads frontend updates from Cloudflare Worker and applies them
 * via shouldInterceptRequest in BritneyWebViewClient.
 */
class HotUpdateManager(private val context: Context) {

    companion object {
        private const val TAG = "HotUpdate"
        private const val UPDATE_URL = "https://update.lrtws.top/britney/version"
        private const val DOWNLOAD_BASE = "https://update.lrtws.top/britney"
        private const val UPDATE_DIR = "web_update"
        private const val VERSION_FILE = "update_version.txt"
        private const val TIMEOUT = 30L
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(TIMEOUT, TimeUnit.SECONDS)
        .build()

    private val updateDir = File(context.filesDir, UPDATE_DIR)
    private val versionFile = File(context.filesDir, VERSION_FILE)

    /**
     * Check for updates and download if available.
     * Call this on app startup (non-blocking).
     */
    fun checkAndUpdate() {
        try {
            val currentVersion = getLocalVersion()
            val remoteInfo = fetchRemoteVersion() ?: return

            val remoteVersion = remoteInfo.optString("version", "0")
            val downloadUrl = remoteInfo.optString("downloadUrl", "")

            if (isNewer(remoteVersion, currentVersion) && downloadUrl.isNotEmpty()) {
                Log.i(TAG, "Update available: $currentVersion -> $remoteVersion")
                downloadAndApply(downloadUrl, remoteVersion)
            } else {
                Log.d(TAG, "No update available. Current: $currentVersion")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Update check failed: ${e.message}")
        }
    }

    /**
     * Get the URL for the updated index.html, or null if no update.
     */
    fun getUpdatedIndexUrl(): String? {
        val indexFile = File(updateDir, "index.html")
        return if (indexFile.exists()) {
            "file://${indexFile.absolutePath}"
        } else {
            null
        }
    }

    /**
     * Get the locally installed update version.
     */
    fun getLocalVersion(): String {
        return if (versionFile.exists()) {
            versionFile.readText().trim()
        } else {
            "0.0.0"
        }
    }

    // ========== Internal ==========

    private fun fetchRemoteVersion(): JSONObject? {
        val request = Request.Builder()
            .url(UPDATE_URL)
            .get()
            .build()

        return try {
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val body = response.body?.string() ?: return null
                JSONObject(body)
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch remote version: ${e.message}")
            null
        }
    }

    private fun downloadAndApply(downloadUrl: String, version: String) {
        try {
            val request = Request.Builder()
                .url(downloadUrl)
                .get()
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                Log.e(TAG, "Download failed: ${response.code}")
                return
            }

            val zipBytes = response.body?.bytes() ?: return

            // Extract to update directory
            updateDir.deleteRecursively()
            updateDir.mkdirs()

            ZipInputStream(zipBytes.inputStream()).use { zis ->
                var entry = zis.nextEntry
                while (entry != null) {
                    val outFile = File(updateDir, entry.name)

                    // Security: prevent path traversal
                    if (!outFile.canonicalPath.startsWith(updateDir.canonicalPath)) {
                        zis.closeEntry()
                        entry = zis.nextEntry
                        continue
                    }

                    if (entry.isDirectory) {
                        outFile.mkdirs()
                    } else {
                        outFile.parentFile?.mkdirs()
                        FileOutputStream(outFile).use { fos ->
                            zis.copyTo(fos)
                        }
                    }

                    zis.closeEntry()
                    entry = zis.nextEntry
                }
            }

            // Save version
            versionFile.writeText(version)
            Log.i(TAG, "Update applied: $version")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to apply update: ${e.message}")
        }
    }

    private fun isNewer(remote: String, local: String): Boolean {
        val remoteParts = remote.split(".").map { it.toIntOrNull() ?: 0 }
        val localParts = local.split(".").map { it.toIntOrNull() ?: 0 }

        for (i in 0 until maxOf(remoteParts.size, localParts.size)) {
            val r = remoteParts.getOrElse(i) { 0 }
            val l = localParts.getOrElse(i) { 0 }
            if (r > l) return true
            if (r < l) return false
        }
        return false
    }
}
