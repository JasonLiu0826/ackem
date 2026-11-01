# QZone posts (QQ Zone)

> Goal: let the companion post to QQ Zone on her own — an LLM-written post based on persona,
> time of day, mood, memory and today's chats, spaced out over the day, optionally with a meme.
> She can also browse the zone on a schedule: reply to comments on her own posts once per thread,
> and like/comment friend feeds by probability.
>
> Implementation: `src/main/channels/qq/qzone/`. All actions go through OneBot extension APIs
> (`send_qzone_msg`, `get_qzone_msg_list`, `get_qzone_feeds`, `like_qzone`, `comment_qzone`, `delete_qzone_msg`).

---

## How it fits together

```
NapCat (spare QQ account)
   ↓ OneBot v11 HTTP + WebSocket
Ackem QQ channel (channels/qq/) — chat, memes, dedupe
   ↓ same OneBot connection
QZone module (channels/qq/qzone/) — publish, read, like, comment
   ├─ scheduler.ts  pure functions: should we post, when is the next slot
   ├─ composer.ts   LLM copywriting (persona + time + mood + memory + recent chats)
   ├─ actions.ts    OneBot action wrappers with tolerant parsing
   ├─ interact.ts   reply to comments, like/comment friend feeds
   └─ store.ts      SQLite: posts, plan, interaction dedupe
```

- **No extra login**: the session still lives in NapCat. Ackem never stores the QQ password and starts no browser.
- **No extra port**: it reuses the OneBot connection the QQ channel already holds.
- **Backend requirement**: NapCat / SnowLuma-style backends that implement the QZone extensions.
  Chat-only backends show "backend unsupported" in settings instead of failing silently.

---

## Turning it on

1. Connect the QQ channel first (see [QQ channel setup](./qq-onebot-setup.md)).
2. Settings → Mobile / QQ → the "QZone posts" block.
3. Click "Probe QZone APIs"; at least `publish` and `read posts` must be ✓.
4. Keep **dry run** on, enable **let her post on her own**, and run for a day to review the voice.
5. Turn dry run off only when you are happy — that is when posts actually go out.

> Defaults: master switch **off**, dry run **on**. Same safety stance as the reference plugins.

---

## Settings

| Setting | Default | Notes |
|---|---|---|
| Let her post on her own | off | master switch; off leaves manual publishing only |
| Dry run | on | generate and record locally, never call `send_qzone_msg` |
| Max per day | 2 | `0` = unlimited |
| Min minutes between posts | 150 | hard floor |
| Active window | 9–23 | `start == end` means all day; `start > end` means overnight |
| Visibility | everyone | `ugc_right` 1 / 4 / 64 |
| Writing style | auto | auto picks diary / musing / meme-ish / late night by hour and mood |
| Attach one meme | off | picked by mood from `{dataRoot}/qq-memes/` merged with the built-in `assets/qq-memes/`, sent as `base64://` |
| Mention it in QQ chat | off | after a successful post, message the most recent private chat |
| Browse on a schedule | off | every 3 hours: reply once per thread, probabilistic likes/comments |
| Like / comment probability | 25% / 5% | per-run caps: 3 likes, 2 comments, 2 replies |

### Rhythm

`scheduler.ts` splits the active window into `dailyLimit` slots, jitters each slot by 0.7–1.3,
then clamps the interval into `[minInterval, 12h]`. It never fires on a fixed clock and never bursts.

Decision order: master switch → active window → daily limit → minimum interval → planned slot → publish.

---

## How the copy is written

`composer.ts` gives the model: persona voice (the same `buildPresetVoiceGuide` used in chat),
current time context, engine emotion and relationship stage, the most recent memory facts,
the last few lines of recent QQ private chats, and the openings of the last five posts
(to avoid repeating itself; a Chinese bigram Jaccard above 0.55 triggers one rewrite).

Output is sanitised (internal tags, `[SPLIT]`, `[emoji:*]`, wrapping quotes, extra blank lines)
and truncated on a sentence boundary. If the model fails, a time-of-day fallback line is used
so the scheduler never spins.

---

## Troubleshooting

- Failures appear in "Recent posts" with the raw backend error.
- Common causes:
  - `retcode 1404 / unsupported` → the backend has no QZone extensions; switch to NapCat or SnowLuma.
  - `-30001 / not logged in` → the QQ session inside NapCat expired; scan again.
  - Image upload fails → meme larger than 2 MB or an unsupported format.
- A failed publish pushes the next attempt out by 30 minutes instead of retrying every tick.

---

## Where the data lives

`{dataRoot}/ackem.db`:

- `qq_qzone_post` — every post (content, visibility, source, status, error, time, tid)
- `qq_qzone_plan` — next planned slot, daily count, last publish time per QQ account
- `qq_qzone_react` — dedupe for likes/comments/replies (same tid + person + kind once)

Deleting a history row also tries `delete_qzone_msg` for the remote post when a `tid` exists.

---

## Appendix: proactive QQ messages

`channels/qq/proactive.ts` implements the long-declared `qqProactiveEnabled` switch:

- **Gating**: explicitly enabled + 08:00–22:00 + 3h silence on both sides + 3h since the last proactive message + only the most recent chat partner
- **Copy**: reuses `companion/proactiveCompose` (same persona / memory / emotion / relationship gating as desktop)
- **Sending**: reuses `outboundSequence` + `deliveryPlanner`, so it is split into short bubbles with the occasional meme
- **Off by default**: nothing is sent unless enabled; every inbound QQ message refreshes the activity stamp, so she will not chase you right after a conversation

---

## References

- [accomplish07zrh-eng/dsh-aurabot-qq](https://github.com/accomplish07zrh-eng/dsh-aurabot-qq) — the "大肥鱼" bot: zone diary via `send_qzone_msg`, one reply per comment thread
- [kdcadmin/dsh_qzone_sticker](https://github.com/kdcadmin/dsh_qzone_sticker) — per-day limits, spacing, visibility, mood-based meme attachment
- [NapNeko/NapCatQQ · SendQzoneMsg](https://github.com/NapNeko/NapCatQQ/blob/main/packages/napcat-onebot/action/extends/SendQzoneMsg.ts) — action payload (`content` / `images` / `ugc_right` / `target_uins`)
