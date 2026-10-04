# JARVIS desktop hand control (src/main/win-control.js): finds the window under a point and moves it.
# It runs while hand control is on: one JSON request per line on stdin, one JSON reply per line on stdout.
# Physical pixels, per-monitor DPI aware. Only finds and moves windows: it never clicks, types or closes anything.
param([int64]$Skip = 0)
$ErrorActionPreference = 'Stop'
function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }
try {
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class JarvisWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  // the desktop, the taskbar and the Start menu are not windows you can pick up
  static readonly HashSet<string> Shell = new HashSet<string> { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow", "TopLevelWindowForOverflowXamlIsland", "NotifyIconOverflowWindow" };
  public static RECT Frame(IntPtr h) { RECT r; if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(h, out r); return r; }
  public static RECT Outer(IntPtr h) { RECT r; GetWindowRect(h, out r); return r; }
  public static string Text(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
  /* The top-most ordinary window under the point (EnumWindows goes from front to back), not one of JARVIS's own. */
  public static IntPtr At(int x, int y, uint skip) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true;   // tool windows
      if (GetWindow(h, 4) != IntPtr.Zero) return true;         // pop-ups owned by another window
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      if (Pid(h) == skip || Shell.Contains(Cls(h))) return true;
      RECT r = Frame(h); if (r.Right - r.Left < 40 || r.Bottom - r.Top < 40) return true;
      if (x < r.Left || x >= r.Right || y < r.Top || y >= r.Bottom) return true;
      found = h; return false;
    }, IntPtr.Zero);
    return found;
  }
}
'@
} catch { Emit @{ ready = $false; error = $_.Exception.Message }; exit 1 }
[void][JarvisWin]::SetProcessDpiAwarenessContext([IntPtr](-4))
$names = @{}
function ProcName($procId) { if (-not $names.ContainsKey($procId)) { try { $names[$procId] = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { $names[$procId] = '' } }; return $names[$procId] }
function Box($r) { return @{ x = $r.Left; y = $r.Top; w = $r.Right - $r.Left; h = $r.Bottom - $r.Top } }
function Describe($h) { return @{ handle = $h.ToInt64(); title = [JarvisWin]::Text($h); process = (ProcName ([JarvisWin]::Pid($h))); maximized = [JarvisWin]::IsZoomed($h); outer = (Box ([JarvisWin]::Outer($h))); frame = (Box ([JarvisWin]::Frame($h))) } }
Emit @{ ready = $true }
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $q = $null
  try {
    $q = $line | ConvertFrom-Json
    if ($q.cmd -eq 'at') {
      $h = [JarvisWin]::At([int]$q.x, [int]$q.y, [uint32]$Skip)
      if ($h -eq [IntPtr]::Zero) { Emit @{ id = $q.id; ok = $true; window = $null } } else { Emit @{ id = $q.id; ok = $true; window = (Describe $h) } }
      continue
    }
    $h = [IntPtr][int64]$q.handle
    if (-not [JarvisWin]::IsWindow($h)) { Emit @{ id = $q.id; ok = $false; error = 'That window has closed.' }; continue }
    switch ($q.cmd) {
      'move' {
        if ([JarvisWin]::IsZoomed($h)) { [void][JarvisWin]::ShowWindow($h, 9) }
        $ok = [JarvisWin]::SetWindowPos($h, [IntPtr]::Zero, [int]$q.x, [int]$q.y, [int]$q.w, [int]$q.h, 0x0014)   # keep its place in front of or behind others, don't take the keyboard
        Emit @{ id = $q.id; ok = $ok; window = (Describe $h) }
      }
      'restore' { [void][JarvisWin]::ShowWindow($h, 9); Emit @{ id = $q.id; ok = $true; window = (Describe $h) } }
      'max' { [void][JarvisWin]::ShowWindow($h, 3); Emit @{ id = $q.id; ok = $true; window = (Describe $h) } }
      default { Emit @{ id = $q.id; ok = $false; error = 'Unknown request.' } }
    }
  } catch { Emit @{ id = $(if ($q) { $q.id } else { 0 }); ok = $false; error = $_.Exception.Message } }
}
