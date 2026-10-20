<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project architecture

- Keep this scheduler offline-only: persist operational records in device-local browser storage because the single practitioner must not depend on a network service.
- Keep scheduling constraints in `src/lib/scheduling.ts` and display/data helpers in `src/lib/data.ts` so every booking entry point applies the same rules.
- Book is the only public route; every other route renders through `AdminGate` in `src/lib/lock.tsx` (password hashing and device storage in `src/lib/privacy.ts`), so client or billing records never appear on the public screen. Entering Admin is the only password prompt: every other important action (start a session, record/edit/delete a payment, change hours, block time, correct times, restore a backup) asks "Are you sure?" via `useConfirm`.

- Render a single shared ClientBalances table on Clients & Billing and initiate client payments from ClientBillingDialog, so the directory and payment entry points are not duplicated.
- Read working hours only through `effectiveHours` (backed by `src/lib/availability.ts`, device-local) so weekly hours and per-date changes apply to every booking path.
- Never change appointment status on a timer: no-shows are marked by the practitioner (`canMarkNoShow` / `noShowCharge` in `src/lib/scheduling.ts`), and a fresh install starts with `emptyData()`, never demo records.
- Any new device-storage key holding studio records must be added to `BACKUP_KEYS` in `src/lib/backup.ts` so backups stay complete.
- Offline support lives in `public/sw.js` (registered from `__root.tsx`, production only, never inside the editor iframe). When adding a page, add its path to `ROUTES` in `public/sw.js` so it opens offline.
- Never overwrite a client's balance: corrections are `adjustments` (store) with a reason. Pass `store.adjustments` to `clientBalance` and `buildReport` wherever balances are shown.

## This copy is the public DEMO

- This repo is a Lovable remix of the real Electrolysis Scheduler, used only for demos. It deliberately fills itself with fictional sample records (`src/lib/demo.ts`, switched by `DEMO_MODE`), shows a banner with the Admin password ("demo") and a Reset demo button, and never registers the offline service worker. The rule above about never seeding demo records applies to the real app, not here.
- Never copy this repo's `demo.ts`, `DemoBanner.tsx` or the `DEMO_MODE` wiring in `lock.tsx` / `__root.tsx` back into the real app. Never put real client data here.
