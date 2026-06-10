$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repositoryRoot

$releaseExecutable = Join-Path $repositoryRoot "src-tauri\target\release\compact-img.exe"
$runningRelease = Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -eq $releaseExecutable
}

if ($runningRelease) {
    Write-Host "Encerrando a instancia local de release antes do build..."
    $runningRelease | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
    }
}

Write-Host "Gerando o MSI do Compact Img..."
& bunx tauri build --bundles msi
if ($LASTEXITCODE -ne 0) {
    throw "O build do Tauri falhou com o codigo $LASTEXITCODE."
}

$bundleDirectory = Join-Path $repositoryRoot "src-tauri\target\release\bundle\msi"
$installer = Get-ChildItem -LiteralPath $bundleDirectory -Filter "*.msi" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    throw "Nenhum MSI foi encontrado em $bundleDirectory."
}

$signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
$hash = Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
$hashFile = "$($installer.FullName).sha256"
"$($hash.Hash)  $($installer.Name)" | Set-Content -LiteralPath $hashFile -Encoding ascii

$defenderPath = Join-Path $env:ProgramFiles "Windows Defender\MpCmdRun.exe"
$defenderResult = "nao executado"

if (Test-Path -LiteralPath $defenderPath) {
    & $defenderPath -Scan -ScanType 3 -File $installer.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "O Microsoft Defender rejeitou ou nao conseguiu verificar o MSI (codigo $LASTEXITCODE)."
    }
    $defenderResult = "nenhuma ameaca encontrada"
}

Write-Host ""
Write-Host "Artefato: $($installer.FullName)"
Write-Host "SHA-256:  $($hash.Hash)"
Write-Host "Defender: $defenderResult"

if ($signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid) {
    Write-Host "Assinatura: valida ($($signature.SignerCertificate.Subject))"
} else {
    Write-Warning "Assinatura: NAO ASSINADO. Nao distribua publicamente sem assinatura de codigo."
}
