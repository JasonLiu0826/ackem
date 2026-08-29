package com.britney.android

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.File
import java.io.FileInputStream

/**
 * WebViewClient for Britney Android.
 * Captures ALL resource load errors and logs them to OnScreenLogger.
 */
class BritneyWebViewClient(private val activity: MainActivity) : WebViewClient() {

    private val shimScript: String by lazy {
        activity.assets.open("web/britney-shim.js").bufferedReader().use { it.readText() }
    }

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest
    ): WebResourceResponse? {
        val url = request.url.toString()

        if (!url.startsWith("file:///android_asset/web/")) {
            return super.shouldInterceptRequest(view, request)
        }

        val assetPath = url.removePrefix("file:///android_asset/web/")

        if (assetPath.endsWith(".html")) {
            return super.shouldInterceptRequest(view, request)
        }

        val updatedFile = File(activity.filesDir, "web_update/$assetPath")
        if (updatedFile.exists()) {
            return try {
                val mimeType = getMimeType(assetPath)
                WebResourceResponse(mimeType, "utf-8", FileInputStream(updatedFile))
            } catch (e: Exception) {
                activity.logger.log("BritneyWebView", "ERROR", "Hot update read failed for $assetPath: ${e.message}")
                super.shouldInterceptRequest(view, request)
            }
        }

        return super.shouldInterceptRequest(view, request)
    }

    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
        super.onPageStarted(view, url, favicon)
        activity.logger.log("BritneyWebView", "INFO", ">>> onPageStarted: $url")
        if (url != null && !url.startsWith("file:///android_asset/")) {
            view?.evaluateJavascript(shimScript, null)
        }
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        activity.logger.log("BritneyWebView", "INFO", ">>> onPageFinished: $url")
    }

    override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: android.webkit.WebResourceError?
    ) {
        super.onReceivedError(view, request, error)
        val url = request?.url?.toString() ?: "(unknown)"
        val isMainResource = request?.isForMainFrame() == true
        activity.logger.log(
            "BritneyWebView",
            "ERROR",
            "onReceivedError [mainFrame=$isMainResource] $url: ${error?.errorCode} - ${error?.description}"
        )
    }

    override fun onReceivedHttpError(
        view: WebView?,
        request: WebResourceRequest?,
        errorResponse: WebResourceResponse?
    ) {
        super.onReceivedHttpError(view, request, errorResponse)
        val url = request?.url?.toString() ?: "(unknown)"
        activity.logger.log(
            "BritneyWebView",
            "ERROR",
            "onReceivedHttpError $url: ${errorResponse?.statusCode} - ${errorResponse?.reasonPhrase}"
        )
    }

    private fun getMimeType(path: String): String {
        return when {
            path.endsWith(".html") -> "text/html"
            path.endsWith(".js") -> "application/javascript"
            path.endsWith(".css") -> "text/css"
            path.endsWith(".json") -> "application/json"
            path.endsWith(".png") -> "image/png"
            path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
            path.endsWith(".svg") -> "image/svg+xml"
            path.endsWith(".woff2") -> "font/woff2"
            path.endsWith(".woff") -> "font/woff"
            else -> "application/octet-stream"
        }
    }
}
