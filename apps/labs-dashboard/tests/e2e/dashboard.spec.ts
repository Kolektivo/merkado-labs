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

async function expectNoHorizontalOverflow(page: Page, route: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(
    Math.max(dimensions.document, dimensions.body),
    `${route} overflows at ${dimensions.viewport}px`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function login(page: Page) {
  if (!adminSecret) throw new Error("LABS_ADMIN_SECRET is required for E2E tests.");
  await page.goto("/login");
  const secretInput = page.locator("#labs-admin-secret");
  await secretInput.waitFor({ state: "visible" });
  // Set React controlled state via the native value setter + input event.
  await secretInput.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    );
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, adminSecret);
  await expect(page.getByRole("button", { name: "Unlock Labs admin" })).toBeEnabled({
    timeout: 10_000,
  });
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
  await expect(page.getByText("Labs preview · not live", { exact: true })).toBeVisible();
  await expect(page.getByText("RE/MAX", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Buy or rent")).toBeVisible();
  await expect(page.getByLabel("Neighbourhood")).toBeVisible();
  await expect(page.getByLabel("Min price (XCG)")).toBeVisible();
  // Public-eligible inventory drifts as sources refresh; keep a floor, not a brittle exact count.
  expect(await page.locator('a[href^="/browse/"]').count()).toBeGreaterThanOrEqual(250);

  const neighbourhoodOptions = page.locator("#browse-neighbourhood option");
  const optionLabels = (await neighbourhoodOptions.allTextContents()).map((label) =>
    label.trim(),
  );
  expect(optionLabels.filter((label) => label === "Saliña")).toHaveLength(1);
  expect(optionLabels.filter((label) => label === "Salinja")).toHaveLength(0);
  expect(optionLabels.filter((label) => label === "Marie Pampoen")).toHaveLength(1);
  expect(optionLabels.filter((label) => label === "Marie Pompoen")).toHaveLength(0);

  const salinaFilter = await page.goto("/browse?neighbourhood=Sali%C3%B1a");
  expect(salinaFilter?.status()).toBe(200);
  await expect(page).toHaveURL(/neighbourhood=Sali/);
  const salinaCount = await page.locator('a[href^="/browse/"]').count();
  expect(salinaCount).toBeGreaterThanOrEqual(1);
  const marieFilter = await page.goto(
    "/browse?neighbourhood=Marie%20Pampoen",
  );
  expect(marieFilter?.status()).toBe(200);
  await expect(page).toHaveURL(/neighbourhood=Marie(\+|%20)Pampoen/);
  expect(await page.locator('a[href^="/browse/"]').count()).toBeGreaterThanOrEqual(1);

  await page.goto("/browse");
  await expectNoHorizontalOverflow(page, "/browse");

  const detailHref = await page.locator('a[href^="/browse/"]').first().getAttribute("href");
  expect(detailHref).toBeTruthy();
  const detailResponse = await page.goto(detailHref!);
  expect(detailResponse?.status()).toBe(200);
  await expect(page.getByText("Labs preview · not live")).toBeVisible();
  await expect(page.getByText("Technical evidence metadata")).toHaveCount(0);
  // CardTitle is a div (not a heading role); assert source section + original link.
  await expect(page.getByText("Source", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open original listing/i }).first()).toBeVisible();
  await expect(page.getByText("About this property", { exact: true })).toBeVisible();
  // Language toggle appears only when Dutch is available; English is always safe.
  const nlToggle = page.getByRole("button", { name: /Nederlands/i });
  if (await nlToggle.count()) {
    await expect(page.getByRole("button", { name: /English/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /English/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await nlToggle.click();
    await expect(nlToggle).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /English/i }).click();
    await expect(page.getByRole("button", { name: /English/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await expectNoHorizontalOverflow(page, detailHref!);
  expect(errors).toEqual([]);
});

test("authenticated core routes load real data without browser errors", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await login(page);

  const routes = [
    "/",
    "/listings",
    "/data-operations",
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
    await expectNoHorizontalOverflow(page, route);
  }

  await page.goto("/");
  await expect(page.getByText("All listings", { exact: true })).toBeVisible();
  await expect(page.getByText("Public-ready", { exact: true })).toBeVisible();
  await expect(page.getByText("Healthy sources", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs review", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "What is Public-ready?" }).click();
  await expect(
    page.getByText(/Active listings with a usable price/),
  ).toBeVisible();

  await page.goto("/data-operations");
  await expect(page.getByText("Automatic refresh", { exact: true })).toBeVisible();
  await expect(page.getByText("On", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/begins on default branch/)).toBeVisible();
  await expect(page.getByText("Next scheduled run", { exact: true })).toHaveCount(0);

  await page.goto("/listings?type=rent");
  const detailHref = await page
    .locator('a[href^="/listings/"]:not([href="/listings/new"])')
    .first()
    .getAttribute("href");
  expect(detailHref).toBeTruthy();
  const detailResponse = await page.goto(detailHref!);
  expect(detailResponse?.status()).toBe(200);
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Changes & evidence" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("Asking rent", { exact: true })).toBeVisible();
  await expect(page.getByText("Original asking rent", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Rental amount from the source ad/)).toHaveCount(0);
  await expectNoHorizontalOverflow(page, detailHref!);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);

  const actionable = errors.filter(
    (message) =>
      !message.includes("favicon") &&
      !message.includes("Download the React DevTools"),
  );
  expect(actionable, `browser errors: ${actionable.join(" | ")}`).toEqual([]);
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
    "Data quality": "/quality",
    Listings: "/listings",
    "Data operations": "/data-operations",
    Sources: "/sources",
    "AI enrichment": "/enrichment",
    Settings: "/settings",
    "Public preview": "/browse",
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
    "/map",
    "/neighbourhoods",
  ]) {
    await page.goto(route);
    await expect(page).not.toHaveURL(new RegExp(`${route}$`));
  }
});

test("responsive core routes avoid horizontal overflow", async ({
  page,
}, testInfo) => {
  await login(page);
  const routes = [
    ["/", "overview"],
    ["/listings", "listings"],
    ["/sources", "sources"],
    ["/data-operations", "operations"],
    ["/enrichment", "enrichment"],
    ["/quality", "quality"],
    ["/settings", "settings"],
    ["/prototypes", "prototypes"],
  ] as const;

  for (const [route, name] of routes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page, route);
    await page.screenshot({
      path: `test-results/ux-${testInfo.project.name}-${name}.png`,
      fullPage: true,
    });
  }

  await page.goto("/data-operations");
  const recentRunsSpacing = await page
    .getByTestId("recent-runs-header")
    .evaluate((header) => {
      const card = header.closest('[data-slot="card"]');
      const content = header.nextElementSibling;
      if (!card || !content) throw new Error("Recent runs card is incomplete");
      const cardRect = card.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      return {
        cardTopPadding: Number.parseFloat(getComputedStyle(card).paddingTop),
        headerTopInset: headerRect.top - cardRect.top,
        headerTopPadding: Number.parseFloat(
          getComputedStyle(header).paddingTop,
        ),
        headerBottomPadding: Number.parseFloat(
          getComputedStyle(header).paddingBottom,
        ),
        contentBottomInset: cardRect.bottom - contentRect.bottom,
      };
    });
  expect(
    recentRunsSpacing.cardTopPadding + recentRunsSpacing.headerTopPadding,
  ).toBeGreaterThanOrEqual(12);
  expect(recentRunsSpacing.headerTopInset).toBeGreaterThanOrEqual(0);
  expect(recentRunsSpacing.headerBottomPadding).toBeGreaterThanOrEqual(12);
  expect(Math.abs(recentRunsSpacing.contentBottomInset)).toBeLessThanOrEqual(1);
});

test("responsive listings use the appropriate result view and mobile filters", async ({
  page,
}) => {
  await login(page);
  await page.goto("/listings");
  const mobile = (page.viewportSize()?.width ?? 1000) < 768;
  if (mobile) {
    await expect(page.getByTestId("listing-mobile-results")).toBeVisible();
    await expect(page.getByTestId("listing-desktop-results")).toBeHidden();
    await page.getByRole("button", { name: /Filters/ }).click();
    await expect(
      page.getByRole("heading", { name: "Filter listings" }),
    ).toBeVisible();
    const filterDialog = page.getByRole("dialog");
    await expect(filterDialog.getByLabel("Asking price")).toBeVisible();
    await expect(filterDialog.getByLabel("Realtor info")).toBeVisible();
    await expect(filterDialog.getByLabel("Neighbourhood search")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Filter listings" }),
    ).toBeHidden();
  } else {
    await expect(page.getByTestId("listing-desktop-results")).toBeVisible();
    await expect(page.getByTestId("listing-mobile-results")).toBeHidden();
  }

  await page.goto("/listings?locationGap=missing_neighbourhood&from=quality");
  let neighbourhoodSearch = page.getByLabel("Neighbourhood search");
  if (mobile) {
    await page.getByRole("button", { name: /Filters/ }).click();
    neighbourhoodSearch = page.getByRole("dialog").getByLabel(
      "Neighbourhood search",
    );
  }
  await expect(neighbourhoodSearch).toContainText(
    "Missing from neighbourhood search",
  );
});

test("progressive disclosures and enrichment views are keyboard accessible", async ({
  page,
}) => {
  await login(page);
  await page.goto("/sources");
  const technicalSummary = page.getByText("Technical details", {
    exact: true,
  });
  await expect(technicalSummary).toBeVisible();
  await technicalSummary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/Internal key:/).first(),
  ).toBeVisible();

  await page.goto("/enrichment");
  await page.getByRole("tab", { name: "Runs" }).click();
  await expect(page).toHaveURL(/\/enrichment\?view=runs$/, { timeout: 15_000 });
  await expect(page.getByRole("tab", { name: "Runs" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Needs review" }).click();
  await expect(page).toHaveURL(
    /\/enrichment\?view=attention&filter=needs_attention$/,
    { timeout: 15_000 },
  );
  await expect(
    page.getByRole("heading", { name: "Needs review" }),
  ).toBeVisible();
  const advanced = page.getByText("Advanced audit detail", { exact: true });
  await expect(advanced).toBeVisible();
  await expect(advanced.locator("xpath=..")).not.toHaveAttribute("open", "");
});

test("prototype pages are explicit and AI execution is disabled", async ({ page }) => {
  await login(page);
  for (const route of ["/search-requests", "/what-fits-me", "/agent"]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .getByText("Prototype · not live on merkado.cw")
        .last(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, route);
  }

  await page.goto("/search-requests");
  const matchReportLink = page.locator('a[href^="/match-reports/"]').first();
  if ((await matchReportLink.count()) > 0) {
    const href = await matchReportLink.getAttribute("href");
    if (href) {
      await page.goto(href);
      await expectNoHorizontalOverflow(page, href);
    }
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
