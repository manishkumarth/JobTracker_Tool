package expo.modules.linkedinoverlay

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LinkedInOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LinkedInOverlay")

    Events("postScraped", "captureStatus")

    AsyncFunction("startCapture") {
      val context = appContext.reactContext ?: return@AsyncFunction false

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          android.net.Uri.parse("package:" + context.packageName)
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        sendEvent("captureStatus", mapOf("status" to "needsOverlayPermission"))
        return@AsyncFunction false
      }

      val serviceIntent = Intent(context, LinkedInOverlayService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }

      val accessibilityEnabled = LinkedInCaptureService.instance != null
      sendEvent(
        "captureStatus",
        mapOf(
          "status" to "started",
          "accessibilityEnabled" to accessibilityEnabled
        )
      )
      return@AsyncFunction true
    }

    AsyncFunction("stopCapture") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val serviceIntent = Intent(context, LinkedInOverlayService::class.java)
      context.stopService(serviceIntent)
      sendEvent("captureStatus", mapOf("status" to "stopped"))
      return@AsyncFunction true
    }

    AsyncFunction("isCaptureActive") {
      return@AsyncFunction LinkedInOverlayService.isRunning
    }
  }

  companion object {
    @Volatile
    var moduleInstance: LinkedInOverlayModule? = null
  }

  override fun onCreate(context: Context) {
    super.onCreate(context)
    moduleInstance = this
  }

  override fun onDestroy() {
    super.onDestroy()
    moduleInstance = null
  }
}
