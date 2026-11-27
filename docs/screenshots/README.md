# Screenshots

The images here are the real app UI rendered with demo data. `shot.html` loads the panel with
[Tauri's IPC mocks](https://v2.tauri.app/develop/tests/mocking/) standing in for the database, and
`frame.html` puts it in an exact 340×560 iframe (and builds the banner).

To regenerate, start `pnpm dev`, then from the repo root (Git Bash):

```bash
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
shoot() { "$EDGE" --headless=new --hide-scrollbars --force-device-scale-factor=$4 \
  --window-size=$2 --virtual-time-budget=5000 \
  --screenshot="$(cygpath -w "$PWD/docs/screenshots/$1")" "http://localhost:1420/docs/screenshots/$3"; }
shoot banner.png         1280,640 "frame.html?view=banner" 1
shoot panel-light.png    340,560  "frame.html?view=single&q=theme%3Dlight" 2
shoot panel-dark.png     340,560  "frame.html?view=single&q=theme%3Ddark" 2
shoot settings.png       340,560  "frame.html?view=single&q=theme%3Ddark%26mode%3Dsettings" 2
shoot export-example.png 552,400  "shot.html?mode=export" 2
```
