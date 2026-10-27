package dev.stint.surfaces

import android.annotation.SuppressLint
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** The Quick Settings tile: on while a timer runs; a tap stops or starts it. */
class TimerTileService : TileService() {
  override fun onStartListening() {
    show()
  }

  override fun onClick() {
    val shown = Store.shown(this)
    if (shown == null || shown.signedOut) {
      openApp()
      return
    }
    // From the lock screen, unlock first: it writes billable time.
    if (isLocked) {
      unlockAndRun {
        Presses.press(this)
        show()
      }
    } else {
      Presses.press(this)
      show()
    }
  }

  private fun show() {
    val tile = qsTile ?: return
    val shown = Store.shown(this)
    tile.state = if (shown?.running == true) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    tile.icon = Icon.createWithResource(this, R.drawable.stint_glyph)
    tile.label = getString(R.string.stint_tile)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = shown?.tile ?: "Sign in"
    tile.updateTile()
  }

  @SuppressLint("StartActivityAndCollapseDeprecated")
  private fun openApp() {
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(Surfaces.openApp(this))
    } else {
      val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
      @Suppress("DEPRECATION")
      startActivityAndCollapse(launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
