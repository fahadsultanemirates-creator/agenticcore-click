# Shared AgenticCore operations

The existing .click Telegram bot remains the single operator entry point. Its webhook, owner allowlist, Grok Bot handoff and manual-mode setting are retained. Separate bridge credentials connect Group, Biz and Agency without merging customer accounts or exposing their service-role keys.

## Operator commands

- `/gorders`: recent Group, Biz and Agency references (up to five per site).
- Attach a file with caption `/deliver GRP-<order UUID>`, `/deliver BIZ-<request UUID>`, or `/deliver AGN-<request UUID>`.
- `/gprogress GRP-<order UUID> in_progress` (or `pending`, `needs_information`).
- Existing `.click` commands and `AC-...` task references continue to work.

Cross-site attachments are limited to 15 MB. They are stored in private buckets and published to the correct customer dashboard. A file delivery never marks a payment as received. Bridge publication is idempotent by Telegram chat/message reference. Larger files and external delivery links can be coordinated manually through the existing support channels.

## Payments

USDT on BNB Smart Chain retains the existing .click detector. Group orders have their own exact reference amounts, with fractions distinct from .click's USDT invoice namespace.

AC Token contract: `0xe9568888a0bc317519957047cf736e134B097768` on BNB Smart Chain. Fixed **service-payment** conversion: `$0.0000006 / AC` until `2027-04-29T00:00:00Z`, with 10% off before conversion. The original token site supplies the contract identity; the owner supplied the new service-payment rate. This does not modify any on-chain presale contract or promise a market price.

Group AC invoices use six token decimal places for reference fractions; .click AC wallet invoices use eight with a nonzero final two digits. Neither nonce sequence cycles. Matchers verify the contract symbol/decimals, recipient, exact raw amount and at least 15 confirmations. Atomic credit functions prevent replay within each ledger. Group first-installment confirmation credits the amount due, not all four installments. Existing older Group invoices without a reference amount remain manually reviewed.

Agency and Biz retain their existing billing/payment paths in this phase; their shared-bot adapters cover alerts and delivery. Do not claim their AC checkouts have been migrated.

## Providers

- OpenAI: website/code, document/social work, intake and conversations when `OPENAI_API_KEY` is configured in the **.click Supabase project**. Default model `gpt-6.1-sol`, high reasoning; `OPENAI_MODEL` and `AI_PROVIDER_<ROLE>` are server overrides.
- Claude: business-report worker; fallback for established text routes until an OpenAI secret exists.
- xAI/Grok: existing media helpers and Grok Bot handoff. Existing avatar-video paths remain intact.

Manual mode is still on. Group managed plans are service packages, not single .click catalogue jobs: package purchase does not dispatch an entire monthly allowance as one automated task. Major work may be produced by the owner and returned through the bot.

## Deployment and remaining setup

`supabase/functions` deploys to .click. `integrations/legacy-site-bridge` deploys as `framework-bridge` to Biz and Agency. Group's bridge and database scripts live in the Group repository. Bridge keys are provisioned server-side and never committed. The minute sweep is registered in .click's existing pg_cron environment; it calls the authenticated `framework-sync` endpoint using its server-held key.

OpenAI key activation requires `OPENAI_API_KEY`; no secret is embedded in source. Automated customer WhatsApp delivery is not configured: public WhatsApp links provide manual support, not the WhatsApp Business API. Markets and gaming are not connected in this phase.
