package dev.stint.surfaces

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The one call JS makes: draw this state everywhere (`src/surfaces-native.ts`). */
class SurfacesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StintSurfaces")

    Function("draw") { state: String ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      Store.save(context, state)
      Surfaces.draw(context)
    }
  }
}
