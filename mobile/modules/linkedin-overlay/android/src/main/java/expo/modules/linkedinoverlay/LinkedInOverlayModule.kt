package expo.modules.linkedinoverlay

import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LinkedInOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LinkedInOverlay")

    Events("postScraped", "captureStatus")

    OnCreate {
      moduleInstance = this@LinkedInOverlayModule
    }

    OnDestroy {
      moduleInstance = null
    }

    Function("hasOverlayPermission") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(context)
      } else {
        true
      }
    }

    Function("isAccessibilityEnabled") {
      LinkedInCaptureService.instance != null
    }

    AsyncFunction("openOverlaySettings") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        // Try package-specific screen first
        var opened = false
        try {
          val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:" + context.packageName)
          )
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          opened = true
        } catch (_: Exception) { opened = false }
        // Fallback to global overlay settings list
        if (!opened) {
          try {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            opened = true
          } catch (_: Exception) { opened = false }
        }
        // Last resort: app details settings
        if (!opened) {
          try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
              android.net.Uri.parse("package:" + context.packageName))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
          } catch (_: Exception) {}
        }
      }
      return@AsyncFunction true
    }

    AsyncFunction("openAccessibilitySettings") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      return@AsyncFunction true
    }

    AsyncFunction("startCapture") {
      val context = appContext.reactContext ?: return@AsyncFunction false

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          android.net.Uri.parse("package:" + context.packageName)
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        sendEvent(
          "captureStatus",
          mapOf(
            "status" to "needsOverlayPermission",
            "accessibilityEnabled" to (LinkedInCaptureService.instance != null)
          )
        )
        return@AsyncFunction false
      }

      val serviceIntent = Intent(context, LinkedInOverlayService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(serviceIntent)
        } else {
          context.startService(serviceIntent)
        }
      } catch (e: Exception) {
        sendEvent("captureStatus", mapOf("status" to "error", "message" to (e.message ?: "Could not start overlay")))
        return@AsyncFunction false
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

    Function("setOverlayStatus") { text: String, color: String ->
      LinkedInOverlayService.updateOverlay(text, color)
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
}
