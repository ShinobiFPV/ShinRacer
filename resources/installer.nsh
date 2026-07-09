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
  ; Installing over a running ShinRacer.exe fails partway through with a
  ; confusing "file in use" error — close it first if it's up. taskkill's
  ; exit code is ignored (nonzero just means "wasn't running"), so this is
  ; safe to run unconditionally on every install/upgrade.
  nsExec::ExecToLog 'taskkill /F /IM ShinRacer.exe /T'
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
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Also delete your ShinRacer settings and logs? (identity, backend URL, saved server profiles)" \
    IDNO skip_data_removal
  RMDir /r "$APPDATA\ShinRacer"
  skip_data_removal:
!macroend
