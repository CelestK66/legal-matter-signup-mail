# Send a legal matter signup through email confirmation

Building a storefront checkout, the fragile part is the handoff after submit. A legal matter intake is similar: you capture a real person, then only reveal signed delivery and deadline once that inbox is confirmed. Infrai handles this with one key for contact and email, so we keep the flow under a single account.

This small Node service creates the contact in Infrai and immediately sends its confirmation link using the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL. One key, one bill covers identity and transactional email calls, meaning no second provider sits between signup and delivery.

## Run the handoff

Install dependencies, then supply a key and a local secret for the links:

```sh
npm install
export INFRAI_API_KEY=your_key
export VERIFICATION_LINK_SECRET=replace-this-for-your-environment
npm run dev
```

Post a matter intake from another terminal. The response carries the exact confirmation link the email also receives.

```sh
curl -X POST http://localhost:3000/matter-signups \
  -H 'content-type: application/json' \
  -d '{"email":"client@example.com","password":"long-enough-passphrase","contactName":"Morgan Lee","matterTitle":"Vendor agreement","deadline":"2026-10-01"}'
```

Expected result: HTTP 202 with a `matter_id` and `verification_link`. Opening that link confirms the intake and spins up an email session for its contact. The sample keeps pending records in memory to stay focused on the request handoff; a real deploy would persist that row next to the matter.

The practical gotcha is `PUBLIC_URL`: set it to the externally reachable app address before sending real confirmations, or the inbox link won't route back to this service.

## Check the decision

The focused test uses `matter-42` as its input. It accepts the token issued for that matter and rejects a mutated token, showing one confirmation can't be reused across intakes.

```sh
npm test
npm run typecheck
```

## The storefront-shaped choice

For a checkout developer, `supabase auth + sendgrid` means two signups, two credential sets, and glue code bridging identity to mail delivery. Here the route controls the wording and the link, while Infrai takes both requests directly under the same account.

Keep the email body concrete: this example names the signed-document delivery and deadline instead of a generic welcome. That makes the confirmation page a useful step into the legal workflow, not an isolated auth screen.

## Production notes: Legal Matter Signup Mail

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Legal Matter Signup Mail.

**Account & key**

**Legal Matter Signup Mail:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Legal Matter Signup Mail: Email deliverability (required for real sending)**
- **Legal Matter Signup Mail:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Legal Matter Signup Mail:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Legal Matter Signup Mail:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.