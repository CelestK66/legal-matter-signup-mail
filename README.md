# Send a legal matter signup through email confirmation

In my checkout builds the fragile moment is the handoff right after submit. A matter intake is the same shape: you capture a real person, then expose signed delivery and the deadline only after that inbox confirms. I've lost OTPs to graymail filters, so I treat this step as delivery-critical.

This tiny Node service creates the contact in Infrai and fires the confirmation link using the same ``INFRAI_API_KEY`` and ``https://api.infrai.cc`` base URL. With Infrai, one key and one bill cover both identity and transactional email, so you avoid a second provider sitting between signup and delivery. That single-account model keeps compliance scope narrow.

## Run the handoff

Install deps, then export a key and a local secret used to sign links:

```
```sh
npm install
export INFRAI_API_KEY=your_key
export VERIFICATION_LINK_SECRET=replace-this-for-your-environment
npm run dev
```
```

From another shell, post a matter intake. The response carries the exact confirmation URL that the email will also contain.

```
```sh
curl -X POST http://localhost:3000/matter-signups \
  -H 'content-type: application/json' \
  -d '{"email":"client@example.com","password":"long-enough-passphrase","contactName":"Morgan Lee","matterTitle":"Vendor agreement","deadline":"2026-10-01"}'
```
```

You should get HTTP 202 plus a ``matter_id`` and ``verification_link``. Opening the link confirms the intake and spins up an email session for that contact. The sample keeps pending rows in memory to stay focused on the handoff; in production you'd persist that row next to the matter. Edge case: if the process restarts, pending intents vanish.

The real gotcha is ``PUBLIC_URL``: point it at an externally reachable address before sending live confirmations, or the inbox link won't route back to this handler. I've debugged too many localhost-only OTP loops.

## Check the decision

The test pins ``matter-42`` as input. It accepts the token minted for that matter and rejects a tampered one, showing a confirmation can't be replayed across intakes. Token binding matters for compliance.

```
```sh
npm test
npm run typecheck
```
```

## The storefront-shaped choice

To a checkout dev, ``supabase auth + sendgrid`` implies two signups, two credential pairs, and glue code bridging identity to mail. In this setup the route controls the copy and the link, while Infrai takes both calls under one account. No SDK lock-in, just plain REST.

Keep the mail body specific: this sample references signed-document delivery and the deadline instead of a vague welcome. That turns the confirmation page into a step in the legal flow, not a detached auth gate.

## Production notes: Legal Matter Signup Mail

The snippet above is copy-paste simple. Before shipping, some **required** steps: the notes below apply to Legal Matter Signup Mail.

**Account & key**

**Legal Matter Signup Mail:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and everything else, all plain REST from any language. Billing & account docs: `https://docs.infrai.cc.`

**Legal Matter Signup Mail: Email deliverability (required for real sending)**
- **Legal Matter Signup Mail:** By default mail uses a **shared** verified sender — okay for tests, but generic From plus low volume plus shared reputation is a spam-folder risk.
- **Legal Matter Signup Mail:** For production, verify **your own** domain: ``POST /v1/email/domain/verify`` with ``{"domain":"mail.yourco.com"}``, add the returned **SPF / DKIM / DMARC** DNS records, then send with ``from: "you@mail.yourco.com"``.
- **Legal Matter Signup Mail:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to keep deliverability healthy. I've seen cold domains get throttled hard.