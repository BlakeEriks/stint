// After react-native-headless-task-worker (MIT, Copyright (c) 2022 Jay Kim),
// https://github.com/wjaykim/react-native-headless-task-worker, as
// react-native-android-widget runs it: WorkManager may start from a widget or
// a tile in the background, where Android refuses HeadlessJsTaskService.
package dev.stint.surfaces

import android.content.Context
import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import com.google.common.util.concurrent.ListenableFuture

/** Runs the `StintPress` task (`index.ts`) with the press's action. */
class PressWorker(context: Context, params: WorkerParameters) :
  ListenableWorker(context, params), HeadlessJsTaskEventListener {
  private var taskId = -1
  private var completer: CallbackToFutureAdapter.Completer<Result>? = null

  override fun startWork(): ListenableFuture<Result> =
    CallbackToFutureAdapter.getFuture { done ->
      completer = done
      start(config())
      "StintPress"
    }

  private fun config(): HeadlessJsTaskConfig {
    val map = Arguments.createMap()
    map.putString("action", inputData.getString("action"))
    inputData.getString("taskName")?.let { map.putString("taskName", it) }
    map.putString("projectId", inputData.getString("projectId"))
    // The press's own 10s bound, its refetch, and room to spare.
    return HeadlessJsTaskConfig("StintPress", map, 30_000L, true)
  }

  private fun start(config: HeadlessJsTaskConfig) {
    val host = (applicationContext as ReactApplication).reactHost
    if (host == null) {
      completer?.set(Result.failure())
      return
    }
    val current = host.currentReactContext
    if (current != null) {
      invoke(current, config)
      return
    }
    host.addReactInstanceEventListener(
      object : ReactInstanceEventListener {
        override fun onReactContextInitialized(context: ReactContext) {
          host.removeReactInstanceEventListener(this)
          invoke(context, config)
        }
      }
    )
    host.start()
  }

  private fun invoke(context: ReactContext, config: HeadlessJsTaskConfig) {
    val tasks = HeadlessJsTaskContext.getInstance(context)
    tasks.addTaskEventListener(this)
    UiThreadUtil.runOnUiThread { taskId = tasks.startTask(config) }
  }

  override fun onHeadlessJsTaskStart(taskId: Int) = Unit

  override fun onHeadlessJsTaskFinish(taskId: Int) {
    if (taskId != this.taskId) return
    completer?.set(Result.success())
    cleanUp()
  }

  override fun onStopped() {
    super.onStopped()
    cleanUp()
  }

  private fun cleanUp() {
    val context = (applicationContext as ReactApplication).reactHost?.currentReactContext ?: return
    HeadlessJsTaskContext.getInstance(context).removeTaskEventListener(this)
  }
}
