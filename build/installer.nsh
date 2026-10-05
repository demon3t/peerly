; Custom NSIS hooks for electron-builder (see package.json build.nsis.include).
; The .torrent association is handled by electron-builder; magnet: is opt-in from
; the app settings, so on uninstall we only remove it when it still points to us.

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\magnet\shell\open\command" ""
  StrCmp $0 "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"" 0 +2
    DeleteRegKey HKCU "Software\Classes\magnet"
!macroend
