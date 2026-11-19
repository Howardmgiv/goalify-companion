$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = [Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'icon.png'))
$destination = Join-Path $PSScriptRoot 'appx'
try {
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    foreach ($asset in @(
        @{ Name = 'StoreLogo.png'; Width = 50; Height = 50 },
        @{ Name = 'Square44x44Logo.png'; Width = 44; Height = 44 },
        @{ Name = 'Square150x150Logo.png'; Width = 150; Height = 150 },
        @{ Name = 'Wide310x150Logo.png'; Width = 310; Height = 150 }
    )) {
        $bitmap = [Drawing.Bitmap]::new($asset.Width, $asset.Height)
        try {
            $graphics = [Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([Drawing.Color]::Transparent)
                $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $scale = [Math]::Min($asset.Width / $source.Width, $asset.Height / $source.Height)
                $width = [int][Math]::Round($source.Width * $scale)
                $height = [int][Math]::Round($source.Height * $scale)
                $graphics.DrawImage($source, [int](($asset.Width - $width) / 2),
                    [int](($asset.Height - $height) / 2), $width, $height)
            } finally { $graphics.Dispose() }
            $bitmap.Save((Join-Path $destination $asset.Name), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $bitmap.Dispose() }
    }
} finally { $source.Dispose() }
