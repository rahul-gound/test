# One Tap Escape 3D

A production-ready 3D endless runner game built with **BabylonJS** (loaded via CDN). The player runs forward automatically on a floating track in a dark atmospheric environment, jumping over procedurally generated obstacles to survive as long as possible.

## Features

- **Procedural endless track** with object-pooled segments and obstacles
- **Multiple obstacle types**: static hurdles, moving side blocks, rotating bars
- **Custom arcade physics**: gravity, jump impulse, AABB ground & collision detection
- **Smooth third-person camera** with lerp interpolation
- **Responsive UI**: start, pause, game over screens with mobile on-screen jump button
- **Audio**: jump and game-over sounds via Web Audio API (toggleable)
- **Scoring**: distance-based score with localStorage best-score persistence
- **Performance-optimised**: no shadows, no textures, object pooling, frozen materials, minimal draw calls

## How to Run Locally

No build step is required. The game is three static files:

```
index.html
style.css
game.js
```

### Option 1 — Simple HTTP server (Python)

```bash
cd /path/to/project
python3 -m http.server 8000
# Open http://localhost:8000 in your browser
```

### Option 2 — VS Code Live Server

Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension, right-click `index.html` → **Open with Live Server**.

### Option 3 — Node.js

```bash
npx serve .
```

## How to Deploy to GitHub Pages

1. Push `index.html`, `style.css`, and `game.js` to the repository root (or a `docs/` folder).
2. Go to **Settings → Pages** in your GitHub repository.
3. Under **Source**, select the branch (e.g. `main`) and folder (`/ (root)` or `/docs`).
4. Click **Save**. Your game will be live at `https://<user>.github.io/<repo>/`.

## How to Optimise Build Size

| Technique | Details |
|-----------|---------|
| Minify JS | `npx terser game.js -o game.min.js -c -m` |
| Minify CSS | `npx clean-css-cli style.css -o style.min.css` |
| Minify HTML | `npx html-minifier-terser index.html -o index.min.html --collapse-whitespace --remove-comments` |
| Use BabylonJS ES-module tree-shaking | Replace CDN script with `npm install @babylonjs/core` and bundle only used modules with Rollup/Webpack/Vite |
| Enable gzip/brotli on your host | Most static hosts (GitHub Pages, Netlify, Vercel) do this automatically |

## How to Prepare for CrazyGames Submission

1. **Single-folder build** — ensure all assets are relative paths (already the case).
2. **Responsive** — the game scales to any viewport; test in portrait and landscape.
3. **No external requests** — if submitting offline, self-host `babylon.js` instead of using the CDN.
4. **Ad SDK integration** — follow [CrazyGames SDK docs](https://docs.crazygames.com/) to add interstitial/rewarded ad hooks between game-over and restart.
5. **Metadata** — prepare a 512×512 icon, screenshots, description, and category tags.
6. **Test on CrazyGames QA tool** — use their local QA environment before final submission.

## Controls

| Input | Action |
|-------|--------|
| Space / ↑ | Jump |
| Click / Tap | Jump |
| P / Escape | Pause / Resume |
| On-screen button (mobile) | Jump |

## License

MIT