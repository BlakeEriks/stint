// qa.sh's hands: the QA window's controls, found by accessibility identifier.
//
//   swift qa.swift <pid> window            the window's id, for screencapture -l
//   swift qa.swift <pid> ids               every identifier on screen
//   swift qa.swift <pid> click <id>        press it
//   swift qa.swift <pid> type <id> <text>  set a field's text, then submit it
//
// Accessibility presses and sets values directly, so the mouse and keyboard
// stay the user's.
import ApplicationServices
import CoreGraphics

let args = CommandLine.arguments
let pid = pid_t(args[1])!

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: AnyObject?
    AXUIElementCopyAttributeValue(element, name as CFString, &value)
    return value
}

/// Each element once. An app's tree can list the app among its own windows
/// and children, and a walk without `seen` recurses until the stack overflows.
func elements(_ root: AXUIElement, _ seen: inout Set<AXUIElement>) -> [AXUIElement] {
    guard seen.insert(root).inserted else { return [] }
    let children = attribute(root, kAXChildrenAttribute) as? [AXUIElement] ?? []
    return [root] + children.flatMap { elements($0, &seen) }
}

/// Everything in the window, and not the app's main menu.
func controls() -> [AXUIElement] {
    let app = AXUIElementCreateApplication(pid)
    let windows = (attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? [])
        .filter { attribute($0, kAXRoleAttribute) as? String == kAXWindowRole }
    guard !windows.isEmpty else { fatalError("pid \(pid) exposes no window to accessibility") }
    var seen: Set<AXUIElement> = [app]
    return windows.flatMap { elements($0, &seen) }
}

func identifier(_ element: AXUIElement) -> String? {
    attribute(element, kAXIdentifierAttribute) as? String
}

func find(_ id: String) -> AXUIElement {
    guard let match = controls().first(where: { identifier($0) == id })
    else { fatalError("no control \"\(id)\" on screen — ./qa.sh ids lists them") }
    return match
}

switch args[2] {
case "window":
    let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as! [[String: Any]]
    let panel = windows.first {
        $0[kCGWindowOwnerPID as String] as? pid_t == pid && $0[kCGWindowName as String] as? String == "Stint"
    }
    // A window's title reads as nil without Screen Recording permission.
    guard let id = panel?[kCGWindowNumber as String] as? Int else {
        fatalError("no Stint window — still opening, or this terminal lacks Screen Recording permission")
    }
    print(id)
case "ids":
    controls().compactMap(identifier).forEach { print($0) }
case "click":
    AXUIElementPerformAction(find(args[3]), kAXPressAction as CFString)
case "type":
    let field = find(args[3])
    AXUIElementSetAttributeValue(field, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, args[4] as CFString)
    AXUIElementPerformAction(field, kAXConfirmAction as CFString)
default:
    fatalError("unknown command \(args[2])")
}
