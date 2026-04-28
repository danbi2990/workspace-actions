import test from "node:test";
import assert from "node:assert/strict";
import { runSettledWithConcurrency } from "../src/concurrency";

test("runSettledWithConcurrency limits active workers and preserves result order", async () => {
  let activeWorkers = 0;
  let maxActiveWorkers = 0;

  const results = await runSettledWithConcurrency(
    [1, 2, 3, 4, 5],
    2,
    async (value) => {
      activeWorkers += 1;
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeWorkers -= 1;

      return value * 10;
    },
  );

  assert.equal(maxActiveWorkers, 2);
  assert.deepEqual(
    results.map((result) => (result.ok ? result.value : undefined)),
    [10, 20, 30, 40, 50],
  );
});

test("runSettledWithConcurrency captures worker failures without stopping the queue", async () => {
  const results = await runSettledWithConcurrency(
    ["first", "second", "third"],
    2,
    async (value) => {
      if (value === "second") {
        throw new Error("boom");
      }

      return value.toUpperCase();
    },
  );

  assert.deepEqual(results[0], { ok: true, value: "FIRST" });
  assert.equal(results[1].ok, false);
  assert.match(String(results[1].ok ? "" : results[1].error), /boom/);
  assert.deepEqual(results[2], { ok: true, value: "THIRD" });
});

test("runSettledWithConcurrency treats invalid concurrency as one worker", async () => {
  let activeWorkers = 0;
  let maxActiveWorkers = 0;

  await runSettledWithConcurrency([1, 2, 3], 0, async () => {
    activeWorkers += 1;
    maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeWorkers -= 1;
  });

  assert.equal(maxActiveWorkers, 1);
});
