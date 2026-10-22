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
        AccessibilityEvent.TYPE_VIEW_CLICKED or
        AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
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

    when (pkg) {
      "com.linkedin.android" -> {
        PostStore.mode = "linkedin"
        val rootNode = rootInActiveWindow ?: return
        val text = findBestPostText(rootNode) ?: return
        if (text.length >= 80) {
          PostStore.latestText = text
        }
        LinkedInOverlayService.instance?.updateModeUI("linkedin")
      }
      "com.google.android.gm", "com.google.android.gm.lite" -> {
        PostStore.mode = "gmail"
        val rootNode = rootInActiveWindow ?: return
        scrapeGmail(rootNode)
        LinkedInOverlayService.instance?.updateModeUI("gmail")
      }
    }
  }

  override fun onInterrupt() {
    instance = null
  }

  override fun onDestroy() {
    super.onDestroy()
    instance = null
  }

  private fun scrapeGmail(root: AccessibilityNodeInfo) {
    // Collect all visible text nodes with their bounds for heuristics
    val nodes = ArrayList<Triple<String, Int, Int>>() // text, top, height
    collectAllTexts(root, nodes)

    // Heuristic: subject often short and near top; body is the longest block;
    // email addresses appear as "to" / "from"
    var subject = ""
    var body = ""
    var to = ""
    var from = ""

    val emails = nodes.map { it.first }.flatMap { t ->
      EMAIL_RE.findAll(t).map { it.value }.toList()
    }.distinct()

    if (emails.isNotEmpty()) {
      // Prefer first as "from" (sender) in open conversation
      from = emails.firstOrNull() ?: ""
      to = emails.getOrNull(1) ?: emails.firstOrNull() ?: ""
    }

    // Longest text block as body
    body = nodes
      .map { it.first }
      .filter { it.length in 40..15000 }
      .filterNot { FOOTER_PATTERNS.any { p -> it.contains(p, ignoreCase = true) } }
      .maxByOrNull { it.length } ?: ""

    // Subject: shorter line near the top that isn't an email
    subject = nodes
      .filter { it.second < 800 } // upper part of screen
      .map { it.first.trim() }
      .filter { it.length in 5..180 }
      .filterNot { EMAIL_RE.containsMatchIn(it) }
      .filterNot { FOOTER_PATTERNS.any { p -> it.contains(p, ignoreCase = true) } }
      .firstOrNull() ?: ""

    if (body.isNotBlank()) PostStore.gmailBody = body
    if (subject.isNotBlank()) PostStore.gmailSubject = subject
    if (to.isNotBlank()) PostStore.gmailTo = to
    if (from.isNotBlank()) PostStore.gmailFrom = from
    // Also put combined text for fallback
    PostStore.latestText = listOf(
      if (from.isNotBlank()) "From: $from" else "",
      if (to.isNotBlank()) "To: $to" else "",
      if (subject.isNotBlank()) "Subject: $subject" else "",
      body
    ).filter { it.isNotBlank() }.joinToString("\n\n")
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

  private fun collectAllTexts(node: AccessibilityNodeInfo, out: MutableList<Triple<String, Int, Int>>) {
    val t = node.text?.toString()
    if (!t.isNullOrBlank()) {
      val rect = Rect()
      node.getBoundsInScreen(rect)
      out.add(Triple(t, rect.top, rect.height()))
    }
    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      collectAllTexts(child, out)
    }
  }

  companion object {
    @Volatile
    var instance: LinkedInCaptureService? = null

    private val EMAIL_RE = Regex("[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}")

    private val FOOTER_PATTERNS = listOf(
      "Accessibility", "Help Center", "Privacy & Terms",
      "Ad Choices", "Business Services", "Get the LinkedIn app",
      "LinkedIn Corporation", "Google", "Gmail", "Inbox",
      "Compose", "Search", "Labels", "Settings"
    )
  }
}
