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
    removeOverlay()
  }

  private fun startForegroundNotification() {
    val channelId = "jt_overlay"
    val notification: Notification
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "JobTrackr Overlay", NotificationManager.IMPORTANCE_LOW)
      val nm = getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(channel)
      notification = Notification.Builder(this, channelId)
        .setContentTitle("JobTrackr is ready")
        .setContentText("Open LinkedIn to capture posts")
        .setSmallIcon(android.R.drawable.ic_menu_save)
        .build()
    } else {
      notification = Notification.Builder(this)
        .setContentTitle("JobTrackr is ready")
        .setContentText("Open LinkedIn to capture posts")
        .setSmallIcon(android.R.drawable.ic_menu_save)
        .build()
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(1, notification)
    }
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
      val text = PostStore.latestText
      if (text.isBlank()) {
        Toast.makeText(this, "No post detected yet - scroll to a job post first", Toast.LENGTH_SHORT).show()
      } else {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
          button.text = "Saving..."
          val bg = button.background as? GradientDrawable
          try { bg?.setColor(android.graphics.Color.parseColor("#f59e0b")) } catch (_: Exception) {}
        }
        LinkedInOverlayModule.moduleInstance?.sendEvent(
          "postScraped",
          mapOf("text" to text, "url" to PostStore.latestUrl)
        )
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

  companion object {
    @Volatile var isRunning = false
    @Volatile var instance: LinkedInOverlayService? = null

    fun updateOverlay(text: String, colorHex: String) {
      val svc = instance ?: return
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        val v = svc.overlayView as? TextView ?: return@post
        v.text = text
        val bg = v.background as? GradientDrawable
        try { bg?.setColor(android.graphics.Color.parseColor(colorHex)) } catch (_: Exception) {}
      }
    }
  }
}
