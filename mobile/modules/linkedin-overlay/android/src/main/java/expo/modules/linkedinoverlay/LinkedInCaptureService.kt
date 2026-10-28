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
        AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
        AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
      notificationTimeout = 200
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

  /**
   * Improved Gmail scrape:
   * - Walk all text + contentDescription nodes
   * - Detect From/To by label prefixes and nearby emails
   * - Subject: short line near top, not an email, not a chrome label
   * - Body: longest substantial block excluding chrome/footer
   */
  private fun scrapeGmail(root: AccessibilityNodeInfo) {
    val nodes = ArrayList<NodeInfo>()
    collectRichTexts(root, nodes)

    var subject = ""
    var body = ""
    var to = ""
    var from = ""

    val emails = nodes
      .flatMap { n -> EMAIL_RE.findAll(n.text).map { it.value }.toList() }
      .distinct()

    for (n in nodes) {
      val lower = n.text.lowercase().trim()
      val emailInLine = EMAIL_RE.find(n.text)?.value
      when {
        lower.startsWith("from:") || lower == "from" -> {
          val e = emailInLine ?: findNearbyEmail(nodes, n.top)
          if (!e.isNullOrBlank()) from = e
        }
        lower.startsWith("to:") || lower == "to" || lower.startsWith("to ") -> {
          val e = emailInLine ?: findNearbyEmail(nodes, n.top)
          if (!e.isNullOrBlank()) to = e
        }
        lower.startsWith("subject:") -> {
          val s = n.text.substringAfter(":").trim()
          if (s.length in 2..200) subject = s
        }
      }
    }

    if (from.isBlank() && emails.isNotEmpty()) from = emails.first()
    if (to.isBlank() && emails.size > 1) to = emails[1]

    body = nodes
      .map { it.text.trim() }
      .filter { it.length in 40..20000 }
      .filterNot { t -> CHROME_PATTERNS.any { p -> t.contains(p, ignoreCase = true) } }
      .filterNot { t -> t.lowercase().trim() in setOf("inbox", "sent", "drafts", "spam", "trash") }
      .filterNot { t -> looksLikeUrlOrTracking(t) }
      .distinct()
      .maxByOrNull { readabilityScore(it) } ?: ""

    if (subject.isBlank()) {
      subject = nodes
        .filter { it.top < 900 }
        .map { it.text.trim() }
        .filter { it.length in 5..180 }
        .filterNot { EMAIL_RE.containsMatchIn(it) }
        .filterNot { t -> CHROME_PATTERNS.any { p -> t.contains(p, ignoreCase = true) } }
        .filterNot { t -> looksLikeUrlOrTracking(t) }
        .filterNot { t ->
          val l = t.lowercase()
          l.startsWith("from") || l.startsWith("to") || l.startsWith("cc") || l.startsWith("date")
        }
        .firstOrNull() ?: ""
    }

    if (body.isNotBlank()) PostStore.gmailBody = body else PostStore.gmailBody = ""
    if (subject.isNotBlank()) PostStore.gmailSubject = subject
    if (to.isNotBlank()) PostStore.gmailTo = to
    if (from.isNotBlank()) PostStore.gmailFrom = from

    val combined = listOf(
      if (from.isNotBlank()) "From: $from" else "",
      if (to.isNotBlank()) "To: $to" else "",
      if (subject.isNotBlank()) "Subject: $subject" else "",
      body
    ).filter { it.isNotBlank() }.joinToString("\n\n")

    if (combined.isNotBlank()) PostStore.latestText = combined
  }

  private fun findNearbyEmail(nodes: List<NodeInfo>, top: Int): String? {
    return nodes
      .filter { kotlin.math.abs(it.top - top) < 120 }
      .flatMap { n -> EMAIL_RE.findAll(n.text).map { it.value }.toList() }
      .firstOrNull()
  }

  private fun findBestPostText(node: AccessibilityNodeInfo): String? {
    val candidates = ArrayList<Pair<Int, String>>()
    collectTexts(node, candidates)
    return candidates
      .filter { it.second.length in 120..6000 }
      .filterNot { c -> CHROME_PATTERNS.any { p -> c.second.contains(p, ignoreCase = true) } }
      .filterNot { c -> looksLikeUrlOrTracking(c.second) }
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

  private data class NodeInfo(val text: String, val top: Int, val height: Int)

  private fun collectRichTexts(node: AccessibilityNodeInfo, out: MutableList<NodeInfo>) {
    val t = node.text?.toString()
    val cd = node.contentDescription?.toString()
    val rect = Rect()
    node.getBoundsInScreen(rect)
    if (!t.isNullOrBlank()) {
      out.add(NodeInfo(t, rect.top, rect.height()))
    }
    if (!cd.isNullOrBlank() && cd != t) {
      out.add(NodeInfo(cd, rect.top, rect.height()))
    }
    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      collectRichTexts(child, out)
    }
  }

  /**
   * Gmail often includes tracking/redirect URLs (Naukri, LinkedIn, etc.) as visible
   * text. Those are usually the longest text node, so they must be rejected before
   * choosing the reply body.
   */
  private fun looksLikeUrlOrTracking(text: String): Boolean {
    val t = text.trim()
    if (t.isEmpty()) return true
    val lower = t.lowercase()
    if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("www.")) return true
    if (TRACKING_MARKERS.any { lower.contains(it) }) return true
    val escapes = PERCENT_ESCAPE_RE.findAll(t).count()
    if (escapes >= 6) return true
    if (escapes >= 3 && escapes * 100 / t.length > 2) return true

    val url = URL_RE.find(t)
    if (url != null && url.value.length >= (t.length * 0.6).toInt()) return true

    val spaces = t.count { it.isWhitespace() }
    if (spaces == 0 && t.length > 40) return true
    if (spaces > 0) {
      val words = t.split(Regex("\\s+")).filter { it.isNotBlank() }
      val avgWordLength = t.length.toDouble() / words.size.coerceAtLeast(1)
      if (avgWordLength > 40) return true
    }
    return false
  }

  private fun readabilityScore(text: String): Int {
    val letters = text.count { it.isLetter() }
    val spaces = text.count { it.isWhitespace() }
    val percent = text.count { it == '%' }
    val symbols = text.count { it == '=' || it == '/' || it == '?' || it == '&' }
    return letters + spaces * 3 - percent * 10 - symbols * 2
  }

  companion object {
    @Volatile
    var instance: LinkedInCaptureService? = null

    private val EMAIL_RE = Regex("[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}")
    private val URL_RE = Regex("(?i)\\b(?:https?://|www\\.)\\S+")
    private val PERCENT_ESCAPE_RE = Regex("%[0-9A-Fa-f]{2}")

    private val TRACKING_MARKERS = listOf(
      "uba?data=", "data=%7b", "communicationid", "encemail", "encrecipientid",
      "recipientid", "mailerid", "eventcode", "unsubscribe", "utm_", "clicktrack", "openrate",
      "you are receiving", "view in browser", "manage preferences", "email preferences",
      "download the app", "download app", "follow us", "privacy policy", "terms of use",
      "this email was sent to"
    )

    private val CHROME_PATTERNS = listOf(
      "Accessibility", "Help Center", "Privacy & Terms",
      "Ad Choices", "Business Services", "Get the LinkedIn app",
      "LinkedIn Corporation", "Google Account", "Search in mail",
      "Compose", "Labels", "Settings", "Archive", "Delete",
      "Mark as unread", "Move to", "Snooze", "Reply all",
      "Add-ons", "Print all", "Show original", "Report spam",
      "Inbox", "Starred", "Important", "Sent", "Drafts",
      "All mail", "Spam", "Trash", "Categories", "Social",
      "Promotions", "Updates", "Forums", "Hangouts"
    )
  }
}
