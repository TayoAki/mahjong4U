# Player safety and moderation

Daily Rack lets players message each other (direct chat, table chat, Game Night chat), so the App Store treats it as an app with user-generated content. [App Store Review Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) asks for four things. Here is how each one is met, and what you have to do to keep meeting it after launch.

| Apple asks for | What the app does |
| --- | --- |
| Players agree to terms that make clear there is no tolerance for objectionable content or abusive users | Before the first chat message, friend request or Game Night, players see the **community rules** and tap **I agree**. The server refuses those actions until they have agreed. The rules are on the You tab any time. |
| A way to filter objectionable material | Chat messages, player names and Game Night names and places go through a profanity and slur filter ([obscenity](https://github.com/jo3-l/obscenity), which also catches disguises like `sh1t`). Blocked text is refused with a request to rephrase. |
| A way to report offensive content, with timely responses | Tap any message from someone else, or the **⋯** next to a player (friends list, friend requests, chat header, table seats, Game Night guests), then **Report**. Reports are private. The reported message disappears for the reporter at once, and for everyone once two different players report it. **You must review every report within 24 hours** (see below). |
| A way to block abusive users | The same menus have **Block**. Blocking works both ways: neither player sees the other's messages, they can't send friend requests, join each other's tables or open each other's game nights, and any friendship ends. The blocked player isn't told. Players can unblock on the You tab. |

Two newer features change who can talk to whom, by design:

- **Matched games with strangers** (Quick match and Ranked): players must have agreed to the community rules first, and at those tables they can only send a fixed set of friendly quick phrases ("Good luck!", "Nice hand!" and the like). There is no free text and no voice chat with strangers, which keeps random matchmaking clear of the free-chat-with-strangers rules in Guideline 1.2 and Google Play's chat policy. Blocked players are never matched together, and the report and block menus work on matched tables' seats.
- **Voice chat** only works at private tables, between people seated there (friends or people given the code). The audio goes directly between their devices and isn't recorded or stored. The server only passes along connection setup, and only between seated players who haven't blocked each other. Anyone can mute anyone for themselves, and blocking someone drops them from your call at once. Voice can't be filtered, so it stays limited to tables players set up themselves.

Apple also expects published contact information. The You tab has a **Contact us** form: messages are stored on the server (and sent to `REPORT_WEBHOOK_URL` if set); read them with `ADMIN_TOKEN=... API_URL=... npm run reports feedback`. Set `SUPPORT_EMAIL` on the server too and the form shows that address as well. Use the same address as the support URL on the App Store listing.

## Problem reports

Players tell us about bugs with **Report a problem**: on the You tab, at the bottom of the How to play sheet at any table, and on the screen the app shows if something crashes. They write what went wrong; the app adds the screen they were on, the device, OS and app version, text size, a few settings (large tiles, table sounds, hints) and the last few errors the app ran into. At a table on a phone it also takes a screenshot of the table first, and anywhere they can pick a screenshot from Photos; they see the screenshot, and the full list of details, before sending, and can remove the screenshot. Reports written with no connection are kept on the phone and sent once it's back online. Up to 6 reports an hour per player; screenshots are shrunk to a small JPEG (up to 1.5 MB is accepted) and stored with the report. Deleting your data deletes your reports too.

```bash
ADMIN_TOKEN=... API_URL=https://your-server npm run reports -- bugs            # open problem reports
ADMIN_TOKEN=... API_URL=https://your-server npm run reports -- bugs all        # everything recent
ADMIN_TOKEN=... API_URL=https://your-server npm run reports -- bug <id>        # every detail, and saves the screenshot here
ADMIN_TOKEN=... API_URL=https://your-server npm run reports -- close-bug <id>  # done with it (reopen-bug undoes it)
```

The first 8 characters of an id are enough for `bug`. With `REPORT_WEBHOOK_URL` set, each new problem report posts a one-line alert with the screen, the device and the first 300 characters. Problem reports don't have the 24-hour rule that player reports do, but they're how you'll hear about bugs on phones nobody here has tested on.

For the App Store privacy label and the Play data safety form: problem reports collect diagnostics (crash data and other diagnostic data) and, when a player attaches one, a photo (the screenshot), linked to their guest id and used only to fix the app. Nothing is sent unless the player sends a report.

## Setting it up on the server

| Variable | What it does |
| --- | --- |
| `ADMIN_TOKEN` | A long random secret that unlocks the moderator endpoints. Without it, `/v1/admin` doesn't exist. Generate one with `openssl rand -hex 32`. |
| `REPORT_WEBHOOK_URL` | Optional. A Slack or Discord incoming-webhook URL. Every new report, Contact us message and problem report posts a one-line alert there so you see it quickly. |
| `SUPPORT_EMAIL` | Shown in the app as the contact for safety and support. |

## Reviewing reports

Check reports at least once a day. With the webhook set up, you'll get an alert for each new one.

```bash
ADMIN_TOKEN=... API_URL=https://your-server npm run reports            # open reports
ADMIN_TOKEN=... API_URL=https://your-server npm run reports -- all     # everything recent
ADMIN_TOKEN=... API_URL=https://your-server npm run reports -- resolve <reportId> <action>
ADMIN_TOKEN=... API_URL=https://your-server npm run reports -- unsuspend <playerId>
```

Each report shows the reason, the reporter's note, the exact message text or player name at the time of the report, and how many reports the player has had in total.

| Action | Use it when | What happens |
| --- | --- | --- |
| `dismiss` | Nothing broke the rules | The report closes. A message hidden for the reporter stays hidden for them. |
| `remove-content` | One message broke the rules | The message is hidden for everyone. Other open reports about the same message close too. |
| `suspend` | The player is abusive, or keeps breaking the rules | The message is hidden, **everything the player has written is hidden**, and they can no longer chat, send friend requests, accept requests or join game nights. They can still play the daily rack and play games. |

A suspension can be undone with `unsuspend`. Players who think they were suspended by mistake are told to contact support.

## For App Review

Put this in the review notes so the reviewer can find the features:

> Chat is between friends, players at the same table and Game Night guests. In matched games with strangers (Play > Quick match or Ranked), players can only send preset quick phrases, and there is no voice chat. Voice chat is only available at private tables players set up with friends. Before the first message or friend request, players must agree to the community rules (zero tolerance for objectionable content). Messages, names and Game Night details are filtered. To report or block: tap any message from another player, or the ⋯ button next to a player's name in Friends, a chat, a table or a Game Night. Blocked players are listed on the You tab, where they can be unblocked. We review reports within 24 hours and suspend abusive players.

The reviewer needs a second account to see chat. Two simulators, or a simulator and the web build, each start as their own guest.
