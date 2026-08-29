package com.britney.android

import android.app.Activity
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * OnScreenLogger — displays diagnostic logs on device screen.
 *
 * - Default: HIDDEN (a small "LOG" button at bottom-right toggles it)
 * - Panel is DRAGGABLE by dragging the title bar
 * - Tap "LOG" button to show/hide the panel
 */
class OnScreenLogger(private val activity: Activity) {

    private val handler = Handler(Looper.getMainLooper())
    private val timeFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
    private val logBuffer = StringBuilder()
    private val maxBufferSize = 50000

    private lateinit var textView: TextView
    private lateinit var scrollView: ScrollView
    private lateinit var panelLayout: LinearLayout
    private lateinit var titleBar: TextView
    private lateinit var layoutParams: WindowManager.LayoutParams
    private lateinit var toggleButton: Button
    private lateinit var toggleParams: WindowManager.LayoutParams
    private var panelAdded = false
    private var buttonAdded = false

    fun show() {
        // Create the toggle button (always visible, bottom-right)
        toggleButton = Button(activity).apply {
            text = "LOG"
            textSize = 10f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#CC444444"))
            setPadding(20, 8, 20, 8)
            setOnClickListener {
                togglePanel()
            }
        }

        toggleParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            x = 16
            y = 80
        }

        activity.windowManager.addView(toggleButton, toggleParams)
        buttonAdded = true

        // Create the log panel (hidden by default)
        titleBar = TextView(activity).apply {
            text = "▼ Britney Diagnostics (drag to move, tap to hide)"
            textSize = 11f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#FF1a1a2e"))
            setPadding(24, 12, 24, 12)
        }

        textView = TextView(activity).apply {
            textSize = 10f
            setTextColor(Color.parseColor("#E0E0E0"))
            setBackgroundColor(Color.parseColor("#EE000000"))
            setPadding(24, 12, 24, 16)
            text = "Waiting for logs...\n"
        }

        scrollView = ScrollView(activity).apply {
            addView(textView)
            isVerticalScrollBarEnabled = true
        }

        panelLayout = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            addView(titleBar)
            addView(scrollView)
        }

        layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            dpToPx(260),
            WindowManager.LayoutParams.TYPE_APPLICATION,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP
        }

        // Make title bar draggable
        setupDrag(titleBar)

        // Tap title bar to hide
        titleBar.setOnClickListener {
            togglePanel()
        }

        log("OnScreenLogger", "INFO", "=== OnScreenLogger ready (panel hidden by default) ===")
        log("OnScreenLogger", "INFO", "WebView UA: ${android.webkit.WebSettings.getDefaultUserAgent(activity)}")
        log("OnScreenLogger", "INFO", "Android API: ${android.os.Build.VERSION.SDK_INT} (${android.os.Build.VERSION.RELEASE})")
        log("OnScreenLogger", "INFO", "Device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
    }

    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var isDragging = false

    private fun setupDrag(view: View) {
        view.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = layoutParams.x
                    initialY = layoutParams.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY
                    if (dx * dx + dy * dy > 100) isDragging = true
                    layoutParams.x = initialX + dx.toInt()
                    layoutParams.y = initialY + dy.toInt()
                    layoutParams.gravity = Gravity.TOP or Gravity.START
                    if (panelAdded) {
                        try {
                            activity.windowManager.updateViewLayout(panelLayout, layoutParams)
                        } catch (e: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val wasDragging = isDragging
                    isDragging = false
                    if (wasDragging) {
                        v.performClick()
                        true
                    } else {
                        false
                    }
                }
                else -> false
            }
        }
    }

    fun togglePanel() {
        if (panelAdded) {
            try {
                activity.windowManager.removeView(panelLayout)
            } catch (e: Exception) {}
            panelAdded = false
            toggleButton.text = "LOG"
        } else {
            try {
                activity.windowManager.addView(panelLayout, layoutParams)
                panelAdded = true
                textView.text = logBuffer.toString()
                scrollView.post { scrollView.fullScroll(ScrollView.FOCUS_DOWN) }
                toggleButton.text = "HIDE"
            } catch (e: Exception) {
                Log.e("OnScreenLogger", "Failed to show panel: ${e.message}")
            }
        }
    }

    fun log(tag: String, level: String, message: String) {
        val timestamp = timeFormat.format(Date())
        val line = "[$timestamp] $level/$tag: $message\n"

        handler.post {
            if (logBuffer.length > maxBufferSize) {
                logBuffer.delete(0, logBuffer.length - 25000)
            }
            logBuffer.append(line)
            if (panelAdded) {
                textView.text = logBuffer.toString()
                scrollView.post { scrollView.fullScroll(ScrollView.FOCUS_DOWN) }
            }
        }

        if ((activity.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            when (level.uppercase()) {
                "ERROR" -> Log.e(tag, message)
                "WARN" -> Log.w(tag, message)
                "INFO" -> Log.i(tag, message)
                else -> Log.d(tag, message)
            }
        }
    }

    fun hide() {
        if (panelAdded) {
            try { activity.windowManager.removeView(panelLayout) } catch (e: Exception) {}
            panelAdded = false
        }
        if (buttonAdded) {
            try { activity.windowManager.removeView(toggleButton) } catch (e: Exception) {}
            buttonAdded = false
        }
    }

    private fun dpToPx(dp: Int): Int {
        val density = activity.resources.displayMetrics.density
        return (dp * density).toInt()
    }
}
