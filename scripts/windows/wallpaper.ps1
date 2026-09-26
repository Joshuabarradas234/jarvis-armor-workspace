param([Parameter(Mandatory=$true)][string]$Handle)
$ErrorActionPreference = 'Stop'
# Explorer's WorkerW technique is undocumented and can change across Windows builds.
# Never show the window as an overlay if attaching behind the icons fails.
$source = @'
using System;
using System.Runtime.InteropServices;
public static class DesktopHost {
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls,string title);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string title);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc,IntPtr param);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
  [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SetParent(IntPtr child,IntPtr parent);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h,int i);
  [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h,int i,IntPtr value);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")] public static extern int MapWindowPoints(IntPtr from,IntPtr to,ref RECT rect,uint count);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [StructLayout(LayoutKind.Sequential)] public struct RECT {public int L,T,R,B;}
  public static IntPtr FindHost(){
    IntPtr progman=FindWindow("Progman",null),result;
    if(progman==IntPtr.Zero)throw new Exception("Explorer desktop not available");
    SendMessageTimeout(progman,0x052C,IntPtr.Zero,IntPtr.Zero,2,1000,out result);
    IntPtr worker=IntPtr.Zero;
    EnumWindows(delegate(IntPtr top,IntPtr unused){
      if(FindWindowEx(top,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero){
        worker=FindWindowEx(IntPtr.Zero,top,"WorkerW",null);
      }
      return true;
    },IntPtr.Zero);
    if(worker==IntPtr.Zero)throw new Exception("Compatible WorkerW not found; use the Lively package");
    return worker;
  }
  public static void Attach(IntPtr hwnd){
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    IntPtr host=FindHost(); RECT rect;GetWindowRect(hwnd,out rect);
    long style=GetWindowLongPtr(hwnd,-16).ToInt64();
    SetWindowLongPtr(hwnd,-16,new IntPtr((style & ~0x80000000L) | 0x40000000L));
    SetParent(hwnd,host);
    if(GetParent(hwnd)!=host)throw new Exception("Windows denied desktop attachment");
    MapWindowPoints(IntPtr.Zero,host,ref rect,2);
    SetWindowPos(hwnd,IntPtr.Zero,rect.L,rect.T,rect.R-rect.L,rect.B-rect.T,0x0014);
    ShowWindow(hwnd,4);
  }
}
'@
try {
  Add-Type -TypeDefinition $source
  [DesktopHost]::Attach([IntPtr]([Int64]::Parse($Handle)))
  [Console]::WriteLine('{"attached":true}')
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
