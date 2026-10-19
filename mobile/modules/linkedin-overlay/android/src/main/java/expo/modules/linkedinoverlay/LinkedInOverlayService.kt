package expo.modules.linkedinoverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.Toast

class LinkedInOverlayService : Service() {

  private var windowManager: WindowManager? = null
  private var overlayView: View? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    startForegroundNotification()
    showOverlay()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return START_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    isRunning = false
    removeOverlay()
  }

  private fun startForegroundNotification() {
    val channelId = "jt_overlay"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "JobTrackr Overlay", NotificationManager.IMPORTANCE_LOW)
      val nm = getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(channel)
      val notification = Notification.Builder(this, channelId)
        .setContentTitle("JobTrackr is ready")
        .setContentText("Open LinkedIn to capture posts")
        .setSmallIcon(android.R.drawable.ic_menu_save)
        .build()
      startForeground(1, notification)
    }
  }

  private fun showOverlay() {
    if (overlayView != null) return
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

    // Simple native button as overlay (avoids needing react-native view inflation)
    val button = Button(this)
    button.text = "Save to JobTrackr"
    button.setBackgroundColor(0xFF2563EB.toInt())
    button.setTextColor(0xFFFFFFFF.toInt())
    button.setPadding(32, 16, 32, 16)

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      else
        WindowManager.LayoutParams.TYPE_PHONE,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      x = 16
      y = 200
    }

    // Drag support
    var initialX = 0
    var initialY = 0
    var initialTouchX = 0f
    var initialTouchY = 0f
    button.setOnTouchListener { v, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = params.x
          initialY = params.y
          initialTouchX = event.rawX
          initialTouchY = event.rawY
          true
        }
        MotionEvent.ACTION_MOVE -> {
          params.x = initialX - (event.rawX - initialTouchX).toInt()
          params.y = initialY + (event.rawY - initialTouchY).toInt()
          windowManager?.updateViewLayout(v, params)
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
        // Emit event to JS via LinkedInOverlayModule
        LinkedInOverlayModule.moduleInstance?.sendEvent(
          "postScraped",
          mapOf("text" to text, "url" to PostStore.latestUrl)
        )
        Toast.makeText(this, "Post captured - check JobTrackr", Toast.LENGTH_SHORT).show()
      }
    }

    windowManager?.addView(button, params)
    overlayView = button
  }

  private fun removeOverlay() {
    overlayView?.let {
      windowManager?.removeView(it)
    }
    overlayView = null
  }

  companion object {
    @Volatile var isRunning = false
  }
}
