# Tracewise LinkedIn trailer

30 seconds, 1080 x 1080, silent motion graphics. The final export is H.264 MP4 at 60 fps.

The video follows the approved post's idea: AI can write code, but developers still need the fundamentals. It shows predicting binary search, the actual Dijkstra visualizer, fading code scaffolding, the wider software engineering curriculum, the NeetCode 150 track, and the free/no-login CTA.

The scenes are editable in `compositions/frames/`. `index.html` assembles them. `STORYBOARD.md` documents each beat. All fonts and animation scripts are frozen local assets. Screens are copied from the project's own screenshots, and the logo geometry comes from `src/App.tsx`.

```powershell
npm run check
npm run render -- --quality high --fps 60 --output renders/tracewise-motion-trailer.mp4
npx hyperframes@0.8.152 preview --background
```

`check-report.json` contains the final composition checks. `demo-binary-search.py` verifies the exact algorithm shown in the coding scene against six cases.

The previous trailer in `linkedin/tracewise-trailer.mp4` is preserved. This version is delivered separately as `linkedin/tracewise-motion-trailer.mp4`.
