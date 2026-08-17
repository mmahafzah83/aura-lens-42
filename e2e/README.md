# End-to-end specs

These walk the real product in a real browser. They assert **content**, never
that a page merely returned 200.

## Running them

```bash
npm run test:e2e                 # against the preview (the default base URL)
E2E_BASE_URL=https://aura-intel.org npm run test:e2e   # against production
npx playwright test e2e/landing.spec.ts                # one file
npx playwright test --ui                               # watch it walk
```

`E2E_BASE_URL` is the only required knob. `E2E_LINKEDIN_URL` overrides the
public profile the free-journey spec reads (it defaults to a well-known one).

## What is covered today

| spec | path |
|---|---|
| `landing.spec.ts` | the landing hero, the price appearing once, no struck-through price |
| `free-journey.spec.ts` | landing → `/assessment` → a read → the CV screen, and the address staying re-enterable |
| `shared-read.spec.ts` | `/r/:token` — the live read and the revoked state |
| `a11y-375.spec.ts` | 375×812: no horizontal overflow, no tap target under 44px |

All of these are **public and unauthenticated**. The free-journey spec is slow
because a read calls a scraper and a model; give it the timeout it asks for.

## The rule

**Every new user-facing path gets a spec before it ships.** If a stranger can
reach it with a URL, it has a spec here. A path without a spec is a path nobody
is watching.

## Next step — authenticated specs

Nothing here signs in. To cover Home, Intelligence, the Composer and the
publish loop we need:

1. a seeded persona — create a test member in **Admin → Testing** with the
   persona that matches the surface (`read`, `loop_quiet`, `loop_ready`,
   `dormant`), or re-seed an existing test member;
2. a `storageState` — sign in once in a setup project, save the session to
   `e2e/.auth/<persona>.json`, and point the dependent project's
   `use.storageState` at it;
3. a reset between runs — `reset_journey` / `seed_test_member` from the same
   panel, so each run starts from the same account in the same state.

Do not commit `e2e/.auth/`.

## Known exceptions

- **Tap targets.** `a11y-375.spec.ts` measures actions inside the page body.
  Masthead and footer chrome (10px mono links, the sign-in link) is small by
  design and is excluded via `nav, header, footer`. Footer links on the landing
  carry a 44px hit area even though the type is 10px.
- **Price.** The landing repeats "$29" in prose. The spec asserts one *paid*
  headline figure (`.prc .p`) and no strikethrough price anywhere.
- **Cost.** `free-journey.spec.ts` runs one live read. Cached profiles return in
  seconds; a cold profile spends a scrape. Override with `E2E_LINKEDIN_URL`.

Default base URL is `http://localhost:8080`. Point at the preview with
`E2E_BASE_URL=https://…lovable.app`.
