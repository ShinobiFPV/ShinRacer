; Custom NSIS macros for the ShinRacer installer.
;
; electron-builder generates the bulk of the installer script itself and
; splices these four macros in at fixed points if they're defined — see
; https://www.electron.build/configuration/nsis#custom-nsis-script. This file
; is referenced from package.json's build.nsis.include.

!macro customHeader
  ; Shown in the installer window's title bar and Alt+Tab entry.
  BrandingText "ShinRacer — built for the crew by the crew"
!macroend

!macro customInit
  ; Installing over a running instance fails partway through with a
  ; confusing "file in use" error — close it first if it's up. taskkill's
  ; exit code is ignored (nonzero just means "wasn't running"), so this is
  ; safe to run unconditionally on every install/upgrade.
  ;
  ; ${APP_EXECUTABLE_FILENAME} (electron-builder's common.nsh, always
  ; !include'd ahead of this file — confirmed by reading it directly from
  ; the electron-builder repo) resolves to the packaged exe's real name —
  ; "ShinRacer.exe" for the Full build, "ShinRacer Lite.exe" for ShinRacer
  ; Lite (see electron-builder-lite.yml) — so this one shared script works
  ; correctly for both installers instead of only Full's.
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
!macroend

!macro customInstall
  ; Nothing beyond electron-builder's own file copy is required at install
  ; time — settings/identity live in electron-store under %APPDATA%, created
  ; on first launch, not by the installer.
!macroend

!macro customUnInstall
  ; Ask before wiping electron-store config + logs — a crew member
  ; reinstalling to fix a bad update shouldn't lose their identity, backend
  ; URL, and saved server profiles without being asked first.
  ;
  ; ${PRODUCT_NAME} (electron-builder's common.nsh) is "ShinRacer" for the
  ; Full build and "ShinRacer Lite" for ShinRacer Lite — Electron's default
  ; userData path is namespaced by productName, so this must match to
  ; actually find (and only ever touch) the right app's own data folder.
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Also delete your ${PRODUCT_NAME} settings and logs? (identity, backend URL, saved server profiles)" \
    IDNO skip_data_removal
  RMDir /r "$APPDATA\${PRODUCT_NAME}"
  skip_data_removal:
!macroend
