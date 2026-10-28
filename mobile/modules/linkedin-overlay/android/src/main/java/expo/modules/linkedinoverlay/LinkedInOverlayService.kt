package expo.modules.linkedinoverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast

class LinkedInOverlayService : Service() {

  private var windowManager: WindowManager? = null
  var overlayView: View? = null
  private var statusView: TextView? = null
  private var statusHandler: android.os.Handler? = null
  private var statusHideRunnable: Runnable? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    instance = this
    startForegroundNotification()
    showOverlay()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return START_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    isRunning = false
    instance = null
    removeStatusBanner()
    removeOverlay()
  }

  private fun startForegroundNotification() {
    val notification = buildNotification("Open LinkedIn or Gmail — button adapts")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(text: String): Notification {
    val channelId = CHANNEL_ID
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        channelId,
        "JobTrackr Overlay",
        NotificationManager.IMPORTANCE_LOW
      )
      channel.description = "Shows what JobTrackr is doing while capture is running"
      val nm = getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(channel)
      return Notification.Builder(this, channelId)
        .setContentTitle("JobTrackr")
        .setContentText(text)
        .setSmallIcon(android.R.drawable.ic_menu_save)
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .build()
    }
    return Notification.Builder(this)
      .setContentTitle("JobTrackr")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_save)
      .setOnlyAlertOnce(true)
      .setOngoing(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .build()
  }

  /**
   * Keep the foreground notification in sync with the floating pill so the user
   * can see save/send progress from the notification shade without opening the app.
   */
  fun updateNotification(text: String) {
    try {
      val nm = getSystemService(NotificationManager::class.java)
      nm.notify(NOTIFICATION_ID, buildNotification(text))
    } catch (_: Exception) {
    }
  }

  /**
   * Temporary banner at the top of the screen (over LinkedIn/Gmail) so the user
   * sees save/send progress without opening JobTrackr or the notification shade.
   */
  fun showStatusBanner(text: String, colorHex: String) {
    android.os.Handler(android.os.Looper.getMainLooper()).post {
      val wm = windowManager ?: (getSystemService(WINDOW_SERVICE) as WindowManager)
      if (wm == null) return@post

      statusHandler?.let { h -> statusHideRunnable?.let { h.removeCallbacks(it) } }

      if (statusView == null) {
        val tv = TextView(this)
        tv.setTextColor(Color.WHITE)
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        tv.setPadding(dp(16), dp(10), dp(16), dp(10))
        tv.elevation = dp(6).toFloat()
        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
          else
            WindowManager.LayoutParams.TYPE_PHONE,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
          PixelFormat.TRANSLUCENT
        ).apply {
          gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
          y = dp(48)
        }
        try {
          wm.addView(tv, params)
          statusView = tv
        } catch (_: Exception) {
          return@post
        }
      }

      val v = statusView ?: return@post
      v.text = text
      val bg = GradientDrawable()
      try {
        bg.setColor(Color.parseColor(colorHex))
      } catch (_: Exception) {
        bg.setColor(Color.parseColor("#2563EB"))
      }
      bg.cornerRadius = dp(18).toFloat()
      bg.setStroke(dp(1), Color.WHITE)
      v.background = bg

      val handler = android.os.Handler(android.os.Looper.getMainLooper())
      statusHandler = handler
      statusHideRunnable = Runnable { removeStatusBanner() }
      statusHideRunnable?.let { handler.postDelayed(it, 3500) }
    }
  }

  private fun removeStatusBanner() {
    statusHandler?.removeCallbacksAndMessages(null)
    statusHandler = null
    statusHideRunnable = null
    statusView?.let {
      try {
        windowManager?.removeView(it)
      } catch (_: Exception) {
      }
    }
    statusView = null
  }

  private fun showOverlay() {
    if (overlayView != null) return
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

    // A clearly visible rounded pill button as overlay
    val button = TextView(this)
    button.text = "Save to JobTrackr"
    button.setTextColor(Color.WHITE)
    button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
    button.setPadding(dp(20), dp(12), dp(20), dp(12))

    val bg = GradientDrawable()
    bg.setColor(Color.parseColor("#2563EB"))
    bg.cornerRadius = dp(24).toFloat()
    bg.setStroke(dp(2), Color.WHITE)
    button.background = bg

    button.elevation = dp(8).toFloat()

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      WindowManager.LayoutParams.TYPE_PHONE

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = dp(16)
      y = dp(160)
    }

    // Drag support
    var initialX = 0
    var initialY = 0
    var initialTouchX = 0f
    var initialTouchY = 0f
    var dragged = false
    button.setOnTouchListener { v, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = params.x
          initialY = params.y
          initialTouchX = event.rawX
          initialTouchY = event.rawY
          dragged = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - initialTouchX).toInt()
          val dy = (event.rawY - initialTouchY).toInt()
          if (Math.abs(dx) > dp(6) || Math.abs(dy) > dp(6)) dragged = true
          params.x = initialX + dx
          params.y = initialY + dy
          windowManager?.updateViewLayout(v, params)
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!dragged) v.performClick()
          true
        }
        else -> false
      }
    }

    button.setOnClickListener {
      // Snapshot store so further scrolling does not race this capture
      val mode = PostStore.mode
      if (mode == "gmail") {
        val body = PostStore.gmailBody.ifBlank { PostStore.latestText }
        val to = PostStore.gmailTo
        val from = PostStore.gmailFrom
        val subject = PostStore.gmailSubject
        if (body.isBlank()) {
          Toast.makeText(this, "No email detected yet - open an email in Gmail first", Toast.LENGTH_SHORT).show()
        } else {
          // Optimistic busy state; JS queue may override to "Queued (N)"
          android.os.Handler(android.os.Looper.getMainLooper()).post {
            val current = (overlayView as? TextView)?.text?.toString() ?: ""
            if (current.startsWith("Saving") || current.startsWith("Processing") || current.startsWith("Sending") || current.startsWith("Generating") || current.startsWith("Drafting")) {
              button.text = "Queued…"
              val bg = button.background as? GradientDrawable
              try { bg?.setColor(android.graphics.Color.parseColor("#7c3aed")) } catch (_: Exception) {}
              showStatusBanner("Queued…", "#7c3aed")
            } else {
              button.text = "Processing…"
              val bg = button.background as? GradientDrawable
              try { bg?.setColor(android.graphics.Color.parseColor("#f59e0b")) } catch (_: Exception) {}
              showStatusBanner("Gmail: processing…", "#f59e0b")
            }
          }
          LinkedInOverlayModule.moduleInstance?.sendEvent(
            "postScraped",
            mapOf(
              "mode" to "gmail",
              "text" to body,
              "to" to to,
              "from" to from,
              "subject" to subject,
              "body" to body,
              "url" to ""
            )
          )
        }
      } else {
        val text = PostStore.latestText
        val url = PostStore.latestUrl
        if (text.isBlank()) {
          Toast.makeText(this, "No post detected yet - scroll to a job post first", Toast.LENGTH_SHORT).show()
        } else {
          android.os.Handler(android.os.Looper.getMainLooper()).post {
            val current = (overlayView as? TextView)?.text?.toString() ?: ""
            if (current.startsWith("Saving") || current.startsWith("Processing") || current.startsWith("Sending") || current.startsWith("Generating") || current.startsWith("Drafting")) {
              button.text = "Queued…"
              val bg = button.background as? GradientDrawable
              try { bg?.setColor(android.graphics.Color.parseColor("#7c3aed")) } catch (_: Exception) {}
              showStatusBanner("Queued…", "#7c3aed")
            } else {
              button.text = "Saving…"
              val bg = button.background as? GradientDrawable
              try { bg?.setColor(android.graphics.Color.parseColor("#f59e0b")) } catch (_: Exception) {}
              showStatusBanner("Saving job…", "#f59e0b")
            }
          }
          LinkedInOverlayModule.moduleInstance?.sendEvent(
            "postScraped",
            mapOf(
              "mode" to "linkedin",
              "text" to text,
              "url" to url
            )
          )
        }
      }
    }

    try {
      windowManager?.addView(button, params)
      overlayView = button
    } catch (e: Exception) {
      Toast.makeText(this, "Overlay failed: " + (e.message ?: "unknown"), Toast.LENGTH_LONG).show()
    }
  }

  private fun dp(value: Int): Int {
    return Math.round(value * resources.displayMetrics.density)
  }

  private fun removeOverlay() {
    overlayView?.let {
      try {
        windowManager?.removeView(it)
      } catch (_: Exception) {
      }
    }
    overlayView = null
  }

  fun updateModeUI(mode: String) {
    android.os.Handler(android.os.Looper.getMainLooper()).post {
      val v = overlayView as? TextView ?: return@post
      if (mode == "gmail") {
        v.text = "HR Reply (Gmail)"
        val bg = v.background as? GradientDrawable
        try { bg?.setColor(android.graphics.Color.parseColor("#EA4335")) } catch (_: Exception) {}
      } else {
        v.text = "Save to JobTrackr"
        val bg = v.background as? GradientDrawable
        try { bg?.setColor(android.graphics.Color.parseColor("#2563EB")) } catch (_: Exception) {}
      }
    }
  }

  companion object {
    @Volatile var isRunning = false
    @Volatile var instance: LinkedInOverlayService? = null

    private const val NOTIFICATION_ID = 1
    private const val CHANNEL_ID = "jt_overlay"

    fun updateOverlay(text: String, colorHex: String) {
      val svc = instance ?: return
      svc.updateNotification(text)
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        val v = svc.overlayView as? TextView ?: return@post
        v.text = text
        val bg = v.background as? GradientDrawable
        try { bg?.setColor(android.graphics.Color.parseColor(colorHex)) } catch (_: Exception) {}
      }
      // Do not show the top banner for the idle labels; only for real progress.
      val isIdle = text == "Save to JobTrackr" || text == "HR Reply (Gmail)"
      if (!isIdle) {
        svc.showStatusBanner(text, colorHex)
      }
    }
  }
}
