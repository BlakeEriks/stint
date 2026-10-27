package dev.stint.surfaces

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build

/** The app icon's long-press shortcut: Stop, or Start with its task (`PressActivity`). */
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
        Intent(context, PressActivity::class.java)
          .setAction(Intent.ACTION_VIEW)
          .putExtra(PressActivity.EXTRA_ACTION, action)
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
