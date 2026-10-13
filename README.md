# gitmatic

Learn git the practical way, right in your browser. gitmatic is a fully static web app with a
simulated git engine: type real git commands into a terminal and watch the commit graph, the
working tree / staging area / repository strip, and your files update as you go. Everything runs
locally in the browser; nothing is sent anywhere. Live at https://rkdnc9.github.io/gitmatic/.

## Development

Requires Node (see `.nvmrc`) and npm.

```sh
npm install
npm run dev         # start the dev server
npm run build       # type-check and build to dist/
npm run preview     # serve the production build
npm run lint        # ESLint
npm run typecheck   # tsc -b --noEmit
npm test            # unit tests (Vitest)
npm run test:e2e    # end-to-end tests (Playwright; run `npx playwright install chromium` once)
npm run format      # Prettier
```

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml` (repo Settings → Pages →
Source must be "GitHub Actions").
