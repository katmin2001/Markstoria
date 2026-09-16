param([string]$OutputDirectory = "$PSScriptRoot\icons")

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

foreach ($size in @(16, 32, 48, 128)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $green = [System.Drawing.Color]::FromArgb(8, 127, 91)
  $white = [System.Drawing.Color]::White
  $accent = [System.Drawing.Color]::FromArgb(218, 107, 63)
  $margin = [Math]::Max(1, [int]($size * 0.08))
  $radius = [int]($size * 0.18)
  $bounds = [System.Drawing.Rectangle]::new($margin, $margin, ($size - (2 * $margin)), ($size - (2 * $margin)))

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($bounds.Left, $bounds.Top, $diameter, $diameter, 180, 90)
  $path.AddArc($bounds.Right - $diameter, $bounds.Top, $diameter, $diameter, 270, 90)
  $path.AddArc($bounds.Right - $diameter, $bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($bounds.Left, $bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $greenBrush = [System.Drawing.SolidBrush]::new($green)
  $graphics.FillPath($greenBrush, $path)

  $bookmarkWidth = [int]($size * 0.34)
  $bookmarkHeight = [int]($size * 0.48)
  $left = [int](($size - $bookmarkWidth) / 2)
  $top = [int]($size * 0.22)
  [System.Drawing.Point[]]$points = @(
    [System.Drawing.Point]::new($left, $top),
    [System.Drawing.Point]::new(($left + $bookmarkWidth), $top),
    [System.Drawing.Point]::new(($left + $bookmarkWidth), ($top + $bookmarkHeight)),
    [System.Drawing.Point]::new([int]($size / 2), [int]($top + $bookmarkHeight - $size * 0.12)),
    [System.Drawing.Point]::new($left, ($top + $bookmarkHeight))
  )
  $whiteBrush = [System.Drawing.SolidBrush]::new($white)
  $graphics.FillPolygon($whiteBrush, $points)
  $dotSize = [Math]::Max(2, [int]($size * 0.12))
  $accentBrush = [System.Drawing.SolidBrush]::new($accent)
  $graphics.FillEllipse($accentBrush, ($size - $margin - $dotSize - [int]($size * 0.08)), ($margin + [int]($size * 0.08)), $dotSize, $dotSize)

  $bitmap.Save((Join-Path $OutputDirectory "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $greenBrush.Dispose()
  $whiteBrush.Dispose()
  $accentBrush.Dispose()
  $path.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
