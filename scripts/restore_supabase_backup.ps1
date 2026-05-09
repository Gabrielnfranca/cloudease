param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,

    [Parameter(Mandatory = $true)]
    [string]$DatabaseUrl
)

$ErrorActionPreference = 'Stop'

function Expand-GzipToTempSql {
    param(
        [Parameter(Mandatory = $true)]
        [string]$GzipFilePath
    )

    $tempSql = Join-Path $env:TEMP ("supabase-restore-" + [guid]::NewGuid().ToString() + ".sql")

    $inputStream = [System.IO.File]::OpenRead($GzipFilePath)
    try {
        $gzipStream = New-Object System.IO.Compression.GzipStream($inputStream, [System.IO.Compression.CompressionMode]::Decompress)
        try {
            $outputStream = [System.IO.File]::Create($tempSql)
            try {
                $gzipStream.CopyTo($outputStream)
            } finally {
                $outputStream.Dispose()
            }
        } finally {
            $gzipStream.Dispose()
        }
    } finally {
        $inputStream.Dispose()
    }

    return $tempSql
}

if (-not (Test-Path -LiteralPath $BackupPath)) {
    throw "Arquivo de backup nao encontrado: $BackupPath"
}

$psqlCommand = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlCommand) {
    throw 'psql nao foi encontrado no PATH. Instale o PostgreSQL client e tente novamente.'
}

$workingSqlPath = $BackupPath
$tempGenerated = $false

try {
    if ($BackupPath.ToLower().EndsWith('.sql.gz') -or $BackupPath.ToLower().EndsWith('.backup.gz')) {
        Write-Host 'Descompactando backup .sql.gz...'
        $workingSqlPath = Expand-GzipToTempSql -GzipFilePath $BackupPath
        $tempGenerated = $true
    } elseif (-not $BackupPath.ToLower().EndsWith('.sql')) {
        throw 'Formato nao suportado. Use backup .sql, .sql.gz ou .backup.gz.'
    }

    Write-Host "Restaurando backup: $workingSqlPath"
    & $psqlCommand.Source $DatabaseUrl -v ON_ERROR_STOP=1 -f $workingSqlPath

    if ($LASTEXITCODE -ne 0) {
        throw "Falha na restauracao. Codigo de saida: $LASTEXITCODE"
    }

    Write-Host 'Restauracao concluida com sucesso.'
} finally {
    if ($tempGenerated -and (Test-Path -LiteralPath $workingSqlPath)) {
        Remove-Item -LiteralPath $workingSqlPath -Force
    }
}
