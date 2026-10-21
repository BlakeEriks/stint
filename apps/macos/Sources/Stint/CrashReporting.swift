import Sentry

/// Crashes to Sentry's Apple project. Only the prod bundle carries a DSN
/// (`bundle.sh`), so local, preview and `qa.sh` builds never report.
enum CrashReporting {
    static func start() {
        guard let dsn = Config.sentryDSN else { return }
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = Config.environmentName ?? "local"
            // Crashes and errors only: no tracing, and nothing about the
            // user but the id `setUser` adds.
            options.tracesSampleRate = nil
            options.sendDefaultPii = false
        }
    }

    static func setUser(id: String?) {
        guard SentrySDK.isEnabled else { return }
        SentrySDK.setUser(id.map { User(userId: $0) })
    }
}
