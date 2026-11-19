$node = "$env:LOCALAPPDATA\nodejs-portable\node-v22.16.0-win-x64"
if (Test-Path "$node\npm.cmd") {
  $env:Path = "$node;$env:Path"
}
npm run dev
