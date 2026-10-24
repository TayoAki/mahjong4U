# IAP / Hybrid Monetization, Game Economy, Live Ops and KPI Benchmarks for Casual Puzzle (Mahjong, Tile-Match, Solitaire, Match-3, Word), 2024–2026

Research date: 2026-10-24. Data period is labeled for every figure. Most "benchmarks" on the open web are vendor or blog summaries. Each figure below is marked as either **[HARD]** or **[EST]**:

- **[HARD]**: a primary dataset (GameAnalytics, AppsFlyer, RevenueCat, Sensor Tower or AppMagic as reported by the firm or a close summary of it), a company filing, or an official policy page.
- **[EST]**: a third-party estimate, a blog figure, an analyst's own valuation, or something derived by me.

Note on method: the shared web-search budget ran out before every lead could be followed. Gaps are listed explicitly in each section. Several key pages (Naavik, Gamigion, the AppMagic casual report) were behind bot-verification walls. Figures from those sources come from search-result excerpts and are flagged as such.

---

## 1. KPI benchmarks (retention, engagement, ARPDAU, payer conversion, ARPPU, LTV; iOS vs Android; US vs RoW; mahjong/tile/solitaire specifics)

### Takeaway
For mobile games overall in 2025, the GameAnalytics medians were D1 about 22%, D7 just under 4% and D30 under 1%. The top decile reached D1 about 40% and D7 11–12%. Leading puzzle titles do far better: Sensor Tower estimates Candy Crush at D1 40%, D7 23% and D30 12.5%. A mahjong game should therefore target top-decile numbers, not the median.

On monetization, the clearest primary figures are AppsFlyer's casual-game D90 numbers: IAP ARPU $1.34, ARPPU $7.26 and ad ARPU $0.55. That implies roughly 70/30 IAP/ads for casual, and ads are a much larger share outside the US. Ad-first mahjong (Vita Mahjong) is now one of the top three ad earners in all of mobile.

### Cited Findings

**Retention and engagement: all genres (GameAnalytics, 2025 data, published as "2026 Benchmarks")** [HARD]
- Scope: 16,000+ mobile games with 1,000+ MAU, iOS and Android combined, all genres. GameAnalytics says genre-level benchmarks are unavailable this cycle, and the mobile data is not split by OS — [GameAnalytics 2026 Benchmarks](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)
- D1 retention: median ~22%; P75 just above 30%; P90 ~40%; P99 64–68% (D1 declined in 2025 vs 2024) — [GameAnalytics](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks); [GameDevReports summary](https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game)
- D7 retention: median just under 4%; P75 6–7%; P90 11–12%; P99 >25% (sometimes ~28%) — [GameAnalytics](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)
- D30 retention: median 0.68–0.79%; P75 1.6–1.8%; P99 13–15%. P90 is not stated — [GameAnalytics](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)
- Session length: median 3.1–3.5 min; P75 ~5.2 min; P90 just over 8 min; P99 >22 min — [GameAnalytics](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)
- Sessions per day: median 3.8–3.9; P75 5.3–5.7; P90 ~9.6 in some months; P99 >12 — [GameAnalytics](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)
- Daily playtime per user: median ~12 min; P75 22–24 min; P90 40–42 min; P99 >94 min — [GameAnalytics](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)
- Regional medians, 2025:
  - D1: Oceania 25.63%, North America 23.28%, Europe 22.20%, Africa 18.52%, Asia 17.50%
  - D7: Africa and Oceania 5.60%, North America 4.97%, Europe 4.06%, Asia 2.68%
  - D30: Oceania 1.39%, North America 1.18%, Europe 0.92%, Asia 0.53%
  - Source: [GameAnalytics](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)

**Earlier edition (2024 data)** [HARD, via summary]
- Median D7 was 3.42–3.94% and top-25% D7 was 7–8% — [GameDevReports summary of GameAnalytics 2025 benchmarks](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)
- iOS vs Android: top-quartile D1 was about 31–33% on iOS versus 25–27% on Android — [GameDevReports](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)
- Puzzle games were among the best genres for medium- and long-term retention. The excerpt gave no puzzle-specific number — [GameDevReports](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)

**Top puzzle titles (Sensor Tower estimates, reported in H1 2026 summary)** [EST: Sensor Tower panel estimates]

| Title | D1 | D7 | D30 | D180 |
|---|---|---|---|---|
| Block Blast! | 53.5% | 33.4% | 21.7% | 7.93% |
| Gossip Harbor | 44.7% | 20% | 10.8% | 4.81% |
| Candy Crush Saga | 39.9% | 22.6% | 12.5% | 4.44% |

