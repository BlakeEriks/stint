# The iPhone half of the timer outside the app (`docs/mobile.md`, Outside
# the app). Its name is what `targets/widget/_shared/Intents.swift` imports.
Pod::Spec.new do |s|
  s.name           = 'StintSurfaces'
  s.version        = '1.0.0'
  s.summary        = 'The timer outside the app'
  s.license        = 'UNLICENSED'
  s.author         = 'Stint'
  s.homepage       = 'https://runstint.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
