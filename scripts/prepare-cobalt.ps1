param([switch]$BundleNode)

$ErrorActionPreference = 'Stop'
$engineRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src-tauri\cobalt'))
$engineApi = Join-Path $engineRoot 'api'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$nodeMajor = [int](& $nodePath -p 'process.versions.node.split(".")[0]')
$nodeAbi = (& $nodePath -p 'process.versions.modules').Trim()
if ($nodeMajor -lt 22) { throw 'Cobalt requires Node.js 22 or newer.' }
if (-not [System.Environment]::Is64BitProcess -or $env:OS -ne 'Windows_NT') {
    throw 'This preparation script targets Windows x64 releases.'
}

Push-Location $engineApi
try {
    # Install the engine's production packages only. Never compile native addons
    # or download a second FFmpeg as part of dependency installation.
    & npm ci --omit=dev --omit=optional --ignore-scripts --install-links --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Cobalt dependency installation failed.' }

    $digests = @{
        '127' = 'aa697ab61ac8408163ec6642e10c7e85465e916e793144a6fd2135f3f693002d'
        '137' = '04b04ed6c9f40a8debc29ae99240f43a1d426437d7e5e5dc1da3382fd5502ea4'
    }
    if (-not $digests.ContainsKey($nodeAbi)) {
        throw 'Use Node.js 22 or 24: no verified isolated-vm prebuilt is pinned for this Node ABI.'
    }
    $archivePath = Join-Path $engineRoot 'isolated-vm-prebuilt.tar.gz'
    try {
        $assetName = "isolated-vm-v6.0.2-node-v$nodeAbi-win32-x64.tar.gz"
        Invoke-WebRequest -Uri "https://github.com/laverdet/isolated-vm/releases/download/v6.0.2/$assetName" -OutFile $archivePath
        if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digests[$nodeAbi]) {
            throw 'Cobalt native dependency checksum did not match.'
        }
        $entries = @(& tar -tzf $archivePath)
        if ($LASTEXITCODE -ne 0 -or ($entries | Where-Object { $_ -match '(^/|^[A-Za-z]:|(^|/)\.\.(/|$))' })) {
            throw 'Cobalt native dependency archive is invalid.'
        }
        & tar -xzf $archivePath -C (Join-Path $engineApi 'node_modules\isolated-vm')
        if ($LASTEXITCODE -ne 0) { throw 'Cobalt native dependency extraction failed.' }
    } finally {
        if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
    }

    & $nodePath --no-node-snapshot -e 'import("isolated-vm").then(({default: ivm}) => { const isolate = new ivm.Isolate(); isolate.dispose(); })'
    if ($LASTEXITCODE -ne 0) { throw 'The Cobalt native dependency could not load.' }

    if ($BundleNode) {
        $runtimeDir = Join-Path $engineRoot 'runtime'
        New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
        Copy-Item -LiteralPath $nodePath -Destination (Join-Path $runtimeDir 'node.exe')
        $nodeLicense = Join-Path (Split-Path -Parent $nodePath) 'LICENSE'
        $bundledLicense = Join-Path $runtimeDir 'NODE-LICENSE.txt'
        if (Test-Path -LiteralPath $nodeLicense) {
            Copy-Item -LiteralPath $nodeLicense -Destination $bundledLicense
        } else {
            $nodeVersion = (& $nodePath -p 'process.version').Trim()
            Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile $bundledLicense
        }
    }
} finally {
    Pop-Location
}

Write-Output 'Local Cobalt dependencies are ready. The app UI was not built or started.'
