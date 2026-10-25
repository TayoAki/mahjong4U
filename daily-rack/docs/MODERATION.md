# Player safety and moderation

Daily Rack lets players message each other (direct chat, table chat, Game Night chat), so the App Store treats it as an app with user-generated content. [App Store Review Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) asks for four things. Here is how each one is met, and what you have to do to keep meeting it after launch.

| Apple asks for | What the app does |
| --- | --- |
| Players agree to terms that make clear there is no tolerance for objectionable content or abusive users | Before the first chat message, friend request or Game Night, players see the **community rules** and tap **I agree**. The server refuses those actions until they have agreed. The rules are on the You tab any time. |
| A way to filter objectionable material | Chat messages, player names and Game Night names and places go through a profanity and slur filter ([obscenity](https://github.com/jo3-l/obscenity), which also catches disguises like `sh1t`). Blocked text is refused with a request to rephrase. |
| A way to report offensive content, with timely responses | Tap any message from someone else, or the **⋯** next to a player (friends list, friend requests, chat header, table seats, Game Night guests), then **Report**. Reports are private. The reported message disappears for the reporter at once, and for everyone once two different players report it. **You must review every report within 24 hours** (see below). |
| A way to block abusive users | The same menus have **Block**. Blocking works both ways: neither player sees the other's messages, they can't send friend requests, join each other's tables or open each other's game nights, and any friendship ends. The blocked player isn't told. Players can unblock on the You tab. |

Apple also expects published contact information. Set `SUPPORT_EMAIL` on the server and the You tab shows a **Contact us** link. Use the same address as the support URL on the App Store listing.

## Setting it up on the server

| Variable | What it does |
| --- | --- |
| `ADMIN_TOKEN` | A long random secret that unlocks the moderator endpoints. Without it, `/v1/admin` doesn't exist. Generate one with `openssl rand -hex 32`. |
| `REPORT_WEBHOOK_URL` | Optional. A Slack or Discord incoming-webhook URL. Every new report posts a one-line alert there so you see it quickly. |
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

> Chat is between friends, players at the same table and Game Night guests. Before the first message or friend request, players must agree to the community rules (zero tolerance for objectionable content). Messages, names and Game Night details are filtered. To report or block: tap any message from another player, or the ⋯ button next to a player's name in Friends, a chat, a table or a Game Night. Blocked players are listed on the You tab, where they can be unblocked. We review reports within 24 hours and suspend abusive players.

The reviewer needs a second account to see chat. Two simulators, or a simulator and the web build, each start as their own guest.
