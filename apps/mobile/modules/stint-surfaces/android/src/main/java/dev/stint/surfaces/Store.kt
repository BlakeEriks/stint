package dev.stint.surfaces

import android.content.Context
import android.graphics.Color
import org.json.JSONObject

/**
 * What every surface shows, as JS last decided it (`SurfaceState` in
 * `src/surfaces.ts`), and a press's prediction over it until JS answers.
 * Kept on disk so a widget redrawn after a reboot still shows it.
 */
object Store {
  private const val PREFS = "stint_surfaces"
  private const val STATE = "state"
  private const val PRESSED_AT = "pressedAt"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** A new state from JS ends any prediction; `kept` only adds its reason. */
  fun save(context: Context, json: String) {
    val incoming = JSONObject(json)
    val next =
      if (incoming.optString("kind") == "kept") {
        val stored = prefs(context).getString(STATE, null) ?: return clearPress(context)
        JSONObject(stored).put("why", incoming.optString("why"))
      } else {
        incoming
      }
    prefs(context).edit().putString(STATE, next.toString()).remove(PRESSED_AT).apply()
  }

  /**
   * A press shows its result at once (Constitution VI). A second press before
   * JS answers takes the first back, since the two cancel out.
   */
  fun press(context: Context) {
    val p = prefs(context)
    if (p.contains(PRESSED_AT)) {
      p.edit().remove(PRESSED_AT).apply()
    } else {
      p.edit().putLong(PRESSED_AT, System.currentTimeMillis()).apply()
    }
  }

  private fun clearPress(context: Context) {
    prefs(context).edit().remove(PRESSED_AT).apply()
  }

  /** What to draw now: the prediction when a press is pending, else the state. */
  fun shown(context: Context): Shown? {
    val p = prefs(context)
    val json = p.getString(STATE, null) ?: return null
    val state = JSONObject(json)
    val colors = state.optJSONObject("colors")
    val pressedAt = p.getLong(PRESSED_AT, 0L)
    val pressed = state.optJSONObject("pressed")
    return if (pressedAt > 0 && pressed != null) {
      Shown.from(pressed, colors, pressedAt)
    } else {
      Shown.from(state, colors, null)
    }
  }
}

/** One state, read for drawing. */
data class Shown(
  val kind: String,
  val title: String,
  val detail: String?,
  val color: Int?,
  val startedAt: Long,
  val why: String?,
  val tile: String,
  val shortcut: String?,
  val nextTask: String,
  val nextProject: String?,
  private val colors: JSONObject?,
) {
  val running get() = kind == "running"
  val signedOut get() = kind == "signedOut"

  /** A design token's color in the given theme. */
  fun token(name: String, dark: Boolean): Int {
    val hex = colors?.optJSONObject(if (dark) "dark" else "light")?.optString(name)
    return parse(hex) ?: Color.GRAY
  }

  companion object {
    fun from(o: JSONObject, colors: JSONObject?, pressedAt: Long?): Shown {
      val next = o.optJSONObject("next")
      return Shown(
        kind = o.optString("kind"),
        title = o.optString("title"),
        detail = text(o, "detail"),
        color = parse(text(o, "color")),
        // A predicted start counts from the press.
        startedAt = pressedAt ?: o.optLong("startedAt"),
        why = text(o, "why"),
        tile = o.optString("tile"),
        shortcut = text(o, "shortcut"),
        nextTask = next?.optString("taskName") ?: "",
        nextProject = next?.let { text(it, "projectId") },
        colors = colors,
      )
    }

    private fun text(o: JSONObject, key: String): String? =
      if (o.isNull(key)) null else o.optString(key)

    private fun parse(hex: String?): Int? =
      try {
        if (hex.isNullOrEmpty()) null else Color.parseColor(hex)
      } catch (e: IllegalArgumentException) {
        null
      }
  }
}
