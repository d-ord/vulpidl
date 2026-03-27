!macro customHeader
  !system "echo VulpiDL Custom Installer"
!macroend

!macro preInit
  SetRegView 64
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
