const { spawn } = require('node:child_process');

// Chromium's DOM debugger cannot control a Windows file dialog. This bounded
// fallback is used only after the page's upload control has been activated and
// no usable input exists. The path is passed through the environment so a
// document filename can never become PowerShell source code.
async function chooseNativeFile(filePath, { timeoutMs = 10000 } = {}) {
  if (process.platform !== 'win32' || typeof filePath !== 'string' || !filePath.trim()) return { status: 'unsupported' };
  const script = [
    '$shell = New-Object -ComObject WScript.Shell',
    '$deadline = (Get-Date).AddMilliseconds(10000)',
    'while ((Get-Date) -lt $deadline) {',
    '  if ($shell.AppActivate("Open")) {',
    '    Start-Sleep -Milliseconds 250',
    '    $shell.SendKeys("%n")',
    '    Start-Sleep -Milliseconds 100',
    '    $shell.SendKeys("^a")',
    '    $shell.SendKeys($env:NORTHSTAR_PICKER_PATH)',
    '    Start-Sleep -Milliseconds 100',
    '    $shell.SendKeys("{ENTER}")',
    '    exit 0',
    '  }',
    '  Start-Sleep -Milliseconds 100',
    '}',
    'exit 2',
  ].join('; ');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      env: { ...process.env, NORTHSTAR_PICKER_PATH: filePath },
    });
    let settled = false;
    const finish = (result, error) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(result); };
    const timer = setTimeout(() => { child.kill(); finish({ status: 'timeout', filePath }); }, timeoutMs);
    child.on('error', (error) => finish(null, error));
    child.on('exit', (code) => finish({ status: code === 0 ? 'selected' : 'not_found', filePath, exitCode: code }));
  });
}

module.exports = { chooseNativeFile };
