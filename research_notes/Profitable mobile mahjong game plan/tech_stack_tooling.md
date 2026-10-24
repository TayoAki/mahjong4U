# Tech Stack & Tooling for a Small-Team Mobile Mahjong Game (ads + IAP), as of 2026-10-24

Research note: compiled 2026-10-24. The shared web-search budget ran out partway through (after about 45 searches plus direct fetches of official pages), so a few items below are flagged as unverified or listed under Gaps rather than filled in from memory. Prices are in USD. Pricing and policy in this space changed a lot in 2025–2026; the dated changes are called out where found.

---

## 1. Which game engine/framework fits a 2D tile game for a 1–5 person team (and a possible web version)? Which have first-party AppLovin MAX / LevelPlay / AdMob support?

### Takeaway
Unity 6 (6.3 LTS) is still the lowest-risk choice for an ads + IAP casual game. It is free under $200K trailing-12-month revenue+funding, the runtime fee is dead, and every major mediation, MMP and analytics SDK supports it first-party. Defold is the best "lean" alternative if web/HTML5 matters: it has official AppLovin MAX, LevelPlay, AdMob, Firebase and IAP extensions. Godot 4 is now workable on mobile, with an official AppLovin MAX plugin and Foundation-maintained Play Billing and StoreKit 2 plugins from April 2026. However, AdMob and Firebase still come from community plugins, there is no LevelPlay plugin, and iOS ad integration involves manual native steps. Flutter + Flame is a strong option for teams with app-dev skills, because MAX, LevelPlay and AdMob (Google) all ship official Flutter plugins.

### Cited Findings

