$ErrorActionPreference = "Stop"

$buildsPath = "C:\TestBuilds"
$installer = Get-ChildItem -Path $buildsPath -Filter "*_x64-setup.exe" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Start-Process explorer.exe -ArgumentList $buildsPath

if ($null -eq $installer) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "No NSIS installer matching *_x64-setup.exe was found in C:\TestBuilds",
    "PDFLeaf installer test"
  ) | Out-Null
  exit 1
}

Start-Sleep -Seconds 1
Start-Process -FilePath $installer.FullName
