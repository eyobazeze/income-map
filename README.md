# income-map (PWA)

Free stack: React + Vite, MapLibre GL, OpenFreeMap tiles. Real data: U.S. Census ACS (income, rent by tract), Census TIGERweb (boundaries), NYC HPD (affordable housing).

## One-time setup (you, the developer, not your users)
1. Get a free Census key: https://api.census.gov/data/key_signup.html (activate it from the email).
2. In this folder create a file named `.env` containing one line:  `CENSUS_KEY=your_key_here`
3. `npm install`
4. `npm run dev`  (the first run downloads the data into `public/data/`; later runs reuse it)

Users of the finished app never see a key prompt: the data ships with the app.
Refresh the data any time with `npm run data`. When the data format changes (as in this version, which adds neighborhood names), `npm run dev` rebuilds it automatically once.

## Deploy (free)
`npm run build`, then upload `dist/` to Cloudflare Pages or Netlify. Commit or keep `public/data/` so it's included.