**Unity: pricing and versions**
- The Runtime Fee was canceled on Sept 12, 2024 and "was not implemented", so no game was ever charged it. — [Unity pricing updates](https://unity.com/products/pricing-updates)
- Unity Personal is free up to $200,000 in annual revenue *and funding* (2026). The higher threshold took effect Oct 17, 2024 with Unity 6. Personal includes Unity Cloud Version Control and Asset Manager. The "Made with Unity" splash screen is optional on Unity 6. — [Unity pricing updates](https://unity.com/products/pricing-updates); [Unity Personal page](https://unity.com/vn/products/unity-personal)
- Unity Pro costs **$2,310 per seat per year** (prepaid) or **$210 per seat per month**. Pro and Enterprise rose 5% from Jan 12, 2026, applied at the first renewal on or after that date. Pro covers $200,001–$24,999,999 in revenue; Enterprise covers $25M+ (thresholds effective Jan 1, 2025). — [Unity pricing updates](https://unity.com/products/pricing-updates)
- The Sept 2024 announcement had set Pro at $2,200/seat/yr, so the current $2,310 figure reflects the 2026 increase. — [Unity Personal page / search summary](https://unity.com/pricing-updates)
- DevOps changes from March 1, 2026: a 25 GB free storage tier and 100 GB of free egress for Unity Version Control and Build Automation. Starting with Unity 6.3, Havok Physics is no longer included with Pro. — [Unity pricing updates](https://unity.com/products/pricing-updates)
- **Unity 6.3 LTS** is the newest LTS and is supported until **Dec 2027**. **Unity 6.0 LTS support ends Oct 2026**, i.e. this month. Unity 6 promotes "mobile and mobile web" runtime support. Unity AI (Beta in 6.3 LTS) offers in-editor asset generation. — [Unity 6 releases](https://unity.com/releases/unity-6)

**Unity: market position (sources are weak)**
- Sensor Tower's Jan 2025 engines report says Unity "is retaining its market share for now" but is pressured by Unreal at the high end and Godot at the low end. The full report is paywalled. — [Sensor Tower](https://sensortower.com/blog/the-big-game-engines-report-of-2025)
- App Radar (updated Apr 22, 2026) claims Unity has ~48% of mobile and powers ~70% of top-grossing mobile games, without citing its data. A Unity-published document claims 53 of the top 100 grossing mobile games (undated, self-reported). — [App Radar](https://appradar.com/blog/mobile-game-engines-development-platforms); [Scribd Unity doc](https://www.scribd.com/document/872937522/unity-5)
- Playgama (H1 2025) reports that 55% of HTML5 games on its platform are made with Unity. — [Playgama via GameDevReports](https://gamedevreports.substack.com/p/playgama-most-popular-engines-for)

**Godot 4: mobile maturity**
- The **Godot Mobile update of 11 April 2026** says the Godot Foundation will now improve and maintain **Godot Google Play Billing, Godot Google Play Games Services and Godot StoreKit 2**. It does not mention ads, AdMob, AppLovin or Firebase, other than Firebase Test Lab for the team's own CI. It says third-party plugins may still be needed for other services. — [Godot blog, Apr 2026](https://godotengine.org/article/godot-mobile-update-apr-2026/)
- Godot 4.5 added Android native debug symbols. Godot 4.6 added Android instrumented tests, device mirroring in the editor, and Perfetto/Instruments profiling. Vulkan and GPU-driver workarounds, prompted by two mobile launches in Dec 2025 (Kamaeru, Rift Riff), cut their crash rates from about 4% to under 1%. — [Godot blog, Apr 2026](https://godotengine.org/article/godot-mobile-update-apr-2026/)
- GABE, the Godot Android Build Environment, went stable on June 2, 2026. — [Godot blog](https://godotengine.org/article/gabe-stable-release/)
- The Godot 3.6.3 release (Aug 22, 2026) notes that Google Play now requires new apps and updates to target **Android 16 (API 36)**, and that the iOS minimum was raised to 15.0. This store requirement applies to every engine. — [Godot 3.6.3 release](https://godotengine.org/article/maintenance-release-godot-3-6-3/)
- First-party GodotGooglePlayBilling (Godot 4.2+) is documented in the official docs. — [Godot docs: Android IAP](https://docs.godotengine.org/en/4.5/tutorials/platform/android/android_in_app_purchases.html)
- Community alternative for IAP: **godot-iap (OpenIAP)**, MIT, a unified StoreKit 2 + Google Play Billing 8+ API. The maintainer describes earlier Godot IAP options as outdated. — [Asset Library](https://godotengine.org/asset-library/asset/4627); [Godot forum](https://forum.godotengine.org/t/anyone-using-godot-iap-ios-android-in-app-purchases/143757)

**Godot 4: ads and Firebase**
- **AppLovin MAX has an official Godot plugin** (MIT, Godot 4.x only, Android + iOS), listed by "AppLovin Mobile Engineering" in the Asset Library. A separate "AppLovin MAX V2 Fix" listing is a third-party, Android-only wrapper. — [GitHub AppLovin-MAX-Godot](https://github.com/AppLovin/AppLovin-MAX-Godot); [AppLovin Godot docs](https://developers.applovin.com/en/godot/overview/integration)
- The MAX Godot repo has 64 stars and no published releases. iOS requires manually creating a Podfile and running `pod install` after an "expected" Xcode build failure. Android requires manually copying the AAR, editing Gradle, and changing launchMode. AppLovin says it plans to streamline the iOS process. — [GitHub AppLovin-MAX-Godot](https://github.com/AppLovin/AppLovin-MAX-Godot)
- **No official LevelPlay plugin for Godot was found.** LevelPlay's official SDK list covers Unity, Android, iOS, Adobe AIR, Flutter and React Native. — [LevelPlay SDK docs](https://docs.unity.com/grow/levelplay/sdk); [Godot forum thread](https://forum.godotengine.org/t/is-there-a-way-to-use-unity-ads-into-godot/95369)
- AdMob on Godot uses **community** plugins:
  - Poing Studios: Android + iOS, Godot 4.1+, banner/interstitial/rewarded/rewarded-interstitial plus UMP consent. — [poingstudios godot-admob-ios](https://github.com/poingstudios/godot-admob-ios)
  - "iOS Admob Plugin" v6.0 for Godot 4.5, MIT, from the godot-sdk-integrations GitHub org. — [Asset Library edit](https://godotengine.org/asset-library/asset/edit/20615)
  - code-with-max Android plugin. — [GitHub](https://github.com/code-with-max/godot-android-admob-plugin)
- Firebase on Godot uses the **community** "Godotx Firebase" plugin (MIT; Core, Analytics, Crashlytics, Messaging; native .aar/.xcframework). Its README targets Godot 4.5, Firebase iOS SDK 12.5.0 and Android 33.5.1. — [GitHub godot-x/firebase](https://github.com/godot-x/firebase)

**Godot 4: web export**
- Godot 4 **C# projects cannot be exported to web**. Single-threaded web export has been the default since 4.3 and needs no special headers. Only the Compatibility renderer (WebGL 2) works on web. Mobile-browser performance is limited, and Safari has WebGL 2 issues. — [Godot docs: Exporting for Web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)

**Defold**
- The official AppLovin MAX extension v2.0.0 (MAX 13.6.3) requires Defold 1.13.0+, Android API 24+ and iOS 15+. It supports interstitial, rewarded, banner and MREC ads plus consent and revenue APIs. It is **not available on HTML5/desktop**. — [Defold extension-applovin](https://defold.com/extension-applovin); [AppLovin Defold docs](https://developers.applovin.com/en/max/defold/overview/integration)
- The Defold Summer 2026 newsletter says the official extensions now include AppLovin MAX 13.6.3, **Unity LevelPlay SDK 9** and **Google AdMob 4.2.1**. The official list also includes extension-firebase, extension-firebase-analytics and extension-iap. Defold 1.13.1 is current. — [Defold summer newsletter 2026 (GameDev.net)](https://gamedev.net/news/5363-defold-summer-newsletter-2026/); [Defold LevelPlay releases](https://github.com/defold/extension-levelplay/releases)

**Cocos Creator**
- Cocos has a first-party AdMob extension in the Cocos Store for Creator 3.7.3+. An older listing said it was Android-only with iOS "coming soon". — [Cocos post](https://www.cocos.com/en/post/%20); [Cocos money-making SDKs](https://cocos.com/en/post/BOtUhWIUIH4EvSeJl2IZptUn1vltCREm)
- SDKBox is deprecated, and native integration is recommended. — [Cocos forum](https://forum.cocos.org/t/topic/145026)
- AppLovin MAX goes in via native Gradle/CocoaPods, with third-party adapter docs available. — [PremiumAds MAX adapter for Cocos](https://docs.premiumads.net/docs/max-adapter-cocos-creator)
- Yodo1 MAS mediation has a Cocos Creator 3.0+ guide. — [Yodo1](https://developers.yodo1.com/docs/sdk/guides/cocos/integration)
- I found no market-share data for Cocos.

**Flutter + Flame / Casual Games Toolkit**
- The Flutter Casual Games Toolkit (free, open source) templates pre-integrate `google_mobile_ads` (AdMob), `in_app_purchase`, `games_services` (Game Center / Play Games leaderboards and achievements), `crashlytics` and `audioplayers`. Templates are basic, card game, and a Flame-based endless runner. — [Flutter Casual Games Toolkit docs](https://docs.flutter.dev/resources/games-toolkit); [flutter.dev/games](https://flutter.dev/games); [GitHub flutter/games](https://github.com/flutter/games)
- AppLovin publishes an official MAX Flutter plugin for Android and iOS. — [GitHub AppLovin-MAX-Flutter](https://github.com/AppLovin/AppLovin-MAX-Flutter)
- LevelPlay has an official Flutter SDK; v9.2.0 was released 2026-04-19. — [LevelPlay Flutter changelog](https://docs.unity.com/ja-jp/grow/levelplay/sdk/flutter/changelog)
- Google's official AdMob SDK list: Android (Next-Gen SDK), iOS, **Unity**, **Flutter**, C++. **React Native is not an official Google AdMob platform.** — [Google AdMob developers](https://developers.google.com/admob)

**React Native / Capacitor / Phaser (web tech)**
- AppLovin MAX docs list integration guides for Android, iOS, Unity, **React Native**, Flutter, **Cordova**, Adobe AIR, Unreal (UE 5.2+), **Godot** and **Defold**. — [AppLovin MAX docs](https://developers.applovin.com/en); [MAX Unreal](https://developers.applovin.com/en/unreal/overview/integration)
- LevelPlay's official React Native plugin (npm `unity-levelplay-mediation`, v8.4.0+) requires RN 0.66+, iOS 12+/Xcode 15.4+ and Android API 21+. — [LevelPlay RN docs](https://docs.unity.com/grow/levelplay/sdk/react/plugin-integration)
- Capacitor's own ads guide points to the community `@capacitor-community/admob`. Capawesome released a Capacitor AdMob plugin in **Sept 2026**, built on Google's Next-Gen SDK. It is labeled experimental and is a paid "Insiders" feature. Capgo offers another AdMob plugin. — [Capacitor ads guide](https://capacitorjs.com/docs/guides/ads); [Capawesome announcement](https://capawesome.io/docs/blog/announcing-the-capacitor-admob-plugin/); [Capgo](https://capgo.app/docs/plugins/admob)
- I found no source describing Phaser + MAX mediation directly.

**Summary: SDK support matrix (from the sources above)**

| Engine | AppLovin MAX | LevelPlay | AdMob (Google) | Firebase | IAP | Web build |
|---|---|---|---|---|---|---|
| Unity 6 | Official | Official (Unity-owned) | Official | Official | Unity IAP (first-party) | Yes (Unity Web) |
| Godot 4 | Official (manual native steps) | None found | Community | Community (Godotx) | Foundation-maintained Play Billing + StoreKit 2 (Apr 2026) | Yes (GDScript only; no C#) |
| Defold | Official ext (not HTML5) | Official ext (SDK 9) | Official ext (4.2.1) | Official ext | Official ext | Yes |
| Cocos Creator | Native / 3rd-party | Not found | First-party Cocos ext (3.7.3+) | Not researched | Not researched | Yes |
| Flutter/Flame | Official | Official | Official (Google) | Official (FlutterFire) | `in_app_purchase` | Flutter web (not researched) |
| React Native | Official | Official | Community only | Not researched | Not researched | n/a |
| Capacitor/Phaser | Via Cordova plugin (inferred) | Not found | Community / paid | Not researched | Not researched | Native web |

### Inferences
- **Opinionated pick for a 1–5 person team shipping ads + IAP fast:**
  - **Unity 6.3 LTS on Personal.** Every SDK in the monetization and measurement stack (MAX or LevelPlay, AdMob, Firebase, AppsFlyer/Adjust/Singular/Tenjin, RevenueCat, GameAnalytics) is first-party there. Hiring and contractors are easiest, and the asset store has mahjong and tile templates (not verified here).
  - Plan for Pro (about $192.50 per seat per month on annual billing) once trailing-12-month revenue+funding passes $200K. For a game with meaningful ad revenue, that can happen at only ~10k DAU (see Q9).
  - Unity 6.0 LTS support ends this month, so new projects should start on 6.3 LTS.
- **Pick Defold instead** if bundle size, web/HTML5 portals (e.g. Poki/CrazyGames-style distribution) and a free, royalty-free engine matter more than ecosystem breadth. Its official extensions cover MAX, LevelPlay, AdMob, Firebase and IAP. Note that the MAX extension does not run on HTML5, so the web build needs web-specific ad SDKs.
- **Godot 4 is acceptable** for a GDScript team that values open source. Budget extra engineering time for iOS ad integration, community AdMob/Firebase plugins, and keeping plugins current with Android API 36 / iOS 15 requirements. Avoid C# if a web build is planned.
- **Flutter + Flame suits a team of app developers.** A mahjong-solitaire UI (static tiles, taps, simple animations) does not need a game engine's renderer, and Flutter has official MAX, LevelPlay and AdMob plugins. Flutter web output for games was not researched.
- **Web-first (Phaser/PixiJS + Capacitor) is viable for a tile game but riskier for monetization.** You rely on community AdMob plugins or wrap MAX's Cordova plugin, and top ad-mediation optimization tooling is built around native and Unity SDKs.
- Real 4-player mahjong with server-authoritative logic favors a stack where server and client can share rules code. That means TypeScript (Colyseus or Nakama TS runtime) or Go (Nakama), which nudges toward a TS or C# client. This is a secondary consideration next to ads/IAP SDK support.

### Gaps
- No reliable, current, citable statistic on engine share among top-grossing **casual/puzzle** mobile games or among mahjong titles specifically. The Sensor Tower report is paywalled, and App Radar/Unity figures are unsourced or self-reported. The search budget ran out before checking the GDC 2026 State of the Industry engine numbers.
- I did not verify which engines specific top mahjong apps use (e.g. Vita Mahjong, Mahjong Solitaire by top publishers).
- Flutter web, Cocos web performance, and React Native Firebase/IAP status were not researched in depth.
- Defold's AdMob/IAP/Firebase extension versions and setup were not fetched.

---

## 2. Analytics: Firebase/GA4, GameAnalytics, Amplitude, Mixpanel, Unity Analytics, devtodev. Cost, fit and BigQuery export

### Takeaway
Start with **Firebase Analytics (GA4) + Crashlytics**, which are free, plus **GameAnalytics free**, which has game-specific dashboards, no MAU cap, and free A/B testing and remote config. Link Firebase to BigQuery early; on the free Spark plan it goes to the BigQuery sandbox. Watch the **1M events/day daily-export cap** for standard GA properties, which you will exceed around 20k–100k DAU depending on event volume. Amplitude (2M events/month free) and Mixpanel (1M events/month free) are good for funnel work but get expensive at game event volumes. Unity Analytics is free to 50K MAU.

### Cited Findings
- **Firebase:** Analytics, Crashlytics, Cloud Messaging, A/B Testing, App Distribution, In-App Messaging and Performance Monitoring are listed as "No-cost Products". — [Firebase pricing](https://firebase.google.com/pricing)
- **Firebase to BigQuery:**
  - Spark (free) projects can link Analytics, Crashlytics, Cloud Messaging and Performance Monitoring to the **BigQuery sandbox** at no cost. — [Firebase BigQuery export docs](https://firebase.google.com/docs/projects/bigquery-export?hl=ca)
  - Standard GA properties have a **1 million events/day** limit on daily export; GA 360 has no limit. **Streaming export has no such limit.** Consistently exceeding the cap pauses the daily export. — [Firebase blog](https://firebase.blog/posts/2022/12/bigquery-and-firebase-integration); [Google support](https://support.google.com/firebase/answer/6318765?hl=iw)
  - A third-party help article says the sandbox has a 10 GB storage limit and that upgrading to Blaze enables streaming export. This is unverified against Google's own page. — [ngrow.ai](https://docs.ngrow.ai/en/articles/7224521-data-stopped-flowing-to-bigquery-because-your-project-reached-the-sandbox-storage-limit)
- **GameAnalytics (pricing page, © 2025, no effective date):**
  - **Free:** no MAU cap, no credit card. Includes dashboards, **LiveOps (A/B testing + remote configs)**, market insights and an AI agent (limited messages). Excludes raw export and data warehouse.
  - **AnalyticsIQ Pro:** $49/mo, adding distributions, hourly granularity, scheduled reports and dashboard sharing.
  - **PipelineIQ:** from $499/mo, with managed BigQuery warehouse, raw player-level export to AWS/GCS, and the Metrics API. BigQuery queries cost $6.25/TiB.
  - **MarketIQ:** $499/mo.
  - Startup program for VC-backed studios.
  - [GameAnalytics pricing](https://gameanalytics.com/pricing)
- **Amplitude (official page, © 2026):** **Free: 2M events/month**, no credit card. Plus "starts at $0" with the first 2M events free, up to 700K MTUs / 70M events. Growth and Enterprise are custom. — [Amplitude pricing](https://amplitude.com/pricing). Third-party sites cite older limits ("10K MTUs", "50K MTUs"); treat those as stale. — [cut-the-saas](https://cut-the-saas.com/guides/amplitude-vs-mixpanel)
- **Mixpanel (page published Oct 22, 2026):** **Free: 1M events/month**. Growth on yearly billing: 2M events/mo is **$185/mo**; 20M events/mo is **$1,635/mo**, or $2,289/mo on monthly billing. Above 20M, contact sales. — [Mixpanel pricing](https://mixpanel.com/pricing/)
- **Unity Analytics (UGS):** free up to **50,000 MAU**, then $0.00360/MAU up to 150K, $0.00315 up to 500K, $0.00293 up to 1M, and $0.00225 above 1M. — [UGS pricing](https://unity.com/products/gaming-services/pricing)
- **devtodev:**
  - A third-party listing says the free plan covers up to **25k MAU**, with 30 custom events, 3 months of raw data and 5 team members. — [fitgap](https://us.fitgap.com/products/devtodev)
  - An older devtodev blog says free up to **10K MAU**, then $30 per 10k MAU. — [devtodev blog](https://devtodev.com/education/articles/en/463/best-game-analytics-platform-devtodev-vs-deltadna)
  - TrustRadius lists Basic at $33/mo per 10k MAU. — [TrustRadius](https://www.trustradius.com/compare-products/devtodev)
  - The sources conflict; verify on devtodev.com.

### Inferences
- **Recommended:** Firebase/GA4 as the event backbone (free, BigQuery-native, needed anyway for Crashlytics and Remote Config), plus GameAnalytics free for out-of-the-box game KPIs (retention, ARPDAU, progression funnels) that the team doesn't have to build. Both have Unity/Defold/Flutter SDKs; Godot relies on community plugins.
- Event-budget math: at ~30–50 events per user per day, the 1M/day daily-export cap is hit at roughly **20k–33k DAU**. Beyond that, either filter events in the export settings or move to Blaze streaming export and pay BigQuery streaming/storage costs. I did not research BigQuery streaming rates.
- Amplitude and Mixpanel free tiers (1–2M events/month) are exhausted by roughly 1k–2k DAU at typical game event volumes. Use them only for a narrow set of key events, or skip them.
- **Unity Analytics** is a reasonable all-in-one choice for a Unity team that also uses UGS Remote Config and Cloud Save. Costs become real beyond 50K MAU: 150K MAU is about $360/mo.

### Gaps
- BigQuery streaming-insert and storage rates (Blaze) were not fetched. The BigQuery sandbox limits were not confirmed from Google's own page.
- devtodev's current free-tier MAU limit is unresolved (10K vs 25K).
- GameAnalytics' prices carry no effective date.

---

## 3. MMPs: AppsFlyer, Adjust, Singular, Tenjin, Kochava. Free tiers and pricing; do you need one at launch?

### Takeaway
You do not need an MMP until you spend on paid UA, since organic installs and ad-network-reported revenue don't require one. When paid UA starts, several vendors have workable free or entry tiers:
- **Tenjin:** 2,000 free paid conversions/month, then $0.04; organic installs are never charged; paid tiers from $200/mo.
- **Singular:** 15,000 free paid conversions, then $0.05.
- **AppsFlyer:** 12,000 free conversions in year one, then $0.07.
- **Kochava:** free up to 10K attributed conversions/month.
- **Adjust (AppLovin-owned):** "Base" plan free for up to 12 months, capped at 1,500 attributions/month.

### Cited Findings
- **AppsFlyer (official pricing page):**
  - **Zero** plan is free, but "Not suitable for apps with paid activities". It includes first installs, core analytics, and 30 days of premium add-ons.
  - **Growth** plan includes **12K free conversions in the first 12 months, then $0.07 per conversion**.
  - Enterprise is custom; fraud detection (Protect360) is explicitly an Enterprise/premium feature.
  - [AppsFlyer pricing](https://www.appsflyer.com/pricing/)
  - AppsFlyer's support article says Zero measures engagement only and **does not measure attribution**. The Welcome package converts to Zero when it expires. — [AppsFlyer support](https://support.appsflyer.com/hc/en-us/articles/115000136303)
  - BusinessOfApps cites ~$0.06/conversion, which conflicts with the official $0.07. — [BusinessOfApps](https://businessofapps.com/marketplace/appsflyer/pricing)
- **Airbridge MMP comparison** (published Sept 2, 2026, updated Oct 17, 2026; prices checked Aug 19, 2026):
  - **Adjust:** Base plan free for up to 12 months, up to **1,500 monthly attributions**, email support. Higher tiers are custom-priced.
  - **Singular:** free plan with **15,000 paid conversions**, no credit card. Growth is **$0.05/conversion**; ad-spend-based and custom Enterprise options exist.
  - **Kochava:** Free App Analytics up to **10,000 attributed conversions/mo**. Foundation from **$500/mo**; Enterprise from **$2,000/mo**.
  - **AppsFlyer:** Order Form auto-renews unless notice is given 45 days before term end.
  - **Branch:** pricing not public.
  - [Airbridge comparison](https://www.airbridge.io/tips/mobile-attribution-pricing-plans-contract-terms)
  - Note that this is a competitor-authored page.
- Kochava's free tier reportedly keeps only 30 days of data, for attributed events only. — [MetaCTO](https://www.metacto.com/blogs/demystifying-kochava-costs-a-guide-to-pricing-integration-and-expert-support)
- **Tenjin (official, © 2026):**
  - Free: **2,000 conversions/month, then $0.04 each**, with no annual contract.
  - Paid tiers (pairing inferred from page order):
    - S: 10K conversions for $200/mo
    - M: 25K for $400/mo
    - L: 50K for $700/mo
    - XL: 100K for $1,000/mo
    - Annual billing is cheaper.
  - A conversion is an install **attributed to a paid campaign**. "Tenjin does not limit or charge for organic installs."
  - Includes ad-revenue analytics, LTV/ROAS, cost aggregation across 1,000+ networks, a free SKAdNetwork suite, and an MCP server.
  - [Tenjin pricing](https://tenjin.com/pricing/)
- **Adjust ownership:** AppLovin agreed to acquire Adjust in Feb 2021 for about $1B (Bloomberg, reported); Adjust kept its own brand. — [Mobile Marketing Magazine](https://mobilemarketingmagazine.com/applovin-acquires-mobile-measurement-firm-adjust/); [Martechvibe](https://martechvibe.com/article/applovin-to-acquire-mobile-app-measurement-market-leader-adjust)
- **Other low-cost MMPs:**
  - Linkrunner: free plan of 25,000 attributed installs, no expiry. — [Linkrunner pricing](https://www.linkrunner.io/pricing)
  - Airbridge's own blog cites a Core plan with 15K free installs, then $0.05/install. Its comparison page instead says "30-day free trial, then $40+/mo". This is an internal inconsistency. — [Airbridge blog](https://airbridge.io/en/blog/mmp-pricing-transparency)

### Inferences
- **At launch (organic/ASO, soft launch):** skip the MMP. Use Firebase/GA4 for installs and retention, and MAX/LevelPlay dashboards for ad revenue.
- **First paid UA tests (a few thousand paid installs/month):** Tenjin's free tier, Singular's 15K free conversions, or AppsFlyer's 12K first-year allowance cover this at $0.
- **Scaling UA (10k–50k paid installs/month):**
  - Tenjin ~$200–$700/mo
  - Singular ~$500–$2,500/mo at $0.05
  - AppsFlyer ~$700–$3,500/mo at $0.07
- Tenjin is designed for small game studios that monetize with ads; ad-revenue ROAS is its core feature. AppsFlyer/Adjust become relevant when ad networks or partners require them, or when fraud protection is needed (Enterprise tiers).
- Adjust being AppLovin-owned may simplify an AppLovin-centric stack (MAX + AppLovin UA). This is not verified as a pricing or integration advantage.

### Gaps
- Adjust's official pricing page was not fetched. Its Base plan details rest on the Airbridge comparison and a 2024 MetaCTO post, while TrustRadius lists only a free trial.
- Whether Singular's 15K free conversions are one-time or per month is unclear.
- Apple ATT/SKAN/AdAttributionKit requirements were not researched here.

---

## 4. Remote config, A/B testing and live ops tools

### Takeaway
For a small team, **Firebase Remote Config + A/B Testing** (free up to 100K fetches/day; new usage pricing from **Sept 1, 2026**) or **Unity Gaming Services** (Remote Config and A/B testing free; Cloud Save, Cloud Code and Leaderboards with generous free tiers) covers 90% of needs. GameAnalytics also includes free A/B tests and remote configs. **PlayFab's free tier was cut in March 2026** (Development Mode is down to 1,000 lifetime users; the new free Foundation Mode is Xbox-only), so avoid PlayFab for a mobile-only indie. Heroic Labs' Satori is enterprise-priced (from $600–$1,800/mo).

### Cited Findings
- **Firebase Remote Config: NEW pricing from Sept 1, 2026.**
  - **100,000 fetch requests/day/project free** on both Spark and Blaze.
  - Then **$0.000006/request ($0.06 per 10K)** from 100,001 to 10M per day, and **$0.000001 ($0.01 per 10K)** above 10M per day.
  - Personalization, Rollouts and A/B Testing integration are included at no extra cost.
  - Realtime listeners don't bill continuously, but each invalidation-triggered download counts as a fetch. Cached reads are free.
  - Transition for existing projects:
    - Spark projects bill from **Dec 1, 2026**, or **Feb 1, 2027** if upgraded to Blaze before Nov 15, 2026.
    - Blaze projects bill from Feb 1, 2027.
  - New Spark projects are throttled after a 30-day grace period once over 100K/day.
  - Google recommends a 12-hour default fetch interval.
  - [Firebase Remote Config pricing](https://firebase.google.com/docs/remote-config/pricing); [Firebase pricing](https://firebase.google.com/pricing)
- **Firebase backend free quotas:**
  - Firestore: 1 GiB storage, 50K reads/day, 20K writes/day, 20K deletes/day on both plans.
  - Cloud Functions free tier on Blaze only: 2M invocations/month.
  - Auth (Identity Platform): 50K MAU free.
  - [Firebase pricing](https://firebase.google.com/pricing)
- **Unity Gaming Services:**
  - **Remote Config: free.** **A/B Testing: free.**
  - **Cloud Save:** 5 GiB storage, 1M writes and 1M reads per month free; then $0.50/GiB, $0.025 per 10K writes, $0.009 per 10K reads.
  - **Cloud Code:** 1M invocations and 20 compute-hours free.
  - **Authentication:** free.
  - **Leaderboards:** "Free for a limited time" (no end date).
  - **Analytics:** free to 50K MAU.
  - Economy and Game Overrides are not listed on the pricing page.
  - [UGS pricing](https://unity.com/products/gaming-services/pricing)
- **AppLovin MAX A/B testing:** compares a test waterfall against the control (e.g. adding/removing networks, price points, regional waterfalls), with monitoring over 24–48h. This tests ad-mediation configuration, not game design. No separate pricing was found. — [AppLovin MAX A/B testing docs](https://support.applovin.com/en/max/advanced-features/a-b-testing)
- **GameAnalytics:** A/B testing and remote configs are included on the Free plan. — [GameAnalytics pricing](https://gameanalytics.com/pricing)
- **PlayFab:**
  - Microsoft docs, updated 2026-03-11: "Development Mode is being replaced by Foundation Mode as of March 11, 2026."
  - Development Mode now allows **1,000 unique users** (lifetime created, not MAU), 1M PlayStream events, 200K CloudScript executions, and other limits.
  - Foundation Mode is free for Xbox-storefront titles.
  - [Microsoft Learn: PlayFab Development Mode](https://learn.microsoft.com/en-za/xbox/playfab/pricing/development-mode)
  - Third-party coverage calls this a 99% cut of the old 100K-player free tier. Foundation Mode is described as Xbox-only, preview, without CloudScript/dedicated servers. A Standard Plan has been cited at $400/mo (unverified). — [AccelByte blog](https://accelbyte.io/blog/playfab-just-cut-its-free-tier-by-99.-heres-what-that-means-for-your-game); [Supercraft](https://crux.supercraft.host/blog/playfab-alternatives-indie-2026/)
- **Heroic Labs (Nakama/Satori):**
  - Heroic Cloud pricing page: Nakama's price did not render (placeholder). **Satori "starts from $600/month"** with event-based ingestion pricing. Support packages are **$2,000/mo** (Studio Basic) and **$6,000/mo** (Studio Standard). — [Heroic Labs pricing](https://heroiclabs.com/pricing/)
  - A search-indexed version of the same page shows Satori "from **$1,800/month** (25m events included)". This conflicts with $600. Heroic Cloud is usage-based, billed daily, invoiced monthly via Stripe. — [Heroic Labs pricing (search summary)](https://heroiclabs.com/pricing); [Heroic billing docs](https://heroiclabs.com/docs/heroic-cloud/organizations/billing-support)
  - Nakama itself is open source (Apache-2.0) and free to self-host. — [apis.io Nakama](https://apis.io/plans/nakama/nakama-plans-pricing/)
- **Balancy:** no public pricing found. The Unity Asset Store SDK is free (last version Oct 2023). A Cocos/TS SDK was free to try until June 1, 2025. — [Unity Asset Store](https://assetstore.unity.com/packages/slug/128920); [WN Hub](https://wnhub.io/news/marketing/item-46914)

### Inferences
- **Recommended:**
  - Firebase Remote Config + A/B Testing as the live-ops switchboard: ad frequency caps, interstitial pacing, level/layout difficulty, IAP offer configs, and event toggles.
  - Use a ≥12h fetch interval (plus realtime only if needed) to stay within 100K free fetches/day. That holds up to roughly 30k–50k DAU at 2–3 fetches/user/day.
  - At 100k DAU with ~3 fetches/day: ~200K billable/day × $0.000006 ≈ **$1.20/day ≈ $36/mo**. This is a newly introduced cost; it was free before Sept 2026.
- Unity teams can choose UGS (Remote Config + Cloud Save + Leaderboards + Cloud Code) as a free-at-small-scale backend that replaces much of what PlayFab used to offer indies.
- Satori, Balancy and PlayFab Live are overkill at 0–100k DAU for a 1–5 person team. Revisit Satori/Hiro only if building a heavy live-ops economy on Nakama.

### Gaps
- Satori's starting price conflicts ($600 vs $1,800/mo). Nakama's Heroic Cloud price is unpublished.
- UGS Economy pricing and the Leaderboards "limited time free" end date are unknown.
- AppLovin MAX A/B testing cost was not confirmed. MAX also has broader experimentation features (not researched).

---

## 5. IAP/subscription infrastructure: RevenueCat, Unity IAP, StoreKit 2 / Play Billing, receipt validation, web stores after the 2025–2026 policy changes

### Takeaway
For a mahjong game with consumables (hints, shuffles, undo), remove-ads and possibly a VIP subscription, **RevenueCat** is the fastest path. It is free under $2,500 monthly tracked revenue, then 1%, and includes paywalls, A/B experiments, targeting, and virtual currency (launched Aug 2025, docs still say "early stage"). **Unity IAP** is a free alternative for Unity. Web shops are legal and currently commission-free for US link-outs from iOS. However, Apple's "reasonable fee" is pending after the Dec 2025 Ninth Circuit ruling and a Supreme Court cert grant (June 30, 2026), and Google announced fees on external offers with reporting from Oct 1, 2026. Treat a web shop (e.g. **Stash at 5% + payment-channel costs**) as a post-PMF optimization for whale-heavy revenue.

### Cited Findings
- **RevenueCat:**
  - **Free up to $2,500 MTR; above that, 1% of tracked revenue.** All features included: native remotely configurable **paywalls** with templates, **Experiments** (A/B testing with remote config and funnel analytics), and **Targeting**.
  - Enterprise is custom.
  - Growth tools (paywalls, web-to-app funnels, A/B/n) can be used with your own IAP infrastructure.
  - [RevenueCat pricing](https://www.revenuecat.com/pricing/)
- **RevenueCat virtual currency:**
  - Live for all users since **Aug 5, 2025**, with games as a target use case (gems/coins without building a currency backend).
  - Up to **100 currencies per project**. No native "virtual items"; the workaround is to model each item as a currency.
  - Subscriptions can grant recurring currency across App Store, Play Store, Stripe and Web Billing.
  - Docs still say the feature is "in an early stage and may change without notice".
  - [RevenueCat blog](https://www.revenuecat.com/blog/company/revenuecat-virtual-currency); [RevenueCat docs](https://revenuecat.com/docs/offerings/virtual-currency); [virtual items FAQ](https://www.revenuecat.com/docs/offerings/virtual-currency/faq/virtual-items); [subscriptions](https://www.revenuecat.com/docs/offerings/virtual-currency/subscriptions)
- **Unity IAP 5.4** is presented by Unity as including D2C (direct-to-consumer) commerce capabilities. No fees were listed. — [Unity webshop business case (Jul 27, 2026)](https://unity.com/blog/mobile-game-webshop-business-case)
- **Godot IAP:** the Foundation maintains Google Play Billing and **StoreKit 2** plugins (Apr 2026); see Q1. — [Godot blog](https://godotengine.org/article/godot-mobile-update-apr-2026/)
- **Flutter IAP:** the Casual Games Toolkit uses the `in_app_purchase` package. — [Flutter toolkit docs](https://docs.flutter.dev/resources/games-toolkit)
- **US link-out status as of July 2026** (Unity, Jul 27, 2026):
  - Under the April 2025 *Epic v. Apple* injunction, Apple cannot charge commission on US external-link purchases.
  - The **Ninth Circuit (Dec 2025)** held the total ban overbroad and remanded for a "reasonable" fee, which has not yet been set.
  - The **Supreme Court granted certiorari in *Apple v. Epic* on June 30, 2026.**
  - "As of July 2026, no platform commission is currently being collected on US link-out purchases."
  - EEA/EU link-outs carry roughly 10–20% platform fees.
  - [Unity blog](https://unity.com/blog/mobile-game-webshop-business-case)
- **Apple's proposed link-out fees** (subject to court review): 15% standard, 10% for certain programs/renewals, 5% for Small Business Program developers. Epic contests this. — [Channel Insider](https://www.channelinsider.com/apple/news-apple-external-purchase-fee-epic-court-fight/)
- Xsolla's SDK page notes the Dec 2025 appellate modification permits an Apple commission, with the rate under court review. Xsolla launched a mobile "Buy Button" in May 2025. — [Xsolla SDK](https://developers.xsolla.com/sdk); [Malay Mail / Xsolla PR](https://www.malaymail.com/news/money/mediaoutreach/2025/05/09/xsolla-launches-buy-button-for-mobile-games-to-help-developers-take-back-control-of-their-revenue/381152)
- **Google Play (US):**
  - Google had to allow alternative billing and external links in the US by **Oct 29, 2025**, for at least three years.
  - Notebookcheck reports Google's stated External Payments fees as **20% for in-app digital content and 10% for auto-renewing subscriptions**, with 10% on the first $1M of annual earnings for eligible developers. It also reports a per-install fee for external content links of **$2.85 per app / $3.65 per game**. — [Notebookcheck](https://www.notebookcheck.net/Google-cuts-Play-Store-fees-as-Epic-settlement-reshapes-Android-app-payments.1243278.0.html)
  - Google's help page says enrolled US developers must report transactions/downloads and pay fees **starting Oct 1, 2026**. — [Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
  - **Conflict:** Appcharge argues the injunction is silent on link-out fees and that US external links "continue at 0%". It also reports Epic and Google withdrew their proposed settlement on July 15 (2026). — [Appcharge blog](https://appcharge.com/blog/epic-v-google-the-settlement-is-off-the-table)
- **Stash** (web shop): **5% commission plus channel cost** (card/carrier). Its fee calculator uses ~10% as an all-in estimate including chargebacks, refunds, taxes and FX. — [Stash payments](https://www.stash.gg/online-gaming-payments); [Stash fee calculator](https://www.stash.gg/fee-calculator)
- Unity's analysis: a web shop nets more per transaction than IAP even with a 10–15% link-out discount, especially for frequent, high-spending players and higher-priced SKUs. No numeric threshold is given. — [Unity blog](https://unity.com/blog/mobile-game-webshop-business-case)

### Inferences
- **Recommended at launch:** RevenueCat (or Unity IAP if on Unity and keeping costs at $0) with a small SKU set: remove-ads, hint/shuffle packs, a coin bundle ladder, and an optional "VIP" subscription (no ads + daily coins).
  - RevenueCat's server-side receipt handling avoids building receipt validation against the App Store Server API and Play Developer API. The paywall and experiments features let you price-test without app updates.
  - At $20K/mo in IAP revenue the fee is about $200/mo.
- **Web shop:** add after IAP revenue is meaningful (e.g. tens of thousands of dollars per month with a whale tail). Mahjong solitaire audiences skew older and ad-heavy, so IAP share may be modest; the monetization researcher's data should decide this. Legal fees are in flux: Apple's remand fee and SCOTUS review are pending, and Google's fee reporting started Oct 1, 2026 per Google. Model 0% and ~15–20% platform-fee scenarios.
- If you build your own validation, StoreKit 2 (signed JWS transactions) and Play Billing Library 8 are the current native APIs (Godot's OpenIAP plugin targets these). Server-side verification remains necessary for consumables tied to server-held currency.

### Gaps
- Unity IAP pricing and features beyond "D2C capabilities", and Appcharge/Xsolla fee schedules, were not found (search budget exhausted).
- RevenueCat's exact handling of "1% of MTR" (whole amount vs above threshold) and whether Growth Tools carry separate fees are ambiguous on the page.
- Native StoreKit 2 / Play Billing receipt-validation specifics were not fetched from Apple/Google docs.

---

## 6. Multiplayer backend for real 4-player mahjong; open-source mahjong rules/AI libraries; generating solvable Mahjong Solitaire layouts

### Takeaway
Real 4-player mahjong has hidden information: concealed hands and the wall. It therefore needs a **server-authoritative** backend that shuffles, deals and validates, not peer/relay sync. Cheap, small-team-friendly options:
- **Nakama** (open-source, Apache-2.0): authoritative match handlers in Go/TS/Lua, explicitly supports turn-based play. Self-host to avoid Heroic Cloud's enterprise pricing.
- **Colyseus** (open-source; Cloud from $15/mo, no CCU limits).
- **Photon:** free 20 CCU dev / 100 CCU launch; 500 CCU for $125/mo; 1,000 CCU for $250/mo.

For rules, the MIT `mahjong` Python package (riichi scoring validated against Tenhou) is the go-to reference. Mortal (a strong riichi AI) is **AGPL-3.0**, which is risky for a closed-source commercial server. For Mahjong Solitaire, generate boards by **reverse construction**: build a removal order on the empty layout, then paste tile pairs onto it, so every deal is solvable by construction.

### Cited Findings
- **Nakama authoritative multiplayer:**
  - The server validates and broadcasts all gameplay. Match handlers have 7 lifecycle functions (Init, JoinAttempt, Join, Leave, Loop, Terminate, Signal) with a configurable tick rate.
  - Server code can be written in **Go, TypeScript or Lua**.
  - The docs describe "active turn-based" (low tick rate) and "passive turn-based" (Words With Friends-style; loop shuts down between turns) patterns.
  - Authoritative mode suits games where you "don't want to trust game clients", to minimize cheating.
  - [Nakama docs: authoritative multiplayer](https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/)
- **Nakama/Heroic pricing:** OSS is free to self-host (Apache-2.0). Heroic Cloud's Nakama price is unpublished. Support packages are $2K and $6K/mo. — [Heroic pricing](https://heroiclabs.com/pricing/); [apis.io](https://apis.io/plans/nakama/nakama-plans-pricing/)
- **Colyseus:** open source, free to self-host, "no restrictions". **Colyseus Cloud starts at $15/mo** with managed SSL, unlimited bandwidth, email support and "No CCU/DAU/MAU limits". — [Colyseus pricing](https://colyseus.io/pricing/)
- **Photon** (Fusion pricing page; may also apply to other Photon Cloud products):

  | Plan | CCU | Price | Traffic / terms |
  |---|---|---|---|
  | Dev | 20 | Free | 60 GB/mo |
  | Free Launch | 100 | Free | One app, 0.3 TB |
  | One-Time | 100 | $95 once | 12 months |
  | Monthly | 500 | $125/mo | 1.5 TB |
  | Monthly | 1,000 | $250/mo | 3 TB |
  | Monthly | 2,000 | $500/mo | 6 TB |
  | Premium | Usage-based | $0.50/CCU | $1,000/mo minimum |

  Extra traffic costs $0.05–$0.10/GB. — [Photon pricing](https://www.photonengine.com/fusion/pricing)
- **Unity Relay/Lobby (UGS):** Relay has the first 50 average monthly CCU free, then $0.16/CCU. Lobby has 10 GiB/month free per region group. — [UGS pricing](https://unity.com/products/gaming-services/pricing)
- **PlayFab:** free Development Mode is now capped at 1,000 lifetime users (Mar 2026); see Q4. — [Microsoft Learn](https://learn.microsoft.com/en-za/xbox/playfab/pricing/development-mode)
- **Firebase as a turn-based backend:** Firestore free quota is 50K reads/day and 20K writes/day. Cloud Functions (for server-side dealing/validation) need Blaze, which has 2M free invocations/month. — [Firebase pricing](https://firebase.google.com/pricing)
- **`mahjong` (PyPI, MahjongRepository):**
  - Riichi hand calculator covering han, fu, yaku, score, win validation and shanten. **MIT license.**
  - Validated on tenhou.net Phoenix replays, matching Tenhou's calculation.
  - Older releases were riichi-only (MCR "planned"). The latest version seen was 2.0.0.
  - [PyPI mahjong](https://pypi.org/project/mahjong/); [PyPI 1.2.1](https://pypi.org/project/mahjong/1.2.1/)
- **Mortal:**
  - "Free and open source AI for Japanese mahjong", powered by Rust + deep RL, compatible with Tenhou 4-player ranked rules.
  - **Code is AGPL-3.0-or-later**; logo/assets are CC BY-SA 4.0.
  - Trained weights are not in the repo releases; the README links a gist explaining the weights situation.
  - [GitHub Equim-chan/Mortal](https://github.com/Equim-chan/Mortal)
  - Derivative projects (e.g. mjai, riichienv) embed AGPL libriichi code. — [PyPI mjai](https://pypi.org/project/mjai); [riichienv](https://pypi.org/p/riichienv)
- **Chinese Official (Guobiao/MCR) mahjong:** "ChineseOfficialMahjongHelper" (MIT, cocos2d-x C++) has a fan calculator, but it was **archived on May 6, 2026** and is unmaintained. Its algorithms live in a separate repo, `summerinsects/mahjong-algorithm`, whose license was not verified. — [GitHub ChineseOfficialMahjongHelper](https://github.com/summerinsects/ChineseOfficialMahjongHelper)
- **Solvable Mahjong Solitaire generation (developer write-up):**
  1. Build a removal order on the *empty* layout by repeatedly picking two geometrically free slots. A slot is free if nothing is above it and its left or right side is open, using half-tile coordinates.
  2. Paste face pairs onto that order. Replaying the order clears the board, so a solution exists before the player moves.
  3. If the random walk strands, retry it (up to 60 times in practice) instead of backtracking.
  4. Reshuffle by rerunning the construction over the remaining tiles, so a stuck player always gets a recoverable board.
  - "Solvable" doesn't mean "can't lose": players can still strand themselves.
  - [DEV Community: built mine backwards](https://dev.to/dev_nash/most-free-mahjong-games-can-deal-you-a-board-you-cant-finish-i-built-mine-backwards-1cia)
  - A strategy guide describes the same reverse-pair method and notes such deals still range from very easy to very hard. — [mahjong-pro strategy guide](https://mahjong-pro.com/mahjong-solitaire-strategy-guide/)
  - An open-source solver with selectable strategies and heuristics exists, useful for difficulty grading (not inspected). — [GitHub cchaiyatad/mahjong-solitaire-solver](https://github.com/cchaiyatad/mahjong-solitaire-solver)

### Inferences
- **Mahjong Solitaire (single-player) needs no multiplayer backend.** Use reverse-construction generation plus a solver-based difficulty score, either offline or in the build pipeline, to produce curated level packs. Offer free reshuffles or paid "shuffle" boosters, which pair naturally with IAP and rewarded ads.
- **Real 4-player mahjong:**
  - The server must hold the wall and every hand, sending each client only its own tiles. Otherwise a modified client can read opponents' hands. That rules out pure relay models (Photon Realtime/Fusion shared mode, Unity Relay) unless you add server-side logic.
  - Nakama (self-hosted on a small VM, TS or Go runtime) or Colyseus (TS, Cloud from $15/mo) are the best fits. Turn-based mahjong traffic is tiny, so CCU-priced plans stay cheap.
  - Pair the backend with bots to fill tables at low concurrency; matchmaking liquidity is a real risk for small games.
- **Licensing caution:**
  - Embedding Mortal (AGPL) in a networked commercial server likely triggers source-disclosure obligations for that server code. Use it, if at all, only for offline analysis or with legal review. Bots can instead use simple heuristics (shanten/ukeire from the MIT `mahjong` library logic).
  - For Chinese/HK/American variants, expect to write or port scoring yourself.
  - American (NMJL) rules involve a copyrighted annual card. This was not researched here; flag it for the legal researcher.

### Gaps
- Photon's handling of hidden information and server plugins, and its turn-based (webhooks/persistence) features and pricing, were not researched.
- Heroic Cloud's Nakama price, and self-hosting VM costs, were not researched.
- The license of `summerinsects/mahjong-algorithm` was not verified. No HK/Taiwanese/American scoring libraries were found (search budget exhausted).
- A frequently quoted statistic that ~3% of random classic "Turtle" deals are unsolvable appeared in search snippets, but I could not tie it to a verifiable source.

---

## 7. Art, audio and content tools: tile asset sources and licensing, fonts, AI art tools, level editors

### Takeaway
**FluffyStuff/riichi-mahjong-tiles is CC0 (public domain).** It provides Regular and Black sets in vector and PNG, and is the safest free base for tiles. It lacks the flower and season tiles that Mahjong Solitaire needs (riichi doesn't use them), so you will need to commission or derive those. Avoid Wikimedia "Mahjong tile" SVGs for a commercial closed game unless you accept CC BY-SA share-alike terms. Avoid xmahjongg-derived tiles, which are GPL or "non-profit only". Unicode mahjong glyphs render poorly on some Android/Windows fonts, so ship SVG/PNG art.

### Cited Findings
- **FluffyStuff/riichi-mahjong-tiles:** README states "All assets are in the public domain", linking to CC0 1.0. It has Regular and Black variants, "vector graphics and PNG exports", and 596 stars. — [GitHub FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles)
- The CTAN `mahjong-tiles` LaTeX package (MIT) includes artwork derived from FluffyStuff's tiles. — [CTAN mahjong-tiles](https://ctan.org/ctan-ann/pkg/mahjong-tiles)
- A developer building a solitaire game used CC0 riichi art for **33 of 42 faces**. Riichi has no flowers/seasons and a blank white dragon, so nine faces were missing. They extracted the rest from **Noto Sans Symbols 2** glyph outlines with fontTools. They also note Unicode mahjong characters render poorly in some default Windows/Android fonts. — [DEV Community](https://dev.to/dev_nash/most-free-mahjong-games-can-deal-you-a-board-you-cant-finish-i-built-mine-backwards-1cia)
- **Wikimedia Commons** "Mahjong tile circle N.svg" files (by Jerry Crimson Mann) are reported under **CC BY-SA 3.0** via a mirror, which requires attribution and share-alike. — [mirror of Commons file page](https://solarspell-dls.sfis.asu.edu/mea/wikipedia/images/1978/197891.png.htm)
- **xmahjongg tiles:**
  - The original B&W tiles by Mark A. Holm are "non-profit only".
  - The coloured versions by Eddie Kohler are **GPL**.
  - The flowers/seasons by J. C. Bradfield were placed in the public domain.
  - [MIT mj source README](https://stuff.mit.edu/afs/sipb/user/dmaze/src/mj-1.6-src/tiles-v1/README)
- An itch.io "riichi asset" pack exists (license not inspected). — [itch.io gamblemountain](https://gamblemountain.itch.io/riichi-asset)
- **AI art:** Unity AI (Beta in Unity 6.3 LTS) includes in-editor asset generation. — [Unity 6 releases](https://unity.com/releases/unity-6)

### Inferences
- **Recommended:**
  - Use FluffyStuff CC0 tiles as the base or reference for prototypes.
  - For the shipped game, commission an original tile set (or restyle the CC0 set) to differentiate: themed backs, large-print/high-contrast variants for older players, and seasonal skins sold as IAP.
  - Draw the 8 flower/season faces new, or use Bradfield's public-domain flowers/seasons after verifying them.
- Noto fonts are generally under the SIL Open Font License, which allows embedding and derivative glyph use with conditions. Verify before deriving tile art from Noto glyphs.
- Level editors: generate layouts procedurally (Q6) and author layout *shapes* (turtle, dragon, fortress, etc.) as simple JSON grids of (x, y, z) half-tile coordinates. A small in-engine or web editor is cheaper than a generic tool.

### Gaps
- I did not research AI art tools (Midjourney, Scenario, Leonardo, Layer, etc.), their pricing, or their commercial-use and store-disclosure terms; the search budget ran out.
- Audio sources (SFX/music libraries and licenses) and font choices for CJK characters were not researched.
- I did not confirm the current Wikimedia Commons license per file (only via a mirror).

---

## 8. Crash reporting / QA: Crashlytics, Sentry, BugSnag; device testing

### Takeaway
**Firebase Crashlytics is free with no event caps** and integrates with every engine except Godot, where community plugins exist. Use it as the default. Add **Sentry** (free 5K errors/1 user; Team $29/mo, or $26/mo billed annually) if you also run a backend or a web build. **BugSnag Free** gives 7.5K events/month with 7-day retention. For device coverage, **Firebase Test Lab** has a free daily quota and then charges $1/hr per virtual device and $5/hr per physical device.

### Cited Findings
- **Crashlytics** is a Firebase "No-cost product". — [Firebase pricing](https://firebase.google.com/pricing). Third-party comparisons describe it as completely free with no event limits but crash-only: no session replay, no anomaly detection. — [Dupple](https://dupple.com/learn/best-crash-reporting-tools); [theswiftk.it](https://theswiftk.it.com/blog/crashlytics-vs-sentry-vs-bugsnag-ios)
- **Sentry (official):**
  - **Developer: free**, 1 user, 5K errors, 50 session replays, 30-day lookback, no integrations.
  - **Team: $29/mo**, or $26/mo billed annually: unlimited users, 50K errors.
  - **Business: $89/mo**, or $80/mo billed annually.
  - Enterprise is custom.
  - [Sentry pricing](https://sentry.io/pricing/)
- **BugSnag (official):** **Free $0**, with 7.5K events and 1M spans/month and **7-day retention**. Select and Preferred tiers have 50K–3M events and 60-day retention; prices are not shown statically. — [BugSnag pricing](https://www.bugsnag.com/pricing/)
- **Firebase Test Lab:**
  - Spark: **10 virtual-device tests/day** (≤60 min/day) and **5 physical-device tests/day** (≤30 min/day).
  - Blaze: **$1/device-hour virtual, $5/device-hour physical**, billed per minute.
  - Android Device Streaming: 30 free minutes/month, then $0.15/min.
  - [Firebase pricing](https://firebase.google.com/pricing)
- The Godot team itself uses Firebase Test Lab for Android instrumented tests and notes the free tier limits device capacity. — [Godot blog, Apr 2026](https://godotengine.org/article/godot-mobile-update-apr-2026/)
- Flutter's games template includes Crashlytics. Godotx Firebase includes a Crashlytics module. — [Flutter toolkit](https://docs.flutter.dev/resources/games-toolkit); [Godotx Firebase](https://github.com/godot-x/firebase)

### Inferences
- **Recommended:**
  - Crashlytics as the main crash reporter, with Android vitals (Play Console) as the store-side check that matters for featuring and ranking.
  - Sentry's free tier for backend or web errors. Upgrade to Team ($29/mo) only when there is more than one engineer or more than 5K errors/month.
- **Device QA on a budget:**
  - Firebase Test Lab Robo tests on the free daily quota for pre-release smoke tests.
  - Keep a small physical device shelf: a low-end Android with 2–3 GB RAM, a mid-tier Samsung, an older iPhone on the iOS 15 minimum, and a recent iPhone/iPad. This matters because mahjong players skew older and use tablets (inference; confirm with market research).
  - The Godot GPU-driver crash data (4% to <1% after fixes) shows low-end Android GPU drivers are a real crash source, so test on Mali/Adreno low-end devices.

### Gaps
- BugSnag paid-tier prices did not render. AWS Device Farm, BrowserStack and Sauce Labs pricing was not researched (search budget exhausted).

---

## 9. Rough monthly tool costs at 0–10k DAU and 10k–100k DAU

### Takeaway
A lean stack can run at **~$0–$100/month at 0–10k DAU**:
- Unity Personal or Godot/Defold
- Firebase (Analytics, Crashlytics, Remote Config, A/B)
- GameAnalytics free
- RevenueCat (free under $2.5K MTR)
- No MMP until paid UA

At **10k–100k DAU, tooling is ~$300–$3,000+/month**. The biggest swing items are:
- **Unity Pro seats**, which are triggered by revenue, not DAU: $2,310/seat/yr once trailing revenue+funding exceeds $200K, possibly already at ~10k DAU.
- **MMP fees**, which scale with paid installs.
- **RevenueCat's 1%.**
- Optional multiplayer hosting.

Ad mediation (MAX/LevelPlay) has no subscription fee; its cost is embedded in ad revenue share. This was not researched here.

### Cited Findings
Cost inputs, all cited earlier:
- Unity Personal is free under $200K revenue+funding; Pro is $2,310/seat/yr or $210/seat/mo. — [Unity](https://unity.com/products/pricing-updates)
- Firebase Analytics, Crashlytics and A/B are free. Remote Config is free to 100K fetches/day, then $0.06/10K, from Sept 1, 2026. — [Firebase pricing](https://firebase.google.com/pricing); [RC pricing](https://firebase.google.com/docs/remote-config/pricing)
- GameAnalytics: free; Pro $49/mo; PipelineIQ from $499/mo. — [GameAnalytics](https://gameanalytics.com/pricing)
- RevenueCat: free to $2,500 MTR, then 1%. — [RevenueCat](https://www.revenuecat.com/pricing/)
- MMPs:
  - Tenjin: free 2K paid conversions/mo then $0.04; S tier $200/mo for 10K; M tier $400/mo for 25K. — [Tenjin](https://tenjin.com/pricing/)
  - AppsFlyer: $0.07/conversion after 12K in year one. — [AppsFlyer](https://www.appsflyer.com/pricing/)
  - Singular: $0.05/conversion after 15K free. — [Airbridge comparison](https://www.airbridge.io/tips/mobile-attribution-pricing-plans-contract-terms)
- Sentry Team: $29/mo. — [Sentry](https://sentry.io/pricing/)
- Multiplayer (if built):
  - Colyseus Cloud from $15/mo. — [Colyseus](https://colyseus.io/pricing/)
  - Photon: 500 CCU $125/mo, 1,000 CCU $250/mo, 2,000 CCU $500/mo. — [Photon](https://www.photonengine.com/fusion/pricing)
- Web shop: Stash 5% + channel costs. — [Stash](https://www.stash.gg/online-gaming-payments)
- Unity Analytics beyond 50K MAU: $0.0036/MAU. — [UGS](https://unity.com/products/gaming-services/pricing)

### Inferences
**Illustrative monthly tool budget.** Assumptions are mine, not sourced: about 3 Remote Config fetches/user/day, ~40 analytics events/user/day, IAP ≈ $0.01–$0.02 per DAU per day, total ARPDAU $0.05–$0.12, and a 3-person team.

| Line item | 0–10k DAU (soft launch / organic) | 10k–100k DAU (scaling, paid UA) |
|---|---|---|
| Engine | Unity Personal $0. Unity Pro needed if trailing 12-mo revenue+funding > $200K: 10k DAU × $0.06 ARPDAU ≈ $219K/yr, so Pro may already apply near the top of this band. 3 seats ≈ $578/mo annual. Godot/Defold $0. | Unity Pro 3–5 seats ≈ **$578–$963/mo** (annual) or $630–$1,050 (monthly). Godot/Defold $0. |
| Analytics | Firebase $0 + GameAnalytics free $0 | $0–$49 (GA Pro). Plus BigQuery streaming/storage once >1M events/day (≈25k+ DAU), cost not researched, est. tens of $/mo. GA PipelineIQ $499+/mo optional. |
| Remote config / A/B | $0 (≤30K fetches/day) | ~$0–$54/mo: 100k DAU × 3 = 300K/day, so 200K billable × $0.000006 × 30 ≈ $36/mo. Billed from Dec 1, 2026 (Spark) / Feb 1, 2027 (Blaze) for existing projects. |
| Crash reporting | $0 (Crashlytics) | $0–$29 (Sentry Team if backend/web) |
| IAP infra | RevenueCat $0 (<$2.5K MTR); at $3K–$6K MTR ≈ $30–$60 | 10k DAU × $0.015 × 30 ≈ $4.5K MTR (~$45). 100k DAU ≈ $45K MTR (~$450/mo). Unity IAP alternative $0. |
| MMP | $0 (none needed for organic) | Tenjin $200–$700/mo, Singular ~$0.05 × paid installs, or AppsFlyer ~$0.07 × paid installs. E.g. 20K paid installs/mo ≈ $400 (Tenjin M) to $1,400 (AppsFlyer). |
| Backend (single-player) | $0 (Firebase/UGS free tiers: Cloud Save 1M writes, Firestore 20K writes/day) | $0–$50 (UGS/Firestore overages) |
| Multiplayer (only if real 4P mahjong) | $0–$15 (Photon free 100 CCU launch, or Colyseus Cloud $15) | $125–$500/mo Photon (500–2,000 CCU), or a self-hosted Nakama/Colyseus VM (VM cost not researched) |
| Device testing | $0 (Test Lab free quota) | $0–$100 (Test Lab physical-device hours at $5/hr) |
| **Total (excl. engine seats)** | **~$0–$100/mo** | **~$300–$2,500/mo**, plus Unity Pro seats if on Unity |

**Opinionated recommended stack for this project (ads + IAP mahjong solitaire, with a possible later 4P mode):**
1. **Engine:** Unity 6.3 LTS (Personal → Pro when revenue requires). Alternative: Defold if a web/portal build is a priority and the team is comfortable with Lua.
2. **Ads:** AppLovin MAX or Unity LevelPlay mediation, both first-party on Unity. Use MAX's waterfall A/B testing to tune.
3. **Analytics:** Firebase/GA4 with BigQuery link from day one, plus GameAnalytics free.
4. **Live ops:** Firebase Remote Config + A/B Testing, with a ≥12h fetch interval to stay in the free tier. Or UGS Remote Config if all-in on Unity.
5. **IAP:** RevenueCat, using paywalls and experiments for remove-ads/VIP price tests. Consider virtual currency for coins once it matures.
6. **Crash/QA:** Crashlytics + Firebase Test Lab free tier, plus a small physical-device shelf.
7. **MMP:** none at launch. Tenjin (or Singular's free 15K) when paid UA starts; AppsFlyer/Adjust if partners demand it.
8. **Multiplayer (later):** self-hosted Nakama (TS/Go authoritative matches) or Colyseus Cloud, with bots for table fill. Avoid AGPL AI code in the server.
9. **Content:** FluffyStuff CC0 tiles for prototyping, a commissioned original tile set for launch, and reverse-construction solvable-layout generator plus solver-graded difficulty.

### Gaps
- Ad-mediation economics (MAX/LevelPlay revenue share, bidding networks), ARPDAU benchmarks for mahjong, and Apple/Google developer-account fees were not covered here. They are likely covered by the monetization/UA researchers.
- BigQuery streaming and storage costs, self-hosted server VM costs, and Unity Pro seat requirements per team member (whether every contributor needs a Pro seat) were not verified.
- All cost figures above are illustrative estimates built from cited list prices plus my own usage assumptions; they are not observed spend data.
