package dev.stint.surfaces

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.work.Data
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager

/**
 * A press on a surface: its result drawn at once, then the app's own press in
 * JS (`press()` in `src/surfaces.ts`), whose answer replaces it.
 */
object Presses {
  /** `only`: a shortcut's press, which does nothing if the timer moved since. */
  fun press(context: Context, only: String? = null) {
    val before = Store.shown(context) ?: return
    if (before.signedOut) return
    if (only != null && only != if (before.running) "stop" else "start") return
    Store.press(context)
    Surfaces.draw(context)
    val data =
      Data.Builder().putString("action", if (before.running) "stop" else "start")
    if (!before.running) {
      data.putString("taskName", before.nextTask).putString("projectId", before.nextProject)
    }
    WorkManager.getInstance(context)
      .enqueue(OneTimeWorkRequest.Builder(PressWorker::class.java).setInputData(data.build()).build())
  }
}

/** A widget's button or the notification's Stop: both toggle what they show. */
class PressReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Presses.press(context)
  }
}

/**
 * The app icon's shortcut. Not exported, so no other app can press the
 * timer; it presses as a widget does, then opens the app.
 */
class PressActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Presses.press(this, intent.getStringExtra(EXTRA_ACTION))
    packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
    finish()
  }

  companion object {
    const val EXTRA_ACTION = "dev.stint.surfaces.ACTION"
  }
}
