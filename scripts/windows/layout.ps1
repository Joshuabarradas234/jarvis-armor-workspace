param([switch]$List)
# Window placement for JARVIS. Two modes:
#   -File layout.ps1 -List        -> prints JSON of every visible top-level window
#   -File layout.ps1              -> reads JSON {windows:[{match,matchBy,x,y,w,h}]} from stdin and moves them
# Coordinates are PHYSICAL screen pixels; the process is made per-monitor DPI aware so
# Windows does not rescale them behind our back on the Zenbook's high-DPI panels.
$ErrorActionPreference = 'Stop'
try {
  Add-Type -Namespace Jarvis -Name Win -Language CSharp -MemberDefinition @'
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr p);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@
  # per-monitor DPI aware so our pixel coordinates are not rescaled; fall back on older builds
  $dpiOk = $false
  try { $dpiOk = [Jarvis.Win]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch { }
  if (-not $dpiOk) { try { [void][Jarvis.Win]::SetProcessDPIAware() } catch { } }

  $script:found = New-Object System.Collections.ArrayList
  $callback = [Jarvis.Win+EnumWindowsProc]{
    param($h, $p)
    if (-not [Jarvis.Win]::IsWindowVisible($h)) { return $true }
    $len = [Jarvis.Win]::GetWindowTextLength($h)
    if ($len -le 0) { return $true }
    # skip tool windows (floating palettes) and owned dialogs
    $ex = [Jarvis.Win]::GetWindowLong($h, -20)
    if ($ex -band 0x80) { return $true }
    if ([Jarvis.Win]::GetWindow($h, 4) -ne [IntPtr]::Zero) { return $true }
    # skip cloaked UWP shells, which are invisible but still enumerate
    $cloaked = 0
    try { if ([Jarvis.Win]::DwmGetWindowAttribute($h, 14, [ref]$cloaked, 4) -eq 0 -and $cloaked -ne 0) { return $true } } catch { }
    $sb = New-Object System.Text.StringBuilder ($len + 2)
    [void][Jarvis.Win]::GetWindowText($h, $sb, $sb.Capacity)
    $procId = 0
    [void][Jarvis.Win]::GetWindowThreadProcessId($h, [ref]$procId)
    $name = ''
    try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { }
    [void]$script:found.Add([pscustomobject]@{ handle = [int64]$h; title = $sb.ToString(); process = $name })
    return $true
  }
  [void][Jarvis.Win]::EnumWindows($callback, [IntPtr]::Zero)

  if ($List) {
    $out = $script:found | Where-Object { $_.process -ne 'JARVIS Armor Workspace' } | Sort-Object process, title
    Write-Output (ConvertTo-Json @($out) -Compress -Depth 4)
    exit 0
  }

  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $results = New-Object System.Collections.ArrayList
  foreach ($want in @($request.windows)) {
    $needle = [string]$want.match
    $by = [string]$want.matchBy
    $hit = $null
    foreach ($w in $script:found) {
      $hay = if ($by -eq 'process') { $w.process } else { $w.title }
      if ($hay -and $hay.ToLower().Contains($needle.ToLower())) { $hit = $w; break }
    }
    if (-not $hit) {
      [void]$results.Add([pscustomobject]@{ match = $needle; moved = $false; reason = 'not running' })
      continue
    }
    $h = [IntPtr]::new([int64]$hit.handle)
    try {
      if ([Jarvis.Win]::IsIconic($h) -or [Jarvis.Win]::IsZoomed($h)) { [void][Jarvis.Win]::ShowWindow($h, 9) ; Start-Sleep -Milliseconds 120 }
      # SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
      $ok = [Jarvis.Win]::SetWindowPos($h, [IntPtr]::Zero, [int]$want.x, [int]$want.y, [int]$want.w, [int]$want.h, 0x4 -bor 0x10 -bor 0x20)
      [void]$results.Add([pscustomobject]@{ match = $needle; moved = [bool]$ok; title = $hit.title; process = $hit.process })
    } catch {
      [void]$results.Add([pscustomobject]@{ match = $needle; moved = $false; reason = $_.Exception.Message })
    }
  }
  Write-Output (ConvertTo-Json @{ results = @($results) } -Compress -Depth 5)
} catch {
  Write-Output (ConvertTo-Json @{ error = $_.Exception.Message } -Compress)
}
