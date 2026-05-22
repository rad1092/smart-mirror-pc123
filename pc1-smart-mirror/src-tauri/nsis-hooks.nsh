!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\Smart Mirror.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\Smart Mirror.lnk"
!macroend
