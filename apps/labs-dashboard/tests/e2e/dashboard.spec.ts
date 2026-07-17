import { loadEnvFile } from "node:process";

import { expect, test, type Page } from "@playwright/test";

try {
  loadEnvFile(".env.local");
} catch {
  // CI may inject the secret directly.
}

const adminSecret = process.env.LABS_ADMIN_SECRET;

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function login(page: Page) {
  if (!adminSecret) throw new Error("LABS_ADMIN_SECRET is required for E2E tests.");
  await page.goto("/login");
  await page.getByLabel("Admin secret").fill(adminSecret);
  await page.getByRole("button", { name: "Unlock Labs admin" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("anonymous internal route redirects to one login", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole("heading", { name: "Merkado Property Labs" })).toBeVisible();
});

test("anonymous admin API is rejected", async ({ request }) => {
  const response = await request.post("/api/enrichment/preview", {
    data: { scope: "listing", listingIds: [] },
  });
  expect(response.status()).toBe(401);
});

test("public browse uses safe data and labels the prototype", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  const response = await page.goto("/browse");
  expect(response?.status()).toBe(200);
  await expect(page.getByText("Experimental Labs prototype", { exact: true })).toBeVisible();
  await expect(page.getByText("RE/MAX", { exact: true }).first()).toBeVisible();
  await expect(page.locator('a[href^="/browse/"]')).toHaveCount(162);

  const detailHref = await page.locator('a[href^="/browse/"]').first().getAttribute("href");
  expect(detailHref).toBeTruthy();
  const detailResponse = await page.goto(detailHref!);
  expect(detailResponse?.status()).toBe(200);
  await expect(page.getByText("Experimental Labs Passport preview")).toBeVisible();
  await expect(page.getByText("Technical evidence metadata")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("authenticated core routes load real data without browser errors", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await login(page);

  const routes = [
    "/",
    "/listings",
    "/sources",
    "/sources/remax_curacao",
    "/enrichment",
    "/quality",
    "/settings",
    "/prototypes",
  ];
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("body"), route).not.toBeEmpty();
  }

  await page.goto("/");
  await expect(page.getByText("265", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("162", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("29", { exact: true }).first()).toBeVisible();

  await page.goto("/listings");
  const detailHref = await page.locator('a[href^="/listings/"]').first().getAttribute("href");
  expect(detailHref).toBeTruthy();
  const detailResponse = await page.goto(detailHref!);
  expect(detailResponse?.status()).toBe(200);
  await expect(page.getByRole("tab", { name: "Source data" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Evidence" })).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);

  expect(errors).toEqual([]);
});

test("navigation is consolidated and old routes redirect", async ({ page }) => {
  await login(page);
  await page.waitForLoadState("networkidle");
  const mobile = (page.viewportSize()?.width ?? 1000) < 768;
  if (mobile) {
    await page.locator('button[data-slot="sidebar-trigger"]:visible').click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  const navigation = mobile
    ? page.getByRole("dialog").locator('[data-slot="sidebar-content"]')
    : page.locator('[data-slot="sidebar-content"]:visible').last();
  await expect(navigation).toBeVisible();
  const expected = {
    Overview: "/",
    Listings: "/listings",
    Sources: "/sources",
    Enrichment: "/enrichment",
    Quality: "/quality",
    Settings: "/settings",
    Prototypes: "/prototypes",
  };
  for (const [label, href] of Object.entries(expected)) {
    const link = navigation.getByRole("link", { name: label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);
  }
  for (const route of [
    "/source-runs",
    "/eligibility",
    "/lifecycle",
    "/data-quality",
    "/realtors",
    "/how-it-works",
  ]) {
    await page.goto(route);
    await expect(page).not.toHaveURL(new RegExp(`${route}$`));
  }
});

test("prototype pages are explicit and AI execution is disabled", async ({ page }) => {
  await login(page);
  for (const route of ["/search-requests", "/what-fits-me", "/agent"]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .getByText("Experimental Labs prototype — not live on merkado.cw")
        .last(),
    ).toBeVisible();
  }

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/enrichment/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "listing",
        listingIds: ["not-a-real-id"],
      }),
    });
    return response.status;
  });
  expect(status).toBe(403);
});
