# Thunder phone app (iPhone + Android)

Expo (React Native) app in the same repo as the website. It has no database access of its own: every screen calls the
Thunder server's `/api/mobile/*` endpoints, which check the session and role on every request.

- `src/app/` — screens (Expo Router: each file is a screen)
- `src/lib/api.ts` — calls to the server; `src/lib/session.tsx` — login token in the phone's secure storage
- `src/lib/haptics.ts` — the app's haptics (tap, select, success, error)
- `src/components/ui.tsx` — shared card, field, button, message box

## Run it on your phone

1. In the main folder, start the website: `npm run dev`
2. In `mobile/`, check `.env.local` has your Mac's Wi-Fi address: `EXPO_PUBLIC_API_URL=http://192.168.x.x:3000`
3. `cd mobile && npx expo start`, then scan the QR code with the iPhone camera (Expo Go app installed). Phone and Mac on the same Wi-Fi.

Checks: `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`.
