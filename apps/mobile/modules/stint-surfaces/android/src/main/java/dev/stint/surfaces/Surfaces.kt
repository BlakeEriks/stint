package dev.stint.surfaces

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Configuration

/** Draws every surface from the stored state (`Store`). */
object Surfaces {
  fun draw(context: Context) {
    val shown = Store.shown(context) ?: return
    Notifications.draw(context, shown)
    Widgets.draw(context, shown)
    Shortcuts.draw(context, shown)
  }

  fun dark(context: Context) =
    (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
      Configuration.UI_MODE_NIGHT_YES

  /** Opens the app, as a tap on a surface that has no press does. */
  fun openApp(context: Context): PendingIntent {
    val launch =
      context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent().setPackage(context.packageName)
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** A press from a widget or the notification, through `PressReceiver`. */
  fun pressIntent(context: Context, requestCode: Int): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      requestCode,
      Intent(context, PressReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
