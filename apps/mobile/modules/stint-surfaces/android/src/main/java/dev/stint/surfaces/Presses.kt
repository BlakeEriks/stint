package dev.stint.surfaces

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.Data
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager

/**
 * A press on a surface: its result drawn at once, then the app's own press in
 * JS (`press()` in `src/surfaces.ts`), whose answer replaces it.
 */
object Presses {
  fun press(context: Context) {
    val before = Store.shown(context) ?: return
    if (before.signedOut) return
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
