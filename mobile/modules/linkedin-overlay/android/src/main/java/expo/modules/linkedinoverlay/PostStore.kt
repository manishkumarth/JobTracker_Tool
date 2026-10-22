package expo.modules.linkedinoverlay

object PostStore {
  @Volatile var latestText: String = ""
  @Volatile var latestUrl: String = ""
  // Gmail HR-reply fields
  @Volatile var mode: String = "linkedin" // "linkedin" | "gmail"
  @Volatile var gmailTo: String = ""
  @Volatile var gmailSubject: String = ""
  @Volatile var gmailBody: String = ""
  @Volatile var gmailFrom: String = ""
}
