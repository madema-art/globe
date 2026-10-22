[CmdletBinding()]
param(
    [string]$StableRoot = 'D:\globe',
    [string]$PreviewRoot = 'D:\globe-preview'
)

$ErrorActionPreference = 'Stop'
# Windows resolves folder redirection/OneDrive here; do not assume USERPROFILE\Desktop.
$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
if (-not $desktop -or -not (Test-Path -LiteralPath $desktop -PathType Container)) {
    throw 'The Windows Desktop directory could not be resolved.'
}
$shell = New-Object -ComObject WScript.Shell
$definitions = @(
    @{ Name = 'Globe'; Root = $StableRoot; File = 'Start-Globe.bat'; Description = 'Globe stable — safe updates from origin/main' },
    @{ Name = 'Globe Preview'; Root = $PreviewRoot; File = 'Start-Globe-Preview.bat'; Description = 'Globe Preview — safe updates from origin/preview' }
)

# Validate both installations before changing either shortcut.
foreach ($definition in $definitions) {
    $definition.Root = (Resolve-Path -LiteralPath $definition.Root).Path
    $definition.Target = Join-Path $definition.Root $definition.File
    if (-not (Test-Path -LiteralPath $definition.Target -PathType Leaf)) { throw "Missing launcher: $($definition.Target)" }
    $definition.Shortcut = Join-Path $desktop "$($definition.Name).lnk"
}
foreach ($definition in $definitions) {
    if (Test-Path -LiteralPath $definition.Shortcut) {
        $old = $shell.CreateShortcut($definition.Shortcut)
        if ($old.TargetPath -ne $definition.Target) {
            $backupRoot = Join-Path $env:LOCALAPPDATA 'Globe\shortcut-backups'
            New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
            $backupName = "$($definition.Name)-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffffff')).lnk"
            Copy-Item -LiteralPath $definition.Shortcut -Destination (Join-Path $backupRoot $backupName)
        }
    }
    $shortcut = $shell.CreateShortcut($definition.Shortcut)
    $shortcut.TargetPath = $definition.Target
    $shortcut.Arguments = ''
    $shortcut.WorkingDirectory = $definition.Root
    $shortcut.Description = $definition.Description
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    $saved = $shell.CreateShortcut($definition.Shortcut)
    if ($saved.TargetPath -ne $definition.Target -or $saved.WorkingDirectory -ne $definition.Root -or $saved.Arguments) {
        throw "Shortcut verification failed: $($definition.Name)"
    }
    Write-Output "$($definition.Name): $($definition.Shortcut) -> $($saved.TargetPath)"
}
