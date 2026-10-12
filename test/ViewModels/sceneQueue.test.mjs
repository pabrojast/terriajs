import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(
  new URL("../../lib/ViewModels/createSceneQueue.js", import.meta.url),
  "utf8"
);
const { default: createQueue } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("slow scenes apply serially and only the newest pending scene survives", async () => {
  let release;
  const started = [],
    done = [];
  const queue = createQueue(
    async (event) => {
      started.push(event);
      if (event === "A")
        await new Promise((resolve) => {
          release = resolve;
        });
    },
    (event, success, error, superseded) =>
      done.push({ event, success, superseded: !!superseded })
  );
  queue("A");
  queue("B");
  queue("C");
  assert.deepEqual(started, ["A"]);
  release();
  await tick();
  assert.deepEqual(started, ["A", "C"]);
  assert.deepEqual(done, [
    { event: "B", success: false, superseded: true },
    { event: "A", success: true, superseded: false },
    { event: "C", success: true, superseded: false }
  ]);
});

test("a failed apply reports failure and does not block the next scene", async () => {
  const done = [];
  const queue = createQueue(
    async (event) => {
      if (event === "A") throw new Error("failed");
    },
    (event, success) => done.push([event, success])
  );
  queue("A");
  queue("B");
  await tick();
  assert.deepEqual(done, [
    ["A", false],
    ["B", true]
  ]);
});
