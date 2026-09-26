package com.britney.android

import android.content.Context
import java.io.File

/**
 * AssetCopier — copies bundled data from assets/data/ to filesDir/data/ on first launch.
 *
 * On subsequent launches, the copy is skipped (marker file `.assets-copied` exists).
 * This gives the Android app the same companion/diary/memory data the PC Electron app
 * has in its data/ directory.
 */
object AssetCopier {

    private const val MARKER_FILE = ".assets-copied"
    private const val SOURCE_DIR = "data"
    private const val DEST_DIR = "data"

    /**
     * Copy assets/data/ → filesDir/data/ if not already done.
     * Returns true if a copy was performed, false if skipped.
     */
    fun copyIfNeeded(context: Context): Boolean {
        val destDir = File(context.filesDir, DEST_DIR)
        val marker = File(destDir, MARKER_FILE)

        if (marker.exists()) {
            return false
        }

        destDir.mkdirs()
        copyAssetDir(context, SOURCE_DIR, destDir)

        // Write marker
        marker.writeText(System.currentTimeMillis().toString())
        return true
    }

    /**
     * Force re-copy (used by settings → "restore defaults").
     */
    fun forceCopy(context: Context) {
        val destDir = File(context.filesDir, DEST_DIR)
        if (destDir.exists()) {
            destDir.deleteRecursively()
        }
        destDir.mkdirs()
        copyAssetDir(context, SOURCE_DIR, destDir)
        File(destDir, MARKER_FILE).writeText(System.currentTimeMillis().toString())
    }

    private fun copyAssetDir(context: Context, assetPath: String, destDir: File) {
        val files = context.assets.list(assetPath) ?: return
        if (files.isEmpty()) {
            // It's a file, not a directory
            copyAssetFile(context, assetPath, destDir)
            return
        }
        for (name in files) {
            val childAssetPath = "$assetPath/$name"
            val childDest = File(destDir, name)
            val childFiles = context.assets.list(childAssetPath)
            if (childFiles != null && childFiles.isNotEmpty()) {
                childDest.mkdirs()
                copyAssetDir(context, childAssetPath, childDest)
            } else {
                copyAssetFile(context, childAssetPath, destDir)
            }
        }
    }

    private fun copyAssetFile(context: Context, assetPath: String, destDir: File) {
        val fileName = assetPath.substringAfterLast('/')
        val destFile = File(destDir, fileName)
        try {
            context.assets.open(assetPath).use { input ->
                destFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
        } catch (e: Exception) {
            android.util.Log.w("AssetCopier", "Failed to copy asset: $assetPath — ${e.message}")
        }
    }

    /**
     * Get the data directory path (filesDir/data/).
     */
    fun getDataDir(context: Context): File {
        return File(context.filesDir, DEST_DIR)
    }
}
