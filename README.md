# AcceleDuck OS (Ducky Accelerator)

A duck-themed desktop OS that runs entirely in the browser: boot screen, lock screen, draggable
windows, and a flock of built-in apps.

## What's inside

- **Proxy Manager** — Scramjet tunnel connect flow with ten pond servers, defaulting to the public
  Mercury Wisp relay (`wss://wisp.mercurywork.shop/`). The SCRAMJET/1 handshake and tunnel page
  loads are real server round-trips; throughput stats are demo-simulated.
- **Duck Browser** — real DuckDuckGo search (instant answers + autocomplete), Wikipedia results,
  Reddit / GitHub / Stack Overflow result tabs, a YouTube portal, Reader mode, and Scramjet tunnel
  loading for pages that won't embed.
- **Ducky AI** — the OS's own streaming assistant.
- **DuckChat** — the Discord-style heart of the OS:
  - public lounge, group servers up to **20 ducks**, direct messages
  - **friends**: add by name, accept/decline requests, online dots, quick message & call buttons
  - **calls**: a public pond call anyone can join, plus **private group calls** locked behind a
    6-character code — paste the code in the code bar and you're in. Ringtone plays (pick a preset
    or upload your own in Settings → Calls).
  - **pics & GIFs**: upload images or paste image links in any channel; a real GIF search picker
  - **PondGuard**, the anti-spam bot: rate limits, duplicate/link/caps detection, strike escalation
    to 60-second mutes — enforced server-side on every message.
  - **8 ranks**: member, trial-mod, moderator, head-mod, trial-admin, admin, head-admin, owner.
    Mutes, bans (account / device), message deletes and rank grants are all enforced server-side;
    nobody can grant themselves powers from the browser.
- **Duckcade** — original mini-games with a shared leaderboard and a server-settled DuckCoins
  economy.
- **CloudPlay** — verified-embeddable web games plus cloud portals as pop-outs.
- **Speed Test, Network Monitor, Duck Terminal, Settings, About**.

## Ranks & moderation

| Rank | Powers | Can act on |
|---|---|---|
| Member | — | — |
| Trial Mod | delete messages | — |
| Moderator | delete, mute, ban | lower ranks |
| Head Mod | delete, mute, ban | mods and lower |
| Trial Admin | delete, mute, ban, unban | head mods and lower |
| Admin | delete, mute, ban, **ip-ban, device-ban**, unban | **mods or lower** |
| Head Admin | everything incl. rank grants | **admins, head mods and lower** |
| Owner | everything | everyone below |

- The **first duck to open the Staff console can claim ownership** (one owner ever).
- Owners/head admins grant ranks from the console or with the chat command:
  `/rank <duck> <rank>` (e.g. `/rank Quack admin`). `/help` lists commands.
- Device bans block the browser, not just the account — signing up again on the same device
  stays banned. IP bans are exposed in the UI, but this runtime provides no caller IPs, so the
  button reports that honestly; device bans are the enforced equivalent.

## Running it

This is a Kliv app (React + TypeScript + Tailwind v4). Open it in the Kliv builder to run the
preview, or serve the built output from any static host after building in the Kliv pipeline.

Server pieces (search, GIFs, tunnel loading, DuckCoins, PondGuard moderation) run as Kliv edge
functions: `duck-web` (public), `scramjet-tunnel`, `duckcoins-house` and `chat-guard`
(authenticated). Their code lives with the app's platform, so the archive alone doesn't run them.

## Deploying the frontend to Vercel

The repo is Vercel-ready: `vercel.json` has the SPA rewrite, and the Tailwind v4 Vite plugin is
wired into `vite.config.ts`, so a fresh `npm install && npm run build` on Vercel produces styled
output.

1. Push this source to GitHub.
2. In Vercel: **Add New → Project**, import the repo. The Vite preset is detected automatically —
   no settings needed.
3. Deploy.

**What works there:** the OS shell — boot, desktop, windows, the arcade, CloudPlay embeds, the
terminal and demo surfaces. **What doesn't:** anything that talks to this app's backend — sign-in
and accounts, chat/friends/calls, DuckCoins, DuckDuckGo search, GIF picker, the Scramjet proxy.
Those live on the Kliv-hosted app (tds-ducky-accelerator-os.kliv.site), not in this bundle.

## Honest limits

- No websockets: chat, presence and call state sync through database polling; embedded games'
  own multiplayer runs on their own servers.
- Call audio is simulated — ringing, codes, presence, mute and leave/join state are real.
- Tunnel loading fetches pages server-side; heavy apps phoning home to many domains may misbehave.
