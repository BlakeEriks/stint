package dev.stint.surfaces

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build

/**
 * The app icon's long-press shortcut: Stop, or Start with its task. It opens
 * the app at `stint://press/<action>`, which presses there (`app.tsx`).
 */
object Shortcuts {
  private const val PREFS = "stint_shortcuts"

  fun draw(context: Context, shown: Shown) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return
    val label = shown.shortcut
    // Android rate-limits shortcut updates from the background: only a change.
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (prefs.getString("label", null) == label && prefs.contains("label")) return
    val manager = context.getSystemService(ShortcutManager::class.java) ?: return
    if (label == null) {
      manager.removeAllDynamicShortcuts()
    } else {
      val action = if (shown.running) "stop" else "start"
      val intent =
        Intent(Intent.ACTION_VIEW, Uri.parse("stint://press/$action"))
          .setPackage(context.packageName)
      val info =
        ShortcutInfo.Builder(context, "press")
          .setShortLabel(if (shown.running) "Stop" else "Start")
          .setLongLabel(label)
          .setIcon(Icon.createWithResource(context, R.drawable.stint_glyph))
          .setIntent(intent)
          .build()
      if (!manager.setDynamicShortcuts(listOf(info))) return
    }
    prefs.edit().putString("label", label).apply()
  }
}
