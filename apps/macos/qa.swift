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

func elements(_ root: AXUIElement) -> [AXUIElement] {
    let children = attribute(root, kAXChildrenAttribute) as? [AXUIElement] ?? []
    return [root] + children.flatMap(elements)
}

/// Everything in the window, and not the app's main menu.
func controls() -> [AXUIElement] {
    let windows = attribute(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement] ?? []
    return windows.flatMap(elements)
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
    print(panel?[kCGWindowNumber as String] as? Int ?? "")
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
