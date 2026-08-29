package com.britney.android

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.ValueCallback
import androidx.appcompat.app.AppCompatActivity
import com.britney.android.bridge.BritneyJSBridge
import com.britney.android.update.HotUpdateManager
import java.io.File

class MainActivity : AppCompatActivity() {

    lateinit var webView: WebView
        private set
    lateinit var jsBridge: BritneyJSBridge
        private set
    private lateinit var hotUpdateManager: HotUpdateManager
    lateinit var logger: OnScreenLogger
        private set

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Initialize on-screen logger FIRST so we capture everything
        logger = OnScreenLogger(this)
        logger.show()
        logger.log("BritneyMain", "INFO", "=== Britney app starting ===")

        // 2. Copy bundled PC-side data (companion/diary/memory) on first launch
        try {
            val copied = AssetCopier.copyIfNeeded(this)
            val dataDir = AssetCopier.getDataDir(this)
            logger.log("BritneyMain", "INFO",
                if (copied) "Bundled data copied to ${dataDir.absolutePath}"
                else "Data dir already initialized: ${dataDir.absolutePath}"
            )
            // Log what's in the data dir
            val companionDir = File(dataDir, "companion")
            if (companionDir.exists()) {
                val files = companionDir.listFiles()?.map { it.name } ?: emptyList()
                logger.log("BritneyMain", "INFO", "data/companion/ contains: ${files.joinToString()}")
            }
            val memoryDir = File(dataDir, "memory/archive")
            if (memoryDir.exists()) {
                val subdirs = memoryDir.listFiles()?.filter { it.isDirectory }?.map { it.name } ?: emptyList()
                logger.log("BritneyMain", "INFO", "data/memory/archive/ subdirs: ${subdirs.joinToString()}")
            }
        } catch (e: Exception) {
            logger.log("BritneyMain", "ERROR", "AssetCopier failed: ${e.message}")
        }

        // 3. Create WebView
        webView = WebView(this).also { setContentView(it) }
        logger.log("BritneyMain", "INFO", "WebView created")

        // 4. Setup WebView + bridge
        setupWebView()

        // 5. Load frontend
        loadFrontend()
    }

    private fun setupWebView() {
        try {
            // Enable debugging for Chrome remote inspect
            // Enable debugging only in debug builds (security: prevents USB chrome inspect in release)
            if ((applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                WebView.setWebContentsDebuggingEnabled(true)
            }

            webView.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                // Viewport
                useWideViewPort = true
                loadWithOverviewMode = true
                // Mixed content (for API calls over https from file://)
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            }

            // Add JS bridge
            jsBridge = BritneyJSBridge(this, webView)
            webView.addJavascriptInterface(jsBridge, "britneyBridge")
            logger.log("BritneyMain", "INFO", "Bridge registered as 'britneyBridge'")

            // WebViewClient for error capture
            webView.webViewClient = BritneyWebViewClient(this)

            // WebChromeClient for console.log capture
            webView.webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                    val level = when (message.messageLevel()) {
                        android.webkit.ConsoleMessage.MessageLevel.ERROR -> "ERROR"
                        android.webkit.ConsoleMessage.MessageLevel.WARNING -> "WARN"
                        android.webkit.ConsoleMessage.MessageLevel.DEBUG -> "DEBUG"
                        android.webkit.ConsoleMessage.MessageLevel.LOG -> "INFO"
                        android.webkit.ConsoleMessage.MessageLevel.TIP -> "INFO"
                        else -> "INFO"
                    }
                    logger.log("BritneyJS", level,
                        "${message.message()} @ ${message.sourceId()}:${message.lineNumber()}"
                    )
                    return true
                }
            }

            logger.log("BritneyMain", "INFO", "WebView settings configured")
        } catch (e: Exception) {
            logger.log("BritneyMain", "ERROR", "setupWebView failed: ${e.message}")
        }
    }

    private fun loadFrontend() {
        try {
            // List assets/web/ contents for diagnostics
            val webAssets = assets.list("web") ?: emptyArray()
            logger.log("BritneyMain", "INFO", "assets/web/ contents: ${webAssets.joinToString()}")

            val webAssetsDeep = assets.list("web/assets") ?: emptyArray()
            logger.log("BritneyMain", "INFO", "assets/web/assets/ contents: ${webAssetsDeep.joinToString()}")

            // Verify i18n-resources.js
            val i18nExists = assets.list("web")?.contains("i18n-resources.js") == true
            logger.log("BritneyMain", "INFO", "i18n-resources.js exists: $i18nExists")

            logger.log("BritneyMain", "INFO", ">>> Calling loadUrl('file:///android_asset/web/index.html')")
            webView.loadUrl("file:///android_asset/web/index.html")
        } catch (e: Exception) {
            logger.log("BritneyMain", "ERROR", "loadFrontend failed: ${e.message}")
        }
    }

    fun evaluateJs(script: String) {
        mainHandler.post {
            webView.evaluateJavascript(script, null)
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        try { logger.hide() } catch (e: Exception) {}
        super.onDestroy()
    }
}
