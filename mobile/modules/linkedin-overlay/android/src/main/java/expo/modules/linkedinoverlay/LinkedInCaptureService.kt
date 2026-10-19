package expo.modules.linkedinoverlay

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Rect
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class LinkedInCaptureService : AccessibilityService() {

  override fun onServiceConnected() {
    super.onServiceConnected()
    serviceInfo = serviceInfo.apply {
      eventTypes = AccessibilityEvent.TYPE_VIEW_SCROLLED or
        AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
        AccessibilityEvent.TYPE_VIEW_CLICKED
      feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
      flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
        AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
      notificationTimeout = 300
    }
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg != "com.linkedin.android") return

    val rootNode = rootInActiveWindow ?: return
    val text = findBestPostText(rootNode) ?: return
    if (text.length >= 80) {
      PostStore.latestText = text
    }
  }

  override fun onInterrupt() {
    instance = null
  }

  override fun onDestroy() {
    super.onDestroy()
    instance = null
  }

  private fun findBestPostText(node: AccessibilityNodeInfo): String? {
    val candidates = ArrayList<Pair<Int, String>>()
    collectTexts(node, candidates)
    return candidates
      .filter { it.second.length in 120..6000 }
      .filterNot { c -> FOOTER_PATTERNS.any { p -> c.second.contains(p, ignoreCase = true) } }
      .maxByOrNull { it.first }
      ?.second
  }

  private fun collectTexts(node: AccessibilityNodeInfo, out: MutableList<Pair<Int, String>>) {
    if (node.childCount == 0) {
      val t = node.text?.toString()
      if (!t.isNullOrBlank()) {
        val rect = Rect()
        node.getBoundsInScreen(rect)
        // lower rect.top = higher priority; invert so topmost visible text wins ties by size
        val priority = 10000 - rect.top.coerceIn(0, 10000)
        out.add(Pair(priority, t))
      }
      return
    }
    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      collectTexts(child, out)
    }
  }

  companion object {
    @Volatile
    var instance: LinkedInCaptureService? = null

    private val FOOTER_PATTERNS = listOf(
      "Accessibility", "Help Center", "Privacy & Terms",
      "Ad Choices", "Business Services", "Get the LinkedIn app",
      "LinkedIn Corporation"
    )
  }
}
