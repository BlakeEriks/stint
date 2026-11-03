import SwiftUI
import WidgetKit

// Every surface outside the app (`specs/015-ios-surfaces/spec.md`, Design):
// Android's widgets in iOS's sizes, the Live Activity and the control.
@main
struct StintWidgets: WidgetBundle {
  var body: some Widget {
    TimerWidget()
    TimerActivity()
    if #available(iOS 18.0, *) {
      TimerControl()
    }
  }
}

struct Entry: TimelineEntry {
  let date: Date
  let surface: Surface
}

/// One entry, redrawn when the app draws (`WidgetCenter`): a running clock
/// counts by itself.
struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: .now, surface: .unreadable)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: .now, surface: Surface.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    completion(Timeline(entries: [Entry(date: .now, surface: Surface.load())], policy: .never))
  }
}

struct TimerWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dev.stint.timer", provider: Provider()) { entry in
      TimerWidgetView(surface: entry.surface)
    }
    .configurationDisplayName("Timer")
    .description("The running timer, with Start and Stop.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
  }
}

struct TimerWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  let surface: Surface

  var body: some View {
    let p = Palette(surface.colors, scheme)
    Group {
      switch family {
      case .systemMedium: Row(surface: surface, p: p)
      case .accessoryRectangular: LockRectangle(surface: surface)
      case .accessoryCircular: LockCircle(surface: surface)
      default: Square(surface: surface, p: p)
      }
    }
    .containerBackground(for: .widget) { p["bg-primary"] }
  }
}

// MARK: Parts every surface shares

/// The clock: counting while running, at zero in the idle color otherwise.
struct Clock: View {
  let surface: Surface
  let p: Palette
  var size: CGFloat = 30

  var body: some View {
    Group {
      if surface.running {
        Text(timerInterval: surface.start...Date.distantFuture, countsDown: false)
          .foregroundStyle(p["timer-running"])
      } else {
        Text("0:00:00").foregroundStyle(p["timer-idle"])
      }
    }
    .font(.system(size: size, weight: .medium, design: .monospaced))
    .monospacedDigit()
    .lineLimit(1)
    .minimumScaleFactor(0.6)
  }
}

/// The project line, or the failed press's reason in its place.
struct Detail: View {
  let surface: Surface
  let p: Palette

  var body: some View {
    if let why = surface.why {
      Text(why).foregroundStyle(p["danger"]).lineLimit(2)
    } else if let detail = surface.detail {
      HStack(spacing: 6) {
        if let dot = surface.color.flatMap(Color.init(hex:)) {
          Circle().fill(dot).frame(width: 8, height: 8)
        }
        Text(detail).foregroundStyle(p["text-muted"]).lineLimit(1)
      }
    }
  }
}

/// The round Start or Stop. Start is the one accent object; Stop is quiet.
/// None signed out, or where nothing could be read: a tap opens the app.
struct PressButton: View {
  let surface: Surface
  let p: Palette
  var size: CGFloat = 40

  var body: some View {
    if surface.running {
      Button(intent: StopTimerIntent()) {
        disc("stop.fill", fill: p["bg-elevated"], glyph: p["text-primary"], edge: p["border-default"])
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Stop")
    } else if surface.kind == "stopped" {
      Button(intent: StartTimerIntent()) {
        disc("play.fill", fill: p["accent-default"], glyph: p["text-on-accent"], edge: .clear)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Start")
    }
  }

  private func disc(_ symbol: String, fill: Color, glyph: Color, edge: Color) -> some View {
    Image(systemName: symbol)
      .font(.system(size: size * 0.38, weight: .semibold))
      .foregroundStyle(glyph)
      .frame(width: size, height: size)
      .background(Circle().fill(fill))
      .overlay(Circle().stroke(edge, lineWidth: 1))
      .invalidatableContent()
  }
}

// MARK: Home screen

/// Android's 2×2: the wordmark and button, the clock, the task, the project.
struct Square: View {
  let surface: Surface
  let p: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .top) {
        Text("STINT")
          .font(.system(size: 13, weight: .semibold, design: .monospaced))
          .tracking(1.6)
          .foregroundStyle(p["text-subtle"])
        Spacer()
        PressButton(surface: surface, p: p)
      }
      Spacer(minLength: 0)
      if surface.running || surface.kind == "stopped" {
        Clock(surface: surface, p: p, size: 26).invalidatableContent()
      }
      Text(surface.title)
        .font(.system(size: 14))
        .foregroundStyle(p["text-strong"])
        .lineLimit(2)
      Detail(surface: surface, p: p).font(.system(size: 12))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

/// Android's 4×1 row: the live dot, clock, task, project, and the button.
struct Row: View {
  let surface: Surface
  let p: Palette

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        if surface.running || surface.kind == "stopped" {
          HStack(spacing: 8) {
            if surface.running {
              Circle().fill(p["timer-running"]).frame(width: 8, height: 8)
            }
            Clock(surface: surface, p: p, size: 28)
          }
          .invalidatableContent()
        }
        Text(surface.title)
          .font(.system(size: 15))
          .foregroundStyle(p["text-strong"])
          .lineLimit(1)
        Detail(surface: surface, p: p).font(.system(size: 13))
      }
      Spacer(minLength: 0)
      PressButton(surface: surface, p: p, size: 48)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }
}

// MARK: Lock screen, which iOS tints itself

struct LockRectangle: View {
  let surface: Surface

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      if surface.running {
        Text(timerInterval: surface.start...Date.distantFuture, countsDown: false)
          .font(.system(.headline, design: .monospaced))
          .monospacedDigit()
      }
      Text(surface.title).font(.headline).lineLimit(1)
      if let line = surface.why ?? surface.detail {
        Text(line).font(.caption).lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct LockCircle: View {
  let surface: Surface

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      if surface.running {
        Button(intent: StopTimerIntent()) { Image(systemName: "stop.fill") }
          .buttonStyle(.plain)
          .accessibilityLabel("Stop")
      } else if surface.kind == "stopped" {
        Button(intent: StartTimerIntent()) { Image(systemName: "play.fill") }
          .buttonStyle(.plain)
          .accessibilityLabel("Start")
      } else {
        Image(systemName: "timer")
      }
    }
    .font(.title2)
  }
}
