import { test } from "node:test";
import assert from "node:assert/strict";
import { publicAddress, request } from "./transport.mjs";
test("transport rejects local, mapped private and reserved addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:192.168.1.1",
    "224.0.0.1"
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("1.1.1.1"), true);
});
test("transport rejects credentials, local destinations and non-web schemes", async () => {
  for (const url of [
    "file:///etc/passwd",
    "http://127.0.0.1",
    "https://user:password@example.org",
    "http://example.org:8080"
  ])
    await assert.rejects(request(url));
});
