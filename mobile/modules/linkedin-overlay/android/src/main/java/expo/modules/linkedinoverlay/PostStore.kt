package expo.modules.linkedinoverlay

object PostStore {
  @Volatile var latestText: String = ""
  @Volatile var latestUrl: String = ""
}
