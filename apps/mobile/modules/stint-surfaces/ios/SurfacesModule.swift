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

    Function("draw") { (state: String) in
      Surfaces.draw(state)
    }
  }

  static func pressed() {
    DispatchQueue.main.async { current?.sendEvent("pressed") }
  }
}
