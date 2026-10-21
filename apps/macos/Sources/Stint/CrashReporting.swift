import Sentry

/// Crashes to Sentry's Apple project. Only the prod bundle carries a DSN
/// (`bundle.sh`), so local, preview and `qa.sh` builds never report.
enum CrashReporting {
    static func start() {
        guard let dsn = Config.sentryDSN, let environment = Config.environmentName else { return }
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = environment
        }
    }

    static func setUser(id: String?) {
        guard SentrySDK.isEnabled else { return }
        SentrySDK.setUser(id.map { User(userId: $0) })
    }
}
