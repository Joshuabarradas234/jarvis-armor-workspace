$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$results = @()
try {
  $processes = @(Get-Process -Name 'ms-teams','Teams','Zoom' -ErrorAction SilentlyContinue)
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($proc in $processes) {
    $active = $false
    $ended = $false
    foreach ($window in $windows) {
      if ($window.Current.ProcessId -ne $proc.Id) { continue }
      try {
        $controls = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($control in $controls) {
          $label = $control.Current.Name
          if ($control.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $label -match '^(Leave|Leave meeting|Leave call|End meeting|End call)(\b|$)') { $active = $true }
          if ($label.Length -lt 180 -and $label -match "You(?:'ve| have)? left (?:the )?(meeting|call)|(?:meeting|call) (?:has )?ended|Rejoin (?:the )?(meeting|call)") { $ended = $true }
        }
      } catch { $ended = $false }
    }
    $results += @{ id = "desktop:$($proc.Id)"; active = $active; ended = $ended }
  }
} catch { $results = @() }
ConvertTo-Json -InputObject @($results) -Compress
