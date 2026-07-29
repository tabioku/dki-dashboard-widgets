// Fetches status counts from the 5 DKI Notion databases and writes data.json
// Runs via GitHub Actions on a schedule. Requires NOTION_TOKEN env var (set as a repo secret).

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = "2025-09-03";

// Data source IDs (from Notion) and how their Status values map to our 3 buckets.
// "notStarted" / "paused" / "started" values here are the exact Status option names
// used in each database. Anything not listed (e.g. Done, Scheduled, Uploaded) is
// treated as completed and excluded from the chart.
const SOURCES = [
  {
    name: "General Tasks",
    id: "3ac805f2-62d0-8033-bfaa-000b49fdc881",
    notStarted: ["Not started"],
    paused: ["Paused"],
    started: ["In progress"]
  },
  {
    name: "Google Ads",
    id: "3ac805f2-62d0-8010-8538-000bdbf74798",
    notStarted: ["Not Started"],
    paused: ["Paused"],
    started: ["Started"]
  },
  {
    name: "Shopee",
    id: "3ac805f2-62d0-80cd-a2df-000b23e07d05",
    notStarted: ["Not Started"],
    paused: ["Paused"],
    started: ["Started"]
  },
  {
    name: "DKI Content",
    id: "3ac805f2-62d0-806c-9b3c-000bf327a5a9",
    notStarted: ["Idea"],
    paused: [],
    started: ["Built", "In progress"]
  },
  {
    name: "DIPA Content",
    id: "3ac805f2-62d0-805d-800a-000bc06552aa",
    notStarted: ["Idea"],
    paused: [],
    started: ["In progress"]
  }
];

async function queryDataSource(dataSourceId) {
  const results = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {})
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API error for ${dataSourceId}: ${res.status} ${text}`);
    }

    const json = await res.json();
    results.push(...json.results);
    hasMore = json.has_more;
    cursor = json.next_cursor;
  }

  return results;
}

function getStatusName(page) {
  const statusProp = page.properties?.Status;
  if (!statusProp || statusProp.type !== "status" || !statusProp.status) return null;
  return statusProp.status.name;
}

async function main() {
  if (!NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN environment variable is not set.");
  }

  let totalNotStarted = 0;
  let totalPaused = 0;
  let totalStarted = 0;
  const breakdown = [];

  for (const source of SOURCES) {
    const pages = await queryDataSource(source.id);

    let notStarted = 0;
    let paused = 0;
    let started = 0;

    for (const page of pages) {
      const status = getStatusName(page);
      if (!status) continue;
      if (source.notStarted.includes(status)) notStarted++;
      else if (source.paused.includes(status)) paused++;
      else if (source.started.includes(status)) started++;
      // anything else (Done, Scheduled, Uploaded, etc.) is intentionally excluded
    }

    totalNotStarted += notStarted;
    totalPaused += paused;
    totalStarted += started;

    breakdown.push({ name: source.name, notStarted, paused, started });
  }

  const output = {
    updated: new Date().toISOString(),
    notStarted: totalNotStarted,
    paused: totalPaused,
    started: totalStarted,
    breakdown
  };

  const fs = await import("fs");
  fs.writeFileSync("data.json", JSON.stringify(output, null, 2));
  console.log("Wrote data.json:", output);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
