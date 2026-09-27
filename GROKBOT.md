# Handing a task to Grok Bot

Grok Bot is the first worker we do not run. It has no database credentials,
no service role key and no storage access beyond what it is handed. This is
the contract between it and the framework.

## Switching it on

Two Edge Function secrets, in Supabase → project `vuutmxrunxkjydcryeoa` →
Edge Functions → Secrets:

| Secret | Direction | What it is |
| --- | --- | --- |
| `GROKBOT_WEBHOOK_URL` | out | the URL the notice is POSTed to |
| `GROKBOT_WEBHOOK_KEY` | out | bearer token and signature on what we send |
| `GROKBOT_CALLBACK_SECRET` | in | the signature on everything Grok Bot sends back |
| `GROKBOT_ENABLED` | — | `true` to arm the path; anything else disables it entirely |

Two secrets, one per direction, on purpose. The outbound key is a bearer
token Grok Bot holds in full; the callback secret only ever appears as a
signature. One key doing both jobs would mean anyone who could read what we
send could also forge what comes back.

`GROKBOT_CALLBACK_SECRET` falls back to the outbound key when unset, so the
path works before it is in place — and `/routes` says plainly which of the
two is being used.

The handoff document named the two values but not the variables, so the code
also accepts `GROKBOT_URL` / `GROK_BOT_WEBHOOK_URL` for the first and
`GROKBOT_KEY` / `GROKBOT_SECRET` / `GROKBOT_API_KEY` / `GROK_BOT_KEY` for the
second, and logs which name it actually found. Rename them to the two in the
table when convenient.

`GROKBOT_ENABLED` is the kill switch. Unset it and every task goes back to a
built-in worker immediately, whatever the routes say.

## Choosing what goes out

Nothing goes out until somebody says so:

```
/assign 52 grokbot     send that product to Grok Bot
/unassign 52           bring it back in-house
/routes                what currently goes out, and whether the switch is on
/jobs                  open external jobs
/fallback AC-1007-03   take one back by hand, without waiting for the deadline
```

The order of decision, in `agentRouting.ts` and tested there:

1. kill switch off → built-in
2. `source = 'owner'` → built-in, always (you talk to Grok Bot directly)
3. the task's own `assigned_agent`
4. the product's route
5. built-in

## What we send

A thin notice — the job, the product, the brief. Not the client, not the
account, nothing else on the row. Everything else Grok Bot fetches with its
token, so access is checked when it is used rather than assumed when it is
sent.

```
POST <GROKBOT_WEBHOOK_URL>
Authorization: Bearer <GROKBOT_WEBHOOK_KEY>
X-AgenticCore-Timestamp: <unix seconds>
X-AgenticCore-Signature: <hex hmac-sha256 of "timestamp.body">

{
  "type": "task" | "revision" | "cancelled",
  "job":  { "id": "...", "token": "...", "acceptBy": "<iso8601>" },
  "task": { "reference": "AC-1007-03", "sku": 52, "product": "...", "brief": "...", "note": "..." },
  "callback": "https://<project>.supabase.co/functions/v1/grokbot-callback"
}
```

## What Grok Bot sends back

Every callback is `POST` to the `callback` URL, signed the same way, with
`token` and `action` in the body.

| action | from | does |
| --- | --- | --- |
| `fetch` | offered, accepted, submitted | returns the full brief, payload and existing files |
| `accept` | offered | claims the job; must happen within 10 minutes |
| `progress` | accepted | records a note, keeps the job alive |
| `upload_url` | accepted | `{filename, fileType}` → a one-time signed upload URL into private staging |
| `submit` | accepted | promotes everything staged into the client's deliverables and closes the task |
| `needs_info` | offered, accepted | `{question}` → task goes to `needs_info`, owner is told |
| `release` | offered, accepted | hands the job back |
| `failed` | offered, accepted | reports it could not be done |

Callbacks are signed with `GROKBOT_CALLBACK_SECRET`; the notice we send is
signed with `GROKBOT_WEBHOOK_KEY`. Both use the same scheme.

The signature covers the timestamp and the exact body bytes, and is refused
if the timestamp is more than five minutes old — otherwise one captured
callback could be replayed to deliver or fail a task again later.

A closed job (`delivered`, `released`, `failed`, `expired`) refuses every
action. By then the task has already been re-queued in-house, and a late
callback would deliver the same work twice.

## When it goes wrong

All four of these re-queue the task to a built-in worker and tell Fahad on
Telegram:

- nobody accepted within 10 minutes (swept by the dispatcher every 2 minutes)
- `release` or `failed`
- the webhook could not be reached at all
- `submit` arrived but the staged files could not be read

The client is owed a deliverable either way, and the framework still knows
how to make one. A task changing hands silently is how a quality problem
becomes a mystery, so none of these are quiet.

## Why files stage first

`deliverables` is public-read and a client's dashboard reads straight from
it, so a half-uploaded file there is a half-finished deliverable in front of
a paying client. Uploads land in the private `agent-staging` bucket and are
copied across in one step, only on `submit`.
