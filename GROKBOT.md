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
| `GROKBOT_WEBHOOK_KEY` | out | bearer token on what we send, read by Grok Bot's gateway |
| `GROKBOT_CALLBACK_SECRET` | both | the signature on every notice and every callback |
| `GROKBOT_ENABLED` | — | `true` to arm the path; anything else disables it entirely |

Two secrets, but not one per direction any more. That was the design, and
it was better: a bearer token Grok Bot held in full, and a separate secret
that only ever appeared as a signature, so reading what we send would not
let anyone forge what comes back.

Grok Bot's gateway consumes `Authorization` before their code runs and
forwards only `content-type` and `user-agent`. The outbound key therefore
never reaches the code that would have to check it, which leaves the
callback secret as the only shared secret that survives the trip in either
direction. Forced, not chosen — worth restoring if that gateway ever
forwards a header of its own.

`GROKBOT_CALLBACK_SECRET` falls back to the outbound key when unset, so the
path works before it is in place — `/routes` says plainly which of the two is
being used, and the log says so too. Since it now signs outbound notices as
well, leaving it unset means every notice fails verification at the far end
while this side reports a clean 200. Set it.

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
Content-Type: application/json

{
  "payload": {
    "type": "task" | "revision" | "cancelled",
    "job":  { "id": "...", "token": "...", "acceptBy": "<iso8601>" },
    "task": { "reference": "AC-1007-03", "sku": 52, "product": "...", "brief": "...", "note": "..." },
    "callback": "https://<project>.supabase.co/functions/v1/grokbot-callback"
  },
  "ts": <unix seconds>,
  "sig": "<hex hmac-sha256>"
}
```

### Verifying the notice

The signature is in the body, and only in the body. We used to send it as
`X-AgenticCore-Timestamp` / `X-AgenticCore-Signature` as well; those headers
never arrived. Grok Bot's gateway forwards `content-type` and `user-agent`
and nothing else — not an allowlist that can be opened. A signature a
middlebox can silently remove is not a signature, so it travels where the
data travels.

```
sig = HMAC_SHA256(GROKBOT_CALLBACK_SECRET, ts + "." + canonical_json(payload))
```

Canonical JSON means: object keys sorted, no whitespace between tokens,
UTF-8, and no HTML escaping (`&` stays `&`, never `&amp;`). Array order is
data and is left alone. Both sides must produce byte-identical text or every
signature fails for a reason invisible in the payload — see
`_shared/canonicalJson.ts`, and its tests for the cases that matter.

Reject a notice whose `ts` is more than five minutes old, and keep the seen
`(job.id, ts)` pairs for that window so a captured notice cannot be replayed
inside it.

## What Grok Bot sends back

Every callback is `POST` to the `callback` URL, signed the same way, with
`token` and `action` in the body.

| action | from | does |
| --- | --- | --- |
| `fetch` | offered, accepted, submitted | returns the full brief, payload and existing files |
| `accept` | offered | claims the job; must happen within 10 minutes. Returns `finishBy` |
| `progress` | accepted | records a note |
| `upload_url` | accepted | `{filename, fileType, idempotencyKey?}` → a one-time signed upload URL into private staging |
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

### Two deadlines

`accept` must arrive within **10 minutes** of the notice — `acceptBy` says
when. It returns **`finishBy`**, which is 45 minutes later: submit by then
or the task goes back to a built-in worker and you get a `cancelled`
notice. `fetch` returns both, so a restarted agent can recover them.

### Retries

A retried `accept` or `submit` that names something already done returns
**`200 {ok: true, repeated: true}`**, with `finishBy` on a repeated accept.
Treat it as success — answering `409` to a retry would make a completed
step look like a failure.

A genuine conflict still returns **409**: submitting a job that was closed
first, or accepting one that expired while the acceptance was in flight.
Both mean the task is already being rebuilt in-house, so stop work on it.

`upload_url` takes an optional **`idempotencyKey`** (the filename is used
when it is absent). Asking twice with the same key returns the same path
rather than staging the file twice.

### What may be published

Staged files are checked before *any* of them are promoted, so a bad file
does not leave a half-delivered order. A file is refused if it is empty,
over **50 MB**, has no declared type, or is not one of: PDF, PNG, JPEG,
WebP, GIF, MP4, MP3, plain text, CSV, ZIP, JSON, DOCX, PPTX, XLSX.

**SVG is not publishable.** It is an image everywhere except in a browser,
where it is a document that can carry script — and deliverables are served
from our own domain to our own clients.

## When it goes wrong

All four of these re-queue the task to a built-in worker and tell Fahad on
Telegram:

- nobody accepted within 10 minutes
- accepted but nothing submitted within 45 minutes
- `release` or `failed`
- the webhook could not be reached after 3 attempts
- `submit` arrived but the staged files could not be read or published
- a submission that began publishing and never finished (stuck 15 minutes)

All of these are swept by the dispatcher every 2 minutes. An agent that had
*accepted* the job is sent a `cancelled` notice so it can stop working.

An agent that hands a task back is **not offered that task again** — the
task records who returned it. The product stays routed to that agent for
every other order.

The client is owed a deliverable either way, and the framework still knows
how to make one. A task changing hands silently is how a quality problem
becomes a mystery, so none of these are quiet.

## Why files stage first

`deliverables` is public-read and a client's dashboard reads straight from
it, so a half-uploaded file there is a half-finished deliverable in front of
a paying client. Uploads land in the private `agent-staging` bucket and are
copied across in one step, only on `submit`.
