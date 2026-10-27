package dev.stint.surfaces

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

/** The 4x1 row (`stint_widget_row.xml`). */
class RowWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    Store.shown(context)?.let { Widgets.draw(context, it) }
  }
}

/** The 2x2 square (`stint_widget_square.xml`). */
class SquareWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    Store.shown(context)?.let { Widgets.draw(context, it) }
  }
}

/** Both widget sizes, from one state, in the app's tokens. */
object Widgets {
  fun draw(context: Context, shown: Shown) {
    val manager = AppWidgetManager.getInstance(context)
    for ((provider, layout) in
      listOf(
        RowWidget::class.java to R.layout.stint_widget_row,
        SquareWidget::class.java to R.layout.stint_widget_square,
      )) {
      val ids = manager.getAppWidgetIds(ComponentName(context, provider))
      if (ids.isEmpty()) continue
      manager.updateAppWidget(ids, views(context, layout, shown))
    }
  }

  private fun views(context: Context, layout: Int, s: Shown): RemoteViews {
    val v = RemoteViews(context.packageName, layout)
    val tint = Tint(v, s, Surfaces.dark(context))
    tint.color(R.id.panel, "setColorFilter", "bg-primary")
    tint.color(R.id.panel_edge, "setColorFilter", "border-subtle")
    tint.color(R.id.title, "setTextColor", "text-strong")
    tint.color(R.id.detail, "setTextColor", "text-muted")
    tint.color(R.id.why, "setTextColor", "danger")
    tint.color(R.id.wordmark, "setTextColor", "text-subtle")

    v.setTextViewText(R.id.title, s.title)
    clock(v, s, tint)
    detail(v, s)
    button(context, v, s, tint)
    // A tap off the button opens the app, and signs in when signed out.
    v.setOnClickPendingIntent(R.id.root, Surfaces.openApp(context))
    return v
  }

  private fun clock(v: RemoteViews, s: Shown, tint: Tint) {
    v.setViewVisibility(R.id.live, if (s.running) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.clock, if (s.running) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.idle_clock, if (s.kind == "stopped") View.VISIBLE else View.GONE)
    tint.color(R.id.live, "setColorFilter", "timer-running")
    tint.color(R.id.clock, "setTextColor", "timer-running")
    tint.color(R.id.idle_clock, "setTextColor", "timer-idle")
    if (s.running) {
      // The chronometer counts from a base in elapsed realtime.
      val base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - s.startedAt)
      v.setChronometer(R.id.clock, base, null, true)
    } else {
      v.setChronometer(R.id.clock, SystemClock.elapsedRealtime(), null, false)
    }
  }

  private fun detail(v: RemoteViews, s: Shown) {
    val why = s.why
    v.setViewVisibility(R.id.why, if (why != null) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.detail_row, if (why == null) View.VISIBLE else View.GONE)
    v.setTextViewText(R.id.why, why ?: "")
    v.setTextViewText(R.id.detail, s.detail ?: "")
    val dot = s.color
    v.setViewVisibility(R.id.project_dot, if (dot != null) View.VISIBLE else View.GONE)
    if (dot != null) v.setInt(R.id.project_dot, "setColorFilter", dot)
  }

  private fun button(context: Context, v: RemoteViews, s: Shown, tint: Tint) {
    v.setViewVisibility(R.id.button, if (s.signedOut) View.GONE else View.VISIBLE)
    if (s.signedOut) return
    v.setImageViewResource(R.id.button_glyph, if (s.running) R.drawable.stint_stop else R.drawable.stint_play)
    v.setContentDescription(R.id.button, if (s.running) "Stop" else "Start")
    // Running: Stop is quiet; stopped: Start is the one accent object.
    v.setViewVisibility(R.id.button_edge, if (s.running) View.VISIBLE else View.GONE)
    tint.color(R.id.button_disc, "setColorFilter", if (s.running) "bg-elevated" else "accent-default")
    tint.color(R.id.button_edge, "setColorFilter", "border-default")
    tint.color(R.id.button_glyph, "setColorFilter", if (s.running) "text-primary" else "text-on-accent")
    v.setOnClickPendingIntent(R.id.button, Surfaces.pressIntent(context, 2))
  }

  /**
   * A token's color on a view: from Android 12, both themes, so the widget
   * follows a switch to dark without a redraw; before it, the current one.
   */
  private class Tint(val v: RemoteViews, val s: Shown, val dark: Boolean) {
    fun color(id: Int, method: String, token: String) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        v.setColorInt(id, method, s.token(token, false), s.token(token, true))
      } else {
        v.setInt(id, method, s.token(token, dark))
      }
    }
  }
}
