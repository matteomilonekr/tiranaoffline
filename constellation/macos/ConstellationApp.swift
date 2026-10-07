// Native window for Constellation: starts the local server if needed and shows the app
// in a WKWebView. Built by install.sh with the Xcode command line tools:
//   swiftc -O ConstellationApp.swift -o constellation -framework Cocoa -framework WebKit

import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var server: Process?

    let env = ProcessInfo.processInfo.environment
    lazy var port: String = env["CONSTELLATION_PORT"] ?? "4747"
    lazy var home: URL = {
        if let custom = env["CONSTELLATION_HOME"] { return URL(fileURLWithPath: custom) }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".constellation")
    }()
    var appURL: URL { URL(string: "http://127.0.0.1:\(port)/")! }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "Constellation"
        window.titlebarAppearsTransparent = true
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.05, blue: 0.055, alpha: 1)
        window.minSize = NSSize(width: 720, height: 520)
        window.center()
        window.setFrameAutosaveName("ConstellationMain")

        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        ensureServer { [weak self] ok in
            guard let self = self else { return }
            if ok {
                self.webView.load(URLRequest(url: self.appURL))
            } else {
                let log = self.home.appendingPathComponent("server.log").path
                self.webView.loadHTMLString(
                    "<body style='background:#0d0d0e;color:#eee;font:14px -apple-system;padding:40px'>"
                        + "<h2>Constellation could not start</h2><p>Run the installer again, or check the log at \(log).</p></body>",
                    baseURL: nil
                )
            }
        }
    }

    func ping(_ done: @escaping (Bool) -> Void) {
        var request = URLRequest(url: appURL.appendingPathComponent("api/ping"))
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { _, response, _ in
            done((response as? HTTPURLResponse)?.statusCode == 200)
        }.resume()
    }

    func ensureServer(_ done: @escaping (Bool) -> Void) {
        ping { alive in
            DispatchQueue.main.async {
                if alive { return done(true) }
                self.startServer()
                self.waitForServer(tries: 80, done)
            }
        }
    }

    func startServer() {
        let nodeFile = home.appendingPathComponent("node-path")
        let saved = (try? String(contentsOf: nodeFile, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidates = [saved, "/opt/homebrew/bin/node", "/usr/local/bin/node", home.appendingPathComponent("runtime/bin/node").path]
        guard let node = candidates.compactMap({ $0 }).first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            NSLog("Constellation: Node.js not found")
            return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [home.appendingPathComponent("app/server.mjs").path, "--port", port]
        let log = home.appendingPathComponent("server.log")
        if !FileManager.default.fileExists(atPath: log.path) {
            FileManager.default.createFile(atPath: log.path, contents: nil)
        }
        if let handle = try? FileHandle(forWritingTo: log) {
            handle.seekToEndOfFile()
            process.standardOutput = handle
            process.standardError = handle
        }
        do {
            try process.run()
            server = process
        } catch {
            NSLog("Constellation: cannot start the server: \(error)")
        }
    }

    func waitForServer(tries: Int, _ done: @escaping (Bool) -> Void) {
        ping { alive in
            DispatchQueue.main.async {
                if alive { return done(true) }
                if tries <= 0 { return done(false) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitForServer(tries: tries - 1, done) }
            }
        }
    }

    // Links to Meta (Graph API Explorer, Ads Manager) open in the default browser.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, let host = url.host, host != "127.0.0.1", host != "localhost",
            navigationAction.navigationType == .linkActivated || navigationAction.targetFrame == nil
        {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        server?.terminate()
    }

    @objc func reload(_ sender: Any?) {
        webView.reload()
    }

    func buildMenu() {
        let main = NSMenu()
        let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "Constellation"

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Hide \(name)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit \(name)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        // Without an Edit menu, Cmd+V would not paste the access token.
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(reload(_:)), keyEquivalent: "r")
        view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewItem.submenu = view
        main.addItem(viewItem)

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
