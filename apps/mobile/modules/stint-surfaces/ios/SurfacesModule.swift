import ExpoModulesCore

/// JS's one call, `draw` (`src/surfaces-native.ts`), and the event telling it
/// a press ran here while it was up, so it refetches the timer.
public class SurfacesModule: Module {
  static weak var current: SurfacesModule?

  public func definition() -> ModuleDefinition {
    Name("StintSurfaces")

    Events("pressed")

    OnCreate {
      SurfacesModule.current = self
    }

    AsyncFunction("draw") { (state: String) in
      try MainActor.assumeIsolated { try Surfaces.draw(state) }
    }.runOnQueue(.main)
  }

  static func pressed() {
    DispatchQueue.main.async { current?.sendEvent("pressed") }
  }
}
