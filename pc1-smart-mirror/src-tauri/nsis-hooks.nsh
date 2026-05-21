!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\Smart Mirror.lnk" "$INSTDIR\smart-mirror.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\Smart Mirror.lnk"
!macroend
