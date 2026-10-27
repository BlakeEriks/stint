package dev.stint.surfaces

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build

/** The ongoing notification while a timer runs, with its clock and Stop. */
object Notifications {
  private const val CHANNEL = "timer"
  private const val ID = 4651

  fun draw(context: Context, shown: Shown) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (!shown.running || !manager.areNotificationsEnabled()) {
      manager.cancel(ID)
      return
    }
    manager.notify(ID, build(context, manager, shown))
  }

  private fun build(context: Context, manager: NotificationManager, shown: Shown): Notification {
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        // Low: no sound or peek, since the user started it.
        manager.createNotificationChannel(
          NotificationChannel(
            CHANNEL,
            context.getString(R.string.stint_channel),
            NotificationManager.IMPORTANCE_LOW,
          )
        )
        Notification.Builder(context, CHANNEL)
      } else {
        @Suppress("DEPRECATION") Notification.Builder(context)
      }
    val stop =
      Notification.Action.Builder(
        Icon.createWithResource(context, R.drawable.stint_stop),
        "Stop",
        Surfaces.pressIntent(context, 1),
      )
    // From the lock screen, Stop asks to unlock first: it writes billable time.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) stop.setAuthenticationRequired(true)
    builder
      .setSmallIcon(R.drawable.stint_glyph)
      .setContentTitle(shown.title)
      .setContentText(shown.why ?: shown.detail)
      .setWhen(shown.startedAt)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_STOPWATCH)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(Surfaces.openApp(context))
      .addAction(stop.build())
    if (Build.VERSION.SDK_INT >= 36) {
      // Android 16's Live Updates: a promoted notification's chronometer is
      // the status bar's chip. `Notification.EXTRA_REQUEST_PROMOTED_ONGOING`.
      builder.extras.putBoolean("android.requestPromotedOngoing", true)
    }
    return builder.build()
  }
}