- Source: [GameDevReports: Sensor Tower H1'26](https://gamedevreports.substack.com/p/sensor-tower-the-gaming-market-in)

**Older genre data (label: 2022)**
- Casual puzzle on Android, from AppsFlyer Q3 2022 genre data: D1 28–32%, D7 9–12%, D30 3.5–5%. This is second-hand and dated — [GameGrowthAdvisor citing AppsFlyer](https://gamegrowthadvisor.com/blog/2026-03-17-mobile-game-retention-strategies-2026/)
- A frequently quoted "40% D1 target" may be folklore. GameGrowthAdvisor argues it does not appear in published data — [GameGrowthAdvisor](https://gamegrowthadvisor.com/blog/2026-03-17-mobile-game-retention-strategies-2026/)
- One third-party page lists puzzle D1 31.85% and D30 5.35% with no clear source. Treat it as unverified — [DigitalMinds](https://digitalmindsbpo.com/blog/mobile-game-retention-benchmarks/)

**Monetization: ARPU, ARPPU and ads (AppsFlyer State of App Monetization 2026; data Jan 2025–Mar 2026)** [HARD]
- Casual D90 IAP ARPU: $1.34 (midcore $2.13, casino $2.43) — [GameDevReports summary of AppsFlyer 2026](https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026); [AppsFlyer report page](https://www.appsflyer.com/resources/reports/app-marketing-monetization-report/)
- Casual D90 IAP ARPPU: $7.26 (midcore $9.80, casino $11.40) — [GameDevReports/AppsFlyer](https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026)
- Casual D90 ad (IAA) ARPU: $0.55, the highest of any genre listed (casino $0.47, midcore $0.40, hypercasual $0.22) — [GameDevReports/AppsFlyer](https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026)
- Casual first-to-repeat payer ratio is 1.89x, where lower is better (midcore 1.76x, casino 1.65x) — [GameDevReports/AppsFlyer](https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026)
- Paid UA generates 61% of casual IAP revenue — [GameDevReports/AppsFlyer](https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026)
- First-purchase conversion across all apps (not games only): North America 11.14% vs LATAM 6.51% — [GameDevReports/AppsFlyer](https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026)
- Casino games convert 4.95% of new installs into payers. No equivalent casual figure was surfaced — [AppsFlyer via search excerpt](https://www.appsflyer.com/resources/reports/app-marketing-monetization-report/)

**Monetization: ARPDAU and title-level** [EST unless noted]
- IAP ARPDAU in 2025: Royal Match $0.17, Candy Crush Saga $0.11, Gossip Harbor $0.31 (almost double its nearest competitors). Seen in search excerpts attributed to Naavik; the full page was blocked by bot verification — [Naavik: What Leading Match-3 & Merge Games Do Differently](https://naavik.co/digest/what-leading-match-3-and-merge-games-do-differently/)
- Gossip Harbor is estimated to earn 15–20% of revenue from ads, a counterexample to IAP-only merge — [Naavik (search excerpt)](https://naavik.co/digest/what-leading-match-3-and-merge-games-do-differently/)
- Median IAP ARPDAU across all games: $0.018 in 2022, falling to $0.015 in 2023 (Unity Gaming Report 2024, 2023 data) — [games.gg summary of Unity 2024 Gaming Report](https://games.gg/ko/news/everything-you-need-to-know-about-the-2024-unity-gaming-report/)
- Blog ranges for "casual/puzzle hybrid" ARPDAU vary and have no primary source: $0.08–0.12, $0.08–0.25 and $0.03–0.10. Hybrid-casual is put at $0.15–0.50 and ads-only casual at $0.01–0.05. **Low reliability** — [Juego Studio](https://www.juegostudio.com/blog/arpdau-benchmarks-by-game-genre); [GameGrowthAdvisor hybrid guide](https://gamegrowthadvisor.com/blog/2026-06-02-hybrid-monetization-mobile-games-iap-ads-guide-2026/)
- Casual puzzle ARPPU of "$8–15 monthly," attributed second-hand to GameAnalytics 2025. Unverified — [search excerpt via GameGrowthAdvisor / Juego Studio](https://gamegrowthadvisor.com/blog/2026-04-02-f2p-monetization-models-comparison-2026/)
- General payer-conversion folklore of "2–5% of players," not genre-specific — [AppFollow 2026 KPI guide](https://appfollow.io/blog/mobile-game-kpis)
- AppMagic 2025, US top-10 grossing puzzle: ARPPU declined slightly on both platforms, and purchase frequency among payers fell on the App Store. Numbers not extracted — [AppMagic Monetization Report 2025 (summary)](https://gamedevreports.substack.com/p/appmagic-mobile-games-monetization)

**Ads vs IAP by country (Sensor Tower, 19 countries, Jan–May 2026)** [HARD/EST: Sensor Tower modeled]
- Ads were 22.1% of mobile game revenue in the USA and 70.3% in India — [Game World Observer](https://gameworldobserver.com/2026/07/06/in-2025-mobile-game-advertising-revenue-exceeded-12-billion-analytics)
- Mature markets (US, Canada, South Korea, Japan): IAP is 77–90% of revenue. Growth markets (India, Indonesia, Brazil): ads are about 55–70% — [GameDevReports: Sensor Tower ad monetization 2026](https://gamedevreports.substack.com/p/sensor-tower-mobile-game-ad-monetization)
- Share of mobile games with ad monetization rose from 45.1% (Jul 2021) to 55.6% (May 2026) — [Game World Observer](https://gameworldobserver.com/2026/07/06/in-2025-mobile-game-advertising-revenue-exceeded-12-billion-analytics)

**Subscriptions in gaming (RevenueCat State of Subscription Apps 2026, mostly 2025 data)** [HARD]
- Scope: the "Gaming" bucket includes Games, Puzzle, Casual, Word, Board and similar categories — [RevenueCat SOSA 2026 Gaming](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)
- Download-to-paid (D35): median 1.0%, the lowest category; top quartile >2.3% — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)
- Download-to-trial (D30): 4.4% median — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)
- Trial-to-paid: 25.0% median; top quartile >39.8% — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)
- Subscription revenue per install: D14 $0.08 median and D60 $0.14 median, both the lowest category — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)
- Realized LTV per payer: month 1 $8.41 median; year 1 $11.22 median — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)
- Gaming shows "notably lower" subscriber retention than media, travel and shopping on both monthly and annual plans (2025 report) — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025)

**Mahjong- and solitaire-specific data** [EST]
- Vita Mahjong ad revenue: $89.8M for Jan–May 2026, #2 in all of mobile gaming behind Block Blast! ($127M) and ahead of Candy Crush Saga ($81.1M). Sensor Tower, 19 countries — [Game World Observer](https://gameworldobserver.com/2026/07/06/in-2025-mobile-game-advertising-revenue-exceeded-12-billion-analytics)
- Vita Mahjong ad revenue rose from $38M to $90M year over year — [GameDevReports: Sensor Tower ad monetization](https://gamedevreports.substack.com/p/sensor-tower-mobile-game-ad-monetization)
- Vita Mahjong download claims: 100M+ on Google Play (Balancy, Jun 2025), and a third-party estimate of $150K+/day ad revenue on ~400K daily downloads (unnamed source) — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/)
- A separate estimate puts Vita Mahjong at ~$55M/yr. Estimates conflict — [Felix Braberg Substack (search excerpt)](https://felixbraberg.substack.com/p/vita-mahjong-game-review-ads-in-gaming-1b4)
- Other ad-revenue leaders, Jan–May 2026: Solitaire Associations Journey $73.3M; Wordscapes $42.6M. Solitaire (hypercasual) ad revenue grew by $64M — [GameDevReports: Sensor Tower](https://gamedevreports.substack.com/p/sensor-tower-mobile-game-ad-monetization)
- Solitaire Grand Harvest (Playtika) revenue: $77M (2019), $230M (2021) and $303M (2024). Bought in 2019 for $174M including earnouts [HARD: company investor presentation] — [Playtika Investor Presentation, March 2025](https://investors.playtika.com/static-files/23bcd180-ca4f-40f2-b3ac-5237ff086280)
- Naavik puts Solitaire Grand Harvest's US "revenue per daily user" at ~$31, behind only Royal Match and Bingo Blitz. The metric definition is unclear: it is likely revenue per DAU over a long window, not a daily ARPDAU. Seen only via search excerpt — [Naavik: Disney Solitaire](https://naavik.co/digest/disney-solitaire-the-hype-around-solitaire-demystified/)

### Inferences
- **Casual revenue split.** AppsFlyer's casual D90 split is $1.34 IAP plus $0.55 ads, about 71% IAP and 29% ads. That matches blog claims of "puzzle ~70% IAP / 30% ads." For an older, US-heavy mahjong audience, expect a higher IAP share in the US and a far higher ad share in RoW, per Sensor Tower's 10–23% vs 55–70% ad shares.
- **Implied payer share looks too high.** Dividing AppsFlyer's casual D90 ARPU by ARPPU gives about 18% payers. That is far above the usual 2–5%, so the two metrics probably use different denominators (for example, ARPU computed only over users in IAP-enabled apps, or cohort definitions that differ). **Do not use 18% as a payer rate.** Model 2–5% D90 payer conversion for a good hybrid casual title until you have your own data.
- **Soft-launch go bar (my inference).** A reasonable bar for a new mahjong/tile game sits between GameAnalytics' P90 and the leading puzzle titles' Sensor Tower estimates:

  | Metric | Go bar |
  |---|---|
  | D1 | ≥35–40% |
  | D7 | ≥10–12% |
  | D30 | ≥4–6% |
  | Daily playtime | ≥25–40 min |
  | Sessions/day | ≥5 |

  This is not a published benchmark.
- **Why the two retention sources differ.** GameAnalytics and Sensor Tower measure retention differently. GameAnalytics uses SDK-measured cohorts across many small games; Sensor Tower uses panel estimates of large titles. Do not compare the numbers one-to-one.
- **Ad-heavy designs need a fat engagement tail.** Vita Mahjong shows that an ad-first mahjong design can earn about $200M+/yr annualized in ads (inferred from $89.8M in 5 months, 19 countries). That needs very large DAU, so ad-heavy designs depend on high sessions and playtime per day.

### Gaps
- I found no published 2024–2026 primary benchmark for mahjong- or tile-match-specific retention, ARPDAU, payer conversion, or LTV curves (D30/D90/D365). GameAnalytics suspended genre benchmarks this cycle.
- I found no reliable primary iOS vs Android split for ARPDAU or LTV in puzzle. The only platform split surfaced is top-quartile D1 for 2024 (iOS 31–33% vs Android 25–27%).
- I found no eCPM benchmarks (interstitial, rewarded, banner) by country for puzzle. These are needed to model ad ARPDAU as impressions per DAU × eCPM.
- LTV D30/D90/D365 curves for hybrid puzzle were not found in a primary source.

---

## 2. IAP and feature design in tile-match / mahjong / solitaire / match-3: what to sell and which features drive revenue

### Takeaway
Two monetization archetypes dominate.

1. **Ad-first, low-friction mahjong (Vita Mahjong).** No lives or timers. Interstitials after almost every level from session 2. Rewarded videos for Hint and Shuffle. A single ~$6–7 Remove Ads IAP.
2. **IAP-first "lives + boosters + meta + events" (Royal Match, Tile Busters, Solitaire Grand Harvest).** Lives with coin refills. Pre-level and in-level boosters. A renovation or collection meta. A monthly ~$9.99 battle pass with an 8-life cap and infinite-life rewards. Streak or "strike" events, a piggy-bank-style Bonus Bank, PvP duels as coin sinks, and frequent time-limited offers.

Sources credit the renovation meta, difficulty tuning and live ops for Royal Match's revenue, not novel core mechanics.

### Cited Findings

**Vita Mahjong (the dominant mahjong reference), as of Jun 2025** [EST: analyst teardown]
- First session has no ads, banners or interstitials — [Balancy teardown](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/)
- A "No Ads" offer at €6.99 is shown in the first session and is easy to ignore — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/)
- Another review cites a barely promoted $5.99 Remove Ads IAP — [Felix Braberg Substack (search excerpt)](https://felixbraberg.substack.com/p/vita-mahjong-game-review-ads-in-gaming-1b4)
- From session 2, interstitials run after nearly every level, at about a 1:1 ad-to-gameplay ratio. Short event stages (10–15 seconds) also trigger them. Players who play slowly see fewer ads — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/)
- Rewarded videos unlock Shuffle and Hint boosters, double post-level rewards, and give optional enhancements — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/)
- No lives, timers or hard gates; the difficulty curve is smooth. Most levels can be beaten without boosters, and harder stages nudge players toward rewarded video — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/)
- Live ops: daily leaderboard events with themed tile hunts, and a 100-level sticker collection — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/)
- Ad frequency is the main player complaint — [search excerpts: Felix Braberg](https://felixbraberg.substack.com/p/vita-mahjong-game-review-ads-in-gaming-1b4)

**Royal Match (IAP-first reference)** [EST: analyst teardown, Dec 2024 Winter Pass]
- Royal Pass basics:
  - $9.99, the same price point across regions with charm pricing
  - Month-long, 30 tiers, 80 rewards (30 free, 50 premium)
  - Advanced through a pass currency called Keys
  - Source: [GameMakers: Royal Match's $219 Battle Pass Secret (Jan 2025)](https://www.gamemakers.com/p/royal-matchs-219-battle-pass-secret)
- Pass benefits:
  - Raises max lives from 5 to 8 and grants Infinite Lives of 15–60 minutes
  - Premium track has about 10x more life-system rewards than free
  - Includes TNT, Rockets and Light Ball start boosters and Arrow, Cannon, Jester Hat and Royal Hammer in-game boosters
  - Source: [GameMakers](https://www.gamemakers.com/p/royal-matchs-219-battle-pass-secret)
- Claimed value of the pass is $219 (109,940 coins valued at the 1,000-coins-for-$1.99 rate), about a 95% discount. One life is valued at 180 coins because 5 lives cost 900 coins — [GameMakers](https://www.gamemakers.com/p/royal-matchs-219-battle-pass-secret)
- "Bonus Bank" (a piggy-bank analogue): 10 keys earn 100 coins, capped at 5,000 coins, claimable after the event — [GameMakers](https://www.gamemakers.com/p/royal-matchs-219-battle-pass-secret)
- Royal Pass unlocks at level 37 and must be purchased for extra rewards [HARD: official help center] — [Dream Games Help Center](https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/112-royal-pass/)
- The UK App Store lists Royal Pass at £9.99 and a Mini Coin Package at £1.99 — [App Store UK listing](https://apps.apple.com/gb/app/royal-match/id1482155847)
- Boosters are either pre-game (Rockets, TNT, Light Ball, randomly placed before the level) or in-game (Royal Hammer, Arrow, Cannon, Jester's Hat). The Teams system gives collaborative team rewards — [Wikipedia: Royal Match](https://en.wikipedia.org/wiki/Royal_Match)
- Revenue: AppMagic reported $788M in H1 2025, up 15% YoY. Full-year 2025 IAP is estimated at ~$1.4B (Naavik) or $1.37B (Galaxy4Games) [EST] — [AppMagic casual report H1 2025 (search excerpt)](https://appmagic.rocks/research/casual-report-h1-2025); [Galaxy4Games](https://galaxy4games.com/en/knowledgebase/blog/why-match-3-games-are-still-one-of-the-most-profitable-mobile-genres)
- Naavik credits Royal Match's success to its castle-renovation meta, live ops and a precisely tuned difficulty curve, not new matching mechanics — [Naavik: The Royal Blueprint (search excerpt)](https://naavik.co/digest/why-dream-games-success-is-a-challenge-to-replicate/)
- Royal Match and Candy Crush account for more than half of match-3 revenue. Without them, match-3 grew only ~1% YoY in H1 2025 — [AppMagic (search excerpt)](https://appmagic.rocks/research/casual-report-h1-2025)

**Tile Busters, Spyke Games (tile-match plus a social-casino-style meta), analysis from Jan 2024** [EST: designer teardown]
- Offers:
  - Starter offer and a first-session time-limited offer pack
  - Three-slot rotating offers and chain offers with free slots
  - Random themed discount packs
  - Source: [PocketGamer.biz: Deconstructing Tile Busters](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- Coin sinks: duels (50-coin entry, 100-coin prize), extending levels, and avatars. Avatar packs of 10 cost 2,500–3,000 coins or €11–25 — [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- Meta: hammers from levels build 5 spots × 3 upgrades per themed location (England, San Francisco, Thailand) — [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- "Strike" streak event: 120 tiers, up from 50 earlier. Royal Match's similar event has 10 tiers, down from 20. Players keep a strike alive with ads, tricks or coins — [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- Instant Duel PvP acts as a coin sink. Strikes of 5+ multiply token rewards 10x — [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- Entered the US iOS top-50 grossing in Sept 2023. Revenue grew while installs declined, suggesting UA was optimized for payers. The audience is mostly female and 35+ — [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)

**Solitaire Grand Harvest / Disney Solitaire**
- On the Q4 2025 earnings call, Playtika management named Solitaire Grand Harvest among the casual franchises benefiting from live ops and rising direct-to-consumer revenue — [Investing.com transcript](https://www.investing.com/news/transcripts/earnings-call-transcript-playtika-q4-2025-results-miss-eps-forecast-93CH-4528204)
- Naavik argues Disney Solitaire is largely Solitaire Grand Harvest with Disney IP, sharing its core levels and economy — [Naavik (search excerpt)](https://naavik.co/digest/disney-solitaire-the-hype-around-solitaire-demystified/)

**Microsoft Solitaire Collection**
- Premium subscription is $1.99/month or $9.99/year on mobile, removing ads and adding extras. Date of listing price not verified — [App Store listing](https://apple.co/2gCnkVc)
- 2015 Windows pricing was $1.49/30 days or $9.99/year [label: 2015] — [Windows Central](https://windowscentral.com/microsoft-solitaire-collection-premium-edition-gets-free-week-trial-windows-10); [TweakTown](https://www.tweaktown.com/news/46779/windows-10-makes-pay-remove-ads-solitaire/index.html)

**Zen Match, Tile Master**
- No rigorous teardown was found. One unverified review aggregator claims Zen Match moved to aggressive short-term monetization, and that removing a room-decorating feature upset users and raised uninstall intent. **Opinion, low reliability** — [marlvel.ai](https://marlvel.ai/intel-report/games/com-exoticmatch-game)

**Feature analyses (Liftoff / GameRefinery)**
- 2025 Casual Gaming Apps Report (data Feb 2024–Feb 2025): hybrid puzzle revenue +240% over 12 months; "match-3 is making a comeback." Hybrid-casual models are spreading, with less-intrusive ad formats. The full feature-by-feature revenue breakdown is gated — [Liftoff 2025 Casual Gaming Apps Report](https://liftoff.ai/2025-casual-gaming-apps-report/); [PR Newswire](https://www.prnewswire.com/news-releases/28-of-casual-game-installs-from-non-gaming-publishers-come-from-utility-apps-liftoffs-casual-gaming-apps-report-reveals-302441607.html)
- 2024 edition (data Jan 2023–Jan 2024): 3D match games grew 411% in US iOS top-500-grossing market share — [GameDevReports: Liftoff & GameRefinery Casual Games 2024](https://gamedevreports.substack.com/p/liftoff-and-gamerefinery-casual-games)
- AppMagic: Match 3D revenue fell 12% YoY to $193M in 2025 — [AppMagic / search excerpt](https://appmagic.rocks/research/casual-report-h1-2025)

**Market context for puzzle** [HARD/EST: Sensor Tower modeled]
- 2025 puzzle IAP revenue grew 14% YoY, behind strategy at +20%. Royal Match was #1, and Gossip Harbor had the largest uplift — [Sensor Tower State of Gaming 2026](https://sensortower.com/blog/state-of-gaming-2026); [PDF](https://investgame.net/wp-content/uploads/2026/02/2026-02-26-sensor_tower__state_of_gaming_2026__en_wp.pdf)
- H1 2026 puzzle:
  - IAP $8.07B (+~20% YoY), second only to strategy at $9.27B
  - 5.07B downloads and 39.33B hours played
  - Match Merge 2 nearly doubled to $1.91B; Match Swap plateaued at $1.81B in Q2 2026
  - US puzzle IAP grew +$353M, the largest gain of any market
  - Source: [GameDevReports: Sensor Tower H1'26](https://gamedevreports.substack.com/p/sensor-tower-the-gaming-market-in)
- Puzzle is 53% of mobile-game ad revenue ($2.65B, Feb–Apr 2026). Block is ~10%, and Match Pair, Sort and Match Swap are ~7% each. Match Pair (hypercasual) ad revenue grew by $105M — [GameDevReports: Sensor Tower ad monetization](https://gamedevreports.substack.com/p/sensor-tower-mobile-game-ad-monetization)

**Hybrid and subscription mix**
- Gaming leads hybrid models: 61.7% of gaming subscription apps mix subscriptions with consumables or lifetime purchases (2025 report) — [Subscription Insider on RevenueCat SOSA 2025](https://www.subscriptioninsider.com/article-type/news/revenuecats-state-of-subscription-apps-2025-report-ais-dominance-retention-challenges-and-the-shift-away-from-pure-subscriptions)
- 2026 mix for gaming: 40.5% subs-only, 27.5% subs + consumables (the highest of any category), 9.6% all three. Lifetime plans appear in 18% of gaming paywalls — [RevenueCat SOSA 2026 Gaming](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)
- Unity 2024 Mobile Growth & Monetization report: 1 in 3 IAP buyers make a repeat purchase, ~27% of them within 30 days. Offerwall users show 2–7x higher retention — [Global Games Forum on Unity 2024 report](https://globalgamesforum.com/news/unity-release-2024-mobile-growth-monetization-report)
- Blog claim with no primary source: battle passes convert 12–18% of active users per season vs 2–5% IAP conversion. **Low reliability** — [GameGrowthAdvisor](https://gamegrowthadvisor.com/blog/2026-04-02-f2p-monetization-models-comparison-2026/)

### Inferences
- **Two viable models for mahjong:**
  - **(A) Vita-style ad-first.** No lives, rewarded Hint/Shuffle, interstitial per level after session 1, Remove Ads at ~$5.99–6.99. This is lower-friction, suits older audiences and works at massive scale, but depends heavily on ad DAU and eCPM.
  - **(B) Hybrid.** Keep (A)'s ad layer for non-payers, and add a coin economy (Hint/Shuffle/Undo/extra-move boosters), a collection or decoration meta, a ~$4.99–9.99 monthly pass, a piggy bank (Bonus Bank analogue), and streak events.
- **Revenue ranking is a judgment call.** No primary source quantifies revenue share by feature for tile-match/mahjong. Based on the Royal Match and Tile Busters teardowns, the likely largest drivers in an IAP-first design are lives/continues + boosters (the core spend loop), the monthly pass, and streak events that create spending pressure. Cosmetics (tile skins, avatars) are secondary. Tile Busters notes even customization is heavily monetized.
- **Remove-ads behavior.** Remove-ads in mahjong is typically one-time and sits around $5.99–6.99 (Vita). Solitaire's main subscription comparable is Microsoft's $1.99/mo or $9.99/yr Premium. A small team could test both: a one-time remove-interstitials purchase versus a "VIP" subscription that bundles ad-removal with daily coins and boosters.
- **Avoid hard gates for older players.** Vita Mahjong reached the top by avoiding lives and timers, and Zen Match's negative sentiment centers on aggressive monetization. For a relaxation-focused audience, lives may hurt retention more than they help revenue. A/B test a soft-energy or no-lives variant.

### Gaps
- I could not access the GameRefinery feature-level revenue-impact data (for example, % of top-grossing tile games with battle pass, piggy bank or team features). It is gated.
- No Deconstructor of Fun teardowns for Royal Match, Tile Busters, Zen Match, Tile Master or Vita Mahjong were retrieved within the search budget.
- I found no public data on revenue share by SKU (boosters vs lives vs pass vs remove-ads) for any tile or mahjong game.
- Microsoft Solitaire Collection's current (2026) pricing and its revenue were not verified.

---

## 3. Price points, pack ladders, regional pricing; subscription vs one-time remove-ads

### Takeaway
Observed anchors:

| Product | Observed price |
|---|---|
| Smallest coin pack | $1.99 / £1.99 |
| Battle pass | $9.99 / £9.99, uniform charm price |
| Large coin packs | up to ~$99 (CAD 129) |
| Remove ads (Vita Mahjong) | €6.99 or $5.99 |
| Solitaire premium subscription | $1.99/mo or $9.99/yr |
| Gaming subscriptions (RevenueCat medians) | $5.81/wk, $4.99/mo, $24.99/yr |

Gaming subscriptions are the cheapest category, with the lowest conversion and LTV.

### Cited Findings
- **Royal Match coin ladder** [EST]:
  - 1,000 coins for $1.99 and 5,000 coins for $7.99
  - A reader comment reports the top pack is 100,000 coins for CAD $129 (~$99 USD)
  - Pass is $9.99, uniform across regions with charm pricing
  - Source: [GameMakers](https://www.gamemakers.com/p/royal-matchs-219-battle-pass-secret)
- Royal Match UK App Store IAP list includes Royal Pass at £9.99 and Mini Coin Package at £1.99 [HARD: store listing] — [App Store UK](https://apps.apple.com/gb/app/royal-match/id1482155847)
- One analysis (~644 days old at search time) reports Royal Match's cost is uniform across geographies [EST, possibly dated] — [Udonis Royal Match analysis (search excerpt)](https://www.blog.udonis.co/mobile-marketing/mobile-games/royal-match-analysis)
- Vita Mahjong No Ads is €6.99 (Balancy, Jun 2025) or $5.99 (Substack). The two may reflect region or time — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/); [Felix Braberg (search excerpt)](https://felixbraberg.substack.com/p/vita-mahjong-game-review-ads-in-gaming-1b4)
- Tile Busters avatar packs cost €11–25 through the bank [EST] — [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- Microsoft Solitaire Collection Premium is $1.99/mo or $9.99/yr on mobile — [App Store listing](https://apple.co/2gCnkVc)
- **Gaming subscription medians (2025 data)** [HARD] — [RevenueCat SOSA 2026 Gaming](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming):
  - Weekly ~$5.81, which is higher than the monthly price
  - Monthly $4.99, the lowest of any category
  - Yearly ~$24.99
  - Weekly plans are ~82% of gaming subscriptions sold; yearly is 13%. The page is internally inconsistent on the weekly figure
  - 73.3% of trials are ≤4 days
- **Price vs retention and conversion (RevenueCat 2025, all categories)** [HARD/EST: summary of report]
  - Cheap annual plans retain up to 36% after a year, while high-priced monthly plans retain 6.7%
  - Higher-priced apps show better D35 conversion: median 2.7% vs 1.5% for low-priced apps
  - 80% of trial starts happen on Day 0
  - Source: [Subscription Insider](https://www.subscriptioninsider.com/article-type/news/revenuecats-state-of-subscription-apps-2025-report-ais-dominance-retention-challenges-and-the-shift-away-from-pure-subscriptions); [RevenueCat blog](https://www.revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch)
- **Regional (all categories, not gaming-specific)**: D14 revenue per install is $0.38 in North America vs $0.08 in India/SEA — [RevenueCat SOSA 2026 Gaming page](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)

### Inferences
- **Starter ladder for a mahjong hybrid (an inference built from the observed anchors, not a benchmark):**

  | SKU | Price |
  |---|---|
  | Coin packs | $1.99 / $4.99 / $9.99 / $19.99 / $49.99 / $99.99 |
  | Starter pack (first-session or early, time-limited, as Tile Busters does) | $1.99–4.99 |
  | Remove Ads, one-time | $5.99–6.99 (Vita's anchor) |
  | Monthly pass | $4.99–9.99 |
  | Optional "VIP" subscription | $4.99/mo or $24.99–29.99/yr (RevenueCat gaming medians) |

- **Regional pricing.** Apple and Google auto-convert USD tiers. Royal Match seems to keep a uniform charm price per currency (£9.99, $9.99) rather than purchasing-power discounts. Lower-income regions are mostly monetized via ads anyway (Sensor Tower: ads are 55–70% of revenue in India, Indonesia and Brazil).
- **Remove-ads economics.** Gaming subscriptions have the lowest download-to-paid rate (1.0%) and year-1 LTV per payer ($11.22). A one-time remove-ads purchase at ~$6 is roughly half of a typical subscriber's first-year value. It also risks removing a high-value ad viewer, so price it with your ad ARPDAU in mind. **Expected payback:** if a heavy player's ad revenue exceeds about $6 over their lifetime, a $5.99 remove-ads is underpriced. A common mitigation is to remove interstitials only and keep rewarded ads. This is my inference; no source quantified it.

### Gaps
- I found no published A/B results comparing a remove-ads subscription with one-time remove-ads ($2.99 vs $5.99 vs $9.99) in puzzle games.
- I found no data on regional price-elasticity for puzzle IAP, or on how many tiers top tile games use.

---

## 4. Live-ops cadence, level pipelines (incl. procedural/solvable mahjong generation), difficulty and its effect on monetization and churn

### Takeaway
Public data shows these cadences:

- **Daily:** leaderboard and tile-hunt events (Vita)
- **Monthly:** battle passes (Royal Match)
- **Continuous:** streak/"strike" events, from 10 tiers (Royal Match) to 120 tiers (Tile Busters)
- **Rotating:** offers

For mahjong, the established technical approach is to generate only solvable boards. One common method builds the board from a solution path. Difficulty can be measured by how often a solver succeeds, or by the number of winning paths. A smooth difficulty curve with occasional harder "nudge" levels is what the top mahjong title uses.

### Cited Findings
- Vita Mahjong: smooth difficulty curve, no lives, timers or hard gates. Most levels are beatable without boosters, and harder stages nudge players toward rewarded videos. Daily leaderboard events use themed tile hunts, and there is a 100-level sticker collection — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/)
- Royal Match: month-long Royal Pass; Teams with collaborative rewards; a streak event of 10 tiers (down from 20) — [GameMakers](https://www.gamemakers.com/p/royal-matchs-219-battle-pass-secret); [Wikipedia](https://en.wikipedia.org/wiki/Royal_Match); [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- Tile Busters:
  - Strike event of 120 tiers, with rewards every fifth level per tier
  - Global and local leaderboards; PvP duels
  - Easy early levels; later strike levels described as "stressful," which creates spending pressure
  - Source: [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- Naavik attributes Royal Match's edge partly to a more precisely tuned difficulty curve and live ops — [Naavik (search excerpt)](https://naavik.co/digest/why-dream-games-success-is-a-challenge-to-replicate/)
- **Mahjong solvability and generation:**
  - Most computer implementations generate only solvable boards; some build the board from a solution path — [Mahjong Online 365 FAQ](https://www.mahjongonline365.com/tips/frequently-asked-questions-about-mahjong) (low-authority source)
  - An open-source project generates solvable mahjong solitaire boards and solves them following T. Stam's paper "Solving Mahjong Solitaire Positions" — [GitHub: cchaiyatad/mahjong-solitaire-solver](https://github.com/cchaiyatad/mahjong-solitaire-solver)
- **Complexity and difficulty measurement:**
  - De Bondt shows that deciding solvability of general Mahjong Solitaire (with peeking) is NP-complete, and describes a practical solver with pruning and critical-group heuristics. The difficulty of a solvable board can be measured by the fraction of successful solver attempts — [arXiv 1203.6559](https://arxiv.org/pdf/1203.6559)
  - A follow-up paper samples random layouts to measure what share are winnable — [Solving Shisen-Sho boards (ar5iv)](https://ar5iv.labs.arxiv.org/html/2010.09014)
  - Difficulty can be set by the number of winning paths: more paths make an easier game, and the hardest have a single path [low-authority FAQ] — [Mahjong Online 365](https://www.mahjongonline365.com/tips/frequently-asked-questions-about-mahjong)
  - Commercial sites rank classic layouts by solvability % and stack depth (unverified) — [themahjong.io](https://themahjong.io/blog/mahjong-solitaire-layout-difficulty-ranking-analysis-202608010004); [freemahjongplay.com](https://freemahjongplay.com/mahjong-layout-difficulty-data/)
- Puzzle had 39.33B hours of playtime in H1 2026, second behind simulation — [GameDevReports: Sensor Tower H1'26](https://gamedevreports.substack.com/p/sensor-tower-the-gaming-market-in)

### Inferences
- **Mahjong level pipeline (an inference from the sources):**
  1. Author or curate layout shapes (tile positions).
  2. Assign tile faces by reverse construction: place pairs onto currently free positions in reverse removal order. This guarantees at least one solution.
  3. Score each board by running a randomized or greedy solver N times and recording the success rate and number of dead-ends.
  4. Order boards into a curve (an easy run, then a harder "nudge" level every ~5–10 levels), so rewarded Hint/Shuffle use and booster sinks cluster on the hard levels.

  This lets a small team ship thousands of levels without hand-placing tiles, and makes the shuffle/hint economy tunable through the difficulty score.
- **Event cadence for a small team.** A sensible minimum, built from the sources' patterns, is one daily event (leaderboard or tile hunt), one rolling streak event, a monthly pass, and themed seasonal collections. Royal Match's shrinking streak (20→10 tiers) versus Tile Busters' growth (10→120) suggests the length should be tuned by audience. Shorter streaks are probably friendlier to a relaxation audience.

### Gaps
- No public source found states how many levels top tile or mahjong games ship at launch, or how many they add per update (for example Royal Match's level-drop cadence). The search budget was exhausted before this could be pursued.
- No quantitative data was found on how difficulty spikes affect churn or IAP conversion in tile-match games.
- No GDC or postmortem talk on commercial mahjong level generation was found.

---

## 5. Retention drivers for older / relaxation-focused audiences

### Takeaway
Older players (50+) mainly play on smartphones and prefer puzzle, card, tile and word games. Their motivations are enjoyment, relaxation and mental acuity. Two-thirds report age-related decline, mostly musculoskeletal and vision. They ask for:

- larger fonts
- easier onboarding
- adjustable difficulty
- lower background noise
- the ability to turn off distracting effects

Top mahjong design (Vita) reinforces this: an ad-free first session, no lives or timers, and a "play 30 minutes a day" wellbeing message.

### Cited Findings
- **AARP 2024 survey** [HARD] (1,005 US adults 40+ who game monthly; fielded Feb 22–27, 2024; published Mar 21, 2024) — [AARP Research](https://www.aarp.org/pri/topics/technology/internet-media-devices/gamer-accessibility-preferences-older-adults/):
  - 50% play every day
  - Smartphones are the most-used device
  - Preferred genres are puzzle, card, tile, word, brain teasers and logic games
  - Main motivations are enjoyment, relaxation, mental acuity and fun
  - 66% have experienced age-related decline, mostly musculoskeletal and vision
  - About half have hit at least one accessibility issue
  - 74% say inclusive design should be a priority
  - Desired features: lower background noise, easier onboarding, turning off distracting special effects, adjustable difficulty, larger font
  - About 25% play with children or grandchildren
  - Projection: 100M gamers aged 50+ by 2045
- A JMIR Serious Games 2021 study (40 adults aged 50–85, one month on commercial mobile games) produced 45 design guidelines in 3 categories: cognitive/physical, psychological/socioemotional, and consumption context [label: 2021] — [PMC8176340](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8176340/)
- CHI Play 2025 notes that adjustable text/icons, sound levels and color-blind modes are common in industry accessibility standards. Fast-paced cognitive demands are harder to fix with static settings — [arXiv 2506.07777](https://arxiv.org/pdf/2506.07777)
- Vita Mahjong is described as targeting older players who prefer easy games. Its first session is ad-free, it has no lives, timers or hard gates, and a loading screen promotes sleep and playing 30 min/day — [Balancy](https://balancy.co/blog/2025/06/17/monetization-and-gameplay-analysis-of-top-downloaded-vita-mahjong/); [Two & a Half Gamers podcast listing](https://open.spotify.com/episode/10gywd87fzuYpBzyNKPGzF)
- Tile Busters' audience is mostly female and 35+ — [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)

### Inferences
- **Core retention set for an older mahjong audience** (inferred from AARP preferences plus Vita's design):
  - large-tile and high-contrast tile-face options, plus colorblind-safe suits
  - adjustable font size
  - mute or lower background music by default
  - "reduce effects" toggle
  - no timers and no lives (or generous lives)
  - daily puzzle plus streak with gentle (non-punitive) streak-repair
  - offline play
  - unobtrusive push reminders at the player's habitual time
- Daily-play habits (50% play daily per AARP) make daily challenges and login rewards natural fits.

### Gaps
- No 2024–2026 quantitative study was found linking specific features (daily rewards, streaks, push notifications, big tiles, offline mode) to measured retention lift in puzzle games.
- No data was found on push-notification opt-in or engagement rates for older demographics.
- Spending behavior of 50+ players (payer rate, ARPPU) was not found. AARP did not cover spending.

---

## 6. LTV/CPI unit economics and payback (D7 ROAS targets, D180/D365 payback, example models)

### Takeaway
Casual CPIs are low on Android and high on iOS. Liftoff (Feb 2024–Feb 2025) reports casual CPI of $1.41 on iOS and $0.14 on Android, with iOS CPIs about 907% higher; an older Liftoff dataset put them at $2.23 and $0.63. Market D7 ROAS for casual and puzzle is low, about 7–8% (puzzle 6.9%). Healthy targets depend on your revenue curve: target D7 ROAS = target ROAS ÷ (D_payback revenue ÷ D7 revenue). For example, 120% by D180 with a 6× multiplier needs 20% D7.

### Cited Findings
- **Liftoff 2025 Casual Gaming Apps Report** (Feb 2024–Feb 2025; Liftoff + Singular; 2.5B installs; $11.9B ad spend):
  - Average casual CPI is $1.41 on iOS and $0.14 on Android; "mobile game CPIs are 907% higher on iOS"
  - The Android figure is unusually low; verify before use
  - Source: [Liftoff 2025 Casual Gaming Apps Report](https://liftoff.ai/2025-casual-gaming-apps-report/); [Liftoff announcement](https://liftoff.ai/blog/2025-casual-gaming-apps-report-announcement/)
- **Older Liftoff data (2022–2023, via Udonis, Jan 2026)**:
  - Casual CPI ~$1.00 on average, $2.23 on iOS and $0.63 on Android
  - D7 ROAS: casual blended 7.6%, iOS 7.8%, puzzle 6.9%, with a seasonal peak of 9.34% in July
  - North America has the highest CPI and the top D7 ROAS; LATAM has the cheapest installs
  - Source: [Udonis: Casual Games Market 2026](https://www.blog.udonis.co/mobile-marketing/mobile-games/casual-games)
- Casual D30 ROAS of 47% on iOS and 15% on Android, attributed to Liftoff in secondary search results. Not verified in a fetched page [EST] — [search excerpt; Udonis/Hubapps](https://hubapps.team/blog/roas-guide-for-mobile-games)
- Unity 2024 report D7 ROAS targets for puzzle: 8.2% for IAP-only optimization and 25.6% for IAP+ad revenue. From a search excerpt; the PDF was not opened [EST] — [Unity 2024 Mobile Growth & Monetization Report](https://unity.com/resources/mobile-growth-monetization-report-2024)
- **Payback method (Playio, Aug 2026)** [EST: blog, cites Segwise and Admiral Media]:
  - Choose the payback window and target ROAS (e.g., 180 days, 120%)
  - Compute the multiple: D180 revenue ÷ D7 revenue
  - Target D7 = target ROAS ÷ multiple; for example, a 6× multiple needs 20% D7 ROAS
  - Rules of thumb:
    - F2P general: D7 15–25%, D30 40–60%
    - Ad-monetized casual: median D7 ~7–8%
    - Hybrid/hypercasual: judged at D3, 30–80%
    - Subscription: D30 40–70% for 12-month payback
  - Source: [Playio: D7 ROAS Benchmarks](https://blog.playio.co/d7-roas-benchmarks-mobile-games)
- A single unsourced Playio table gives a D90 ROAS target of 90–140% for casual IAP+ads [EST, low reliability] — [Playio (search excerpt)](https://blog.playio.co/customer-acquisition-cost-mobile-games)
- Paid traffic produces 61% of casual IAP revenue (AppsFlyer, Jan 2025–Mar 2026) — [GameDevReports/AppsFlyer](https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026)
- Casual D90 total ARPU is about $1.89 per user ($1.34 IAP + $0.55 ads, AppsFlyer). This is an average over the cohorts measured, not specific to paid UA — [GameDevReports/AppsFlyer](https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026)
- Tile Busters' revenue grew while installs fell, suggesting UA was optimized for payer value over volume [EST: analyst inference] — [PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-deconstructing-spyke-games-tile-busters/)
- Subscription-only revenue per install in gaming: D14 $0.08 and D60 $0.14 (RevenueCat) — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)

### Inferences
- **Gross IAP per download (my calculation).** H1 2026 puzzle IAP of $8.07B over 5.07B downloads is about $1.59 per download. It is heavily skewed to a few titles and is not an LTV benchmark.
- **Worked example: US iOS hybrid mahjong (illustrative, every input an assumption).**
  - Inputs: CPI $2.00–4.00 for an older US iOS audience, which is likely above the casual average. D90 ARPU ~$1.89 (AppsFlyer casual D90), assuming paid users monetize at least at the average. LTV multiplier D365/D90 ≈ 1.6–2.0x (not sourced).
  - Result: D365 LTV ≈ $3.0–3.8 at average performance, which does not pay back a $3–4 CPI. Payback needs top-quartile monetization, cheaper Android or RoW traffic for ad-heavy builds, or organic/ASO volume.
  - Implication: plan for D7 ROAS of ≥15–20% on iOS IAP-led campaigns (Playio method with a 6× D180 multiple) and ≥30%+ D3/D7 on ad-revenue-optimized Android campaigns, then validate against your own curve.
- **Use AppsFlyer for model inputs.** Market-median D7 ROAS (6.9% puzzle) is a description of the average campaign, not a health standard. The AppsFlyer D90 ARPU/ARPPU figures are more usable model inputs.

### Gaps
- No primary 2024–2026 LTV curves (D30/D90/D180/D365) for hybrid puzzle titles were found, so revenue multipliers must come from the team's own data or vendors.
- Puzzle-specific CPI by country (US vs Tier-2 vs Tier-3) and by age-targeted creative was not found in a primary source.
- The Unity 2024 D7 ROAS targets and the Liftoff D30 ROAS figures were seen only in excerpts.

---

## 7. Payments and infrastructure: Apple/Google small-business rates, web shops and external links after Epic v. Apple (2025) and Google changes; RevenueCat

### Takeaway
**Apple.** The Small Business Program cuts commission to 15% for developers under $1M in prior-year proceeds. In the US, after the 2025 contempt ruling, developers may place external purchase links and buttons. Apple has charged 0% commission on those link-outs since then. The Ninth Circuit (Dec 2025) upheld contempt but allows a future cost-based commission. Apple proposed 5–15% tiers in August 2026, the Supreme Court has taken the contempt question for the October 2026 term, and the rate is unresolved as of late October 2026.

**Google.** In the US, Google stopped requiring Play Billing and allowed linking from Oct 29, 2025. A March 2026 Epic settlement brings a new fee model: reportedly 20% on new installs and 25% on existing installs for IAP, 10% for subscriptions and on the first $1M, plus a 5% Play Billing fee if used. Google requires reporting and fee payment from Oct 1, 2026 for enrolled US external-link and alternative-billing developers, but court approval of the revised injunction was pending in the sources found.

**D2C web shops.** They are now about a $17B channel (~15% of mobile-game IAP), with a median 15% revenue uplift.

### Cited Findings

**Apple: Small Business Program** [HARD: Apple page plus consistent secondary sources]
- Commission is 15% instead of 30% on paid apps and IAP for developers with ≤$1M in proceeds in the prior calendar year. New developers qualify, and associated accounts are aggregated — [Apple Developer: Small Business Program](https://developer.apple.com/app-store/small-business-program/?page=2); [Adapty guide 2026](https://adapty.io/blog/app-store-small-business-program/)
- Exceeding $1M in the current year moves you to 30% for the rest of that year; you can requalify the following year — [Adapty](https://adapty.io/blog/app-store-small-business-program/)
- No 2026 changes to the threshold or rate were found — [Adapty](https://adapty.io/blog/app-store-small-business-program/)

**Apple: Epic v. Apple, US external links**
- The 2025 contempt order ended Apple's 27% commission on external purchases — [Frankfurt Kurnit (FKKS) Technology Law](https://technologylaw.fkks.com/post/102ka4o/apple-violated-u-s-court-order-ending-apples-27-commission-on-external-purcha)
- Ninth Circuit opinion, No. 25-2935, decided Dec 11, 2025 [HARD: court opinion and law-firm analyses]:
  - Upheld the civil contempt finding
  - Held the injunction does not forbid all commissions: Apple may charge a commission limited to costs "genuinely and reasonably necessary" for coordinating external links
  - Upheld the bar on restricting the design or placement of steering links
  - Apple may require IAP prompts to be as prominent as link-out prompts
  - Sources: [Justia: Epic v. Apple, 9th Cir. 2025](https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html); [Fenwick](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple); [SCL LLP](https://scl-llp.com/ninth-circuit-upholds-apple-contempt-finding-but-narrows-scope-of-remedial-relief/); [Cravath](https://www.cravath.com/news-insights/epic-games-ninth-circuit-win-affirming-civil-contempt-finding.html)
- Status as of Aug 2026:
  - Apple has charged zero commission on US link-out purchases since the contempt ruling
  - On Aug 11, 2026 Judge Gonzalez Rogers denied Apple more time and ordered it to show its actual costs
  - Apple proposed tiered fees of 5–15%, with 15% for standard apps, and asked to pause the rate proceedings pending the Supreme Court
  - The Supreme Court agreed to review the contempt finding, with argument expected in the October 2026 term; this does not halt the rate proceedings
  - Sources: [TechTimes, Aug 13 2026](https://www.techtimes.com/articles/324312/20260813/apple-must-now-justify-app-store-commission-to-judge-who-called-it-contemptuous.htm); [MacDailyNews, Aug 14 2026](https://macdailynews.com/2026/08/14/u-s-supreme-court-clears-path-for-app-store-commission-showdown-as-apple-must-defend-its-rates-in-lower-court/); [Gokhshtein, Aug 13 2026](https://gokhshtein.com/news/2026-08-13-apple-proposes-tiered-commissions-on-external-app-store); [Oyez: Apple v. Epic, No. 25-1311](https://www.oyez.org/cases/2026/25-1311)
- No October 2026 update on Epic's response or a hearing date was found. Sources differ slightly on details — [Courthouse News (403 on fetch)](https://www.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-federal-court/)

**Google Play (US)** [HARD: official Play Console Help page]
- From Oct 29, 2025, for US mobile/tablet users, Google will not prohibit communicating pricing outside Play or linking to downloads or transactions, and will not require Play Billing — [Google Play Console Help 15582165](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
- The External content links program launched Dec 9, 2025, alongside alternative billing programs — [Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
- Google entered a new settlement with Epic on Mar 4, 2026 and asked the court to enter a revised Modified Injunction — [Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
- Enrollees in external content links or alternative billing must report transactions and pay service fees from Oct 1, 2026 — [Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
- On Oct 21, 2026, Google said external-content-links enrollees have until Feb 1, 2027 to report downloads and pay the related fees — [Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
- The page does not list fee percentages — [Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)

**Google: reported fee model from the Mar 2026 settlement** [EST: payments-vendor blog; court approval pending at the time] — [Coda, Mar 6 2026](https://www.coda.co/blog/epic-v-google-policy-update-2026/):

| Item | Reported rate |
|---|---|
| IAP service fee, new installs | 20% |
| IAP service fee, existing installs | 25% |
| Google Apps Experience participants | 15% new / 20% existing |
| Auto-renewing subscriptions | 10% |
| US, first $1M of annual earnings | 10% |
| Separate Play Billing fee, if used (US/UK/EEA) | 5% |
| Link-out purchases completed within 24h of an in-app link click | 20% |

- Rollout timing per Coda: US/UK/EU from Jun 30, 2026; Australia in Sept; Japan and Korea in Dec; the rest of the world through 2027.
- Conflicting reports: FoxData headlines "fees drop to 10%," and Appcharge says 0% through Sept 30, 2026 — [FoxData](https://foxdata.com/en/blogs/google-play-store-opens-external-billing-fees-drop-to-10-starting-june-30-2026/); [Appcharge](https://www.appcharge.com/blog/making-sense-of-google-payment-programs-ecl-billing-choice-level-up-and-the-global-model)

**D2C web shops**
- Appcharge research (Jun 2026) [EST: vendor research]:
  - D2C mobile-game revenue is ~$17B, about 15% of IAP spend
  - Median revenue uplift from D2C is 15%, rising to 35% for leading adopters
  - Source: [Business Wire](https://www.businesswire.com/news/home/20260624293221/en/New-Appcharge-Research-Direct-to-Consumer-is-Already-a-$17Bn-Market-in-Mobile-Gaming-and-the-Rest-of-the-App-Economy-is-Set-to-Follow)
- Leading adopters reach a ~35% median D2C share vs 5% for late adopters — [Playio](https://blog.playio.co/mobile-game-web-shop-strategy)
- Fees: web-shop providers charge roughly 5%, and payment processing alone is about 3–5%. Links from inside the game may attract platform fees of up to ~20% depending on region — [Metaplay (2026)](https://www.metaplay.io/blog/picking-the-right-web-shop-for-your-mobile-game); [Unity blog](https://unity.com/blog/mobile-game-webshop-business-case)
- Publisher examples:
  - Playtika: 25.4% of Q1 2025 revenue from D2C [EST: via FastSpring] — [FastSpring](https://fastspring.com/blog/building-a-case-for-d2c-in-mobile-games/)
  - Playtika targets 40% D2C on a run-rate basis within two years (Q3 2025 call) [HARD: earnings call] — [Globe and Mail transcript](https://www.theglobeandmail.com/investing/markets/stocks/DIS/pressreleases/35959350/playtika-pltk-q3-2025-earnings-call-transcript/)
  - SciPlay D2C rose from 13% (Q4 2024) to 27% (Q1 2026) [EST: Substack] — [Lancaric Substack](https://lancaric.substack.com/p/the-definitive-2026-d2c-guide-how)
  - Gamesture's webstore grew from 32% to 70% of sales, driven by store design and web-only offers — [PocketGamer.biz](https://www.pocketgamer.biz/d2c-isnt-a-payment-method-inside-a-webstore-doing-70-of-revenue/)

**RevenueCat**
- RevenueCat's 2026 gaming benchmarks (pricing, conversion, LTV) are listed in sections 1 and 3. Gaming apps lead in hybrid subs + consumables (27.5%) and all three models (9.6%), so the platform is commonly used to manage hybrid catalogs — [RevenueCat SOSA 2026 Gaming](https://www.revenuecat.com/state-of-subscription-apps-2026-gaming)

### Inferences
- **Store fees.** A small studio's base case should assume 15% on Apple IAP (Small Business Program). On Google, 15% applies to standard Play Billing under the long-standing first-$1M rate; the new settlement model reportedly sets 10% on the first $1M in the US, but this is unconfirmed.
- **US iOS web-shop link-outs** currently carry 0% Apple commission, plus ~3–5% processing or ~5% web-shop vendor fees. Model a downside scenario of a 5–15% Apple link-out fee, in line with Apple's August 2026 proposal, once the district court rules.
- **Google link-outs.** Assume ~20% on purchases made within 24h of an in-app link if the settlement model is approved. The cost advantage over a 15% small-business Play Billing rate is then small or negative for a sub-$1M studio. Web shops matter mainly once the studio is above $1M, or for web-only offers and traffic not attributed to in-app links.
- **When to add a web shop.** Older casual audiences may be less willing to leave the app to pay. D2C growth evidence comes mostly from social casino and Playtika-style payer bases (Solitaire Grand Harvest is a Playtika title). Treat a web shop as a phase-2 lever after IAP product-market fit.

### Gaps
- No official Google page stating the final US fee percentages, or confirming court approval of the revised injunction, was found as of Oct 2026.
- No October 2026 update on the Apple rate proceeding (Epic's response or a hearing date) was found.
- EU DMA and Japan smartphone-act payment options for iOS were not researched; out of scope given the time budget.
- RevenueCat's own pricing and features were not researched (no source fetched), nor was its suitability for consumables versus a lightweight in-house receipt-validation setup.
