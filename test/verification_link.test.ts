import assert from "node:assert/strict";
import test from "node:test";
import { makeVerificationToken, tokenMatches } from "../src/matter_signup.ts";

test("a confirmation link only accepts the matter it was issued for", () => {
  const secret = "test-secret";
  const token = makeVerificationToken("matter-42", secret);

  assert.equal(tokenMatches(token, secret), "matter-42");
  assert.equal(tokenMatches(`${token}x`, secret), undefined);
});
