# Rendering the mobile app in a browser

There is no iOS/Android simulator in CI, so the Expo screens are rendered
through `react-native-web` here. It is a *verification harness*, not a shipping
target: it imports `mobile/App.tsx` unchanged and points it at a running
platform API, which is what `scripts/mobile-smoke.mjs` drives.

```
PORT=8791 npm run server &
npx vite --config mobile/verify/vite.config.mts
# open http://localhost:5199/?api=http://localhost:8791
```

`?api=` sets the API base at runtime, the same value the phone gets from
`EXPO_PUBLIC_API_BASE_URL`.
