/**
 * Post-run UX smoke: data-operations shows completed KW run; enrichment keeps 3 tabs.
 */
import { loadEnvFile } from "node:process";
import { chromium } from "playwright";

try {
  loadEnvFile(new URL("../.env.local", import.meta.url));
} catch {
  // ignore
}

const adminSecret = process.env.LABS_ADMIN_SECRET;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const runId = "9da958b8-d8d0-4cb2-90cd-a1a0de0c89df";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();

await page.goto(`${baseURL}/login`);
const secretInput = page.locator("#labs-admin-secret");
await secretInput.waitFor({ state: "visible" });
await secretInput.evaluate((element, value) => {
  const input = element;
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, adminSecret);
await page.getByRole("button", { name: "Unlock Labs admin" }).click();
await page.waitForURL(/\/$/);

await page.goto(`${baseURL}/data-operations`);
const opsText = await page.locator("body").innerText();
const findings = {
  dataOperations: {
    hasKellerWilliams: /Keller Williams/i.test(opsText),
    hasCompletedOrRecent: /completed|Recent runs/i.test(opsText),
    mentionsRunId: opsText.includes(runId.slice(0, 8)),
    noActiveQueued: !/Queued — waiting for worker/i.test(opsText),
    showsSkippedOrCost: /Skipped unchanged|USD|AI/i.test(opsText),
  },
};

await page.goto(`${baseURL}/enrichment`);
const enrichText = await page.locator("body").innerText();
findings.enrichment = {
  hasOverview: /Overview/i.test(enrichText),
  hasRuns: /Runs/i.test(enrichText),
  hasNeedsAttention: /Needs attention/i.test(enrichText),
};

await page.goto(`${baseURL}/listings?source=keller_williams_curacao`);
const listingsText = await page.locator("body").innerText();
findings.listings = {
  hasKwListings: /001JVD|Keller|listings/i.test(listingsText),
};

console.log(JSON.stringify({ ok: true, findings }, null, 2));
await browser.close();
