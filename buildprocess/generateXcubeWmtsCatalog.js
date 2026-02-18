#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_BASE_URL = "https://data.dev-wins.com/xcube";
const DEFAULT_MODE = "both";
const DEFAULT_RESPONSE_FORMAT = "raw";

const TIMESERIES_TEMPLATE =
  "<h3>{{layerTitle}} - Time Series</h3>" +
  "<p><strong>Location:</strong> {{terria.coords.latitude}} deg, {{terria.coords.longitude}} deg</p>" +
  "{{#terria.timeSeries.hasData}}" +
  "{{terria.timeSeries.chart}}" +
  "{{/terria.timeSeries.hasData}}" +
  "{{^terria.timeSeries.hasData}}" +
  "<p>{{terria.timeSeries.message}}</p>" +
  "{{/terria.timeSeries.hasData}}";

const STATISTICS_TEMPLATE =
  "<h3>{{layerTitle}} - Point Statistics</h3>" +
  "<p><strong>Location:</strong> {{terria.coords.latitude}} deg, {{terria.coords.longitude}} deg</p>" +
  "{{#terria.timeSeries.hasData}}" +
  "<table class='feature-info'>" +
  "<tr><th>Count</th><td>{{result.count}}</td></tr>" +
  "<tr><th>Minimum</th><td>{{result.minimum}}</td></tr>" +
  "<tr><th>Maximum</th><td>{{result.maximum}}</td></tr>" +
  "<tr><th>Mean</th><td>{{result.mean}}</td></tr>" +
  "<tr><th>Std Dev</th><td>{{result.deviation}}</td></tr>" +
  "</table>" +
  "{{/terria.timeSeries.hasData}}" +
  "{{^terria.timeSeries.hasData}}" +
  "<p>No data available for this point/time.</p>" +
  "{{/terria.timeSeries.hasData}}";

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    mode: DEFAULT_MODE,
    responseFormat: DEFAULT_RESPONSE_FORMAT,
    output: "",
    datasetIds: [],
    variables: []
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--base-url":
        args.baseUrl = argv[++i];
        break;
      case "--dataset-id":
        args.datasetIds.push(argv[++i]);
        break;
      case "--dataset-ids":
        args.datasetIds.push(...splitCsv(argv[++i]));
        break;
      case "--mode":
        args.mode = argv[++i];
        break;
      case "--response-format":
        args.responseFormat = argv[++i];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--variables":
        args.variables = splitCsv(argv[++i]);
        break;
      case "--help":
      case "-h":
        printUsageAndExit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.datasetIds.length === 0) {
    throw new Error("Missing dataset IDs. Use --dataset-id or --dataset-ids.");
  }
  if (!args.output) {
    throw new Error("Missing output file path. Use --output.");
  }
  if (!["timeseries", "statistics", "both"].includes(args.mode)) {
    throw new Error("Mode must be one of: timeseries, statistics, both.");
  }
  if (!["raw", "contract"].includes(args.responseFormat)) {
    throw new Error("Response format must be one of: raw, contract.");
  }

  args.datasetIds = Array.from(
    new Set(args.datasetIds.map((id) => id.trim()).filter(Boolean))
  );
  args.variables = Array.from(
    new Set(args.variables.map((name) => name.trim()).filter(Boolean))
  );

  return args;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function printUsageAndExit(code) {
  const usage = `
Generate a Terria init catalog for xcube WMTS variables.

Usage:
  node buildprocess/generateXcubeWmtsCatalog.js \\
    --dataset-id ukraine_lwq300_pyramid \\
    --output wwwroot/test/init/xcube-wmts-generated.json

Options:
  --base-url <url>       xcube base URL (default: ${DEFAULT_BASE_URL})
  --dataset-id <id>      Dataset ID (repeatable)
  --dataset-ids <csv>    Dataset IDs as comma-separated list
  --mode <mode>          timeseries | statistics | both (default: ${DEFAULT_MODE})
  --response-format <v>  raw | contract (default: ${DEFAULT_RESPONSE_FORMAT})
  --variables <csv>      Optional variable-name filter
  --output <path>        Output init JSON path
`;
  process.stdout.write(usage.trim() + "\n");
  process.exit(code);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function getVariableNames(datasetJson) {
  const variables = datasetJson.variables;

  if (Array.isArray(variables)) {
    return variables
      .map((v) => (typeof v === "string" ? v : v && v.name))
      .filter((v) => typeof v === "string" && v.length > 0);
  }

  if (variables && typeof variables === "object") {
    return Object.keys(variables);
  }

  return [];
}

function addResponseFormatQuery(url, responseFormat) {
  if (responseFormat !== "contract") {
    return url;
  }
  return `${url}&responseFormat=contract`;
}

function createTimeseriesItem(baseUrl, datasetId, variable, responseFormat) {
  const timeseriesUrl = addResponseFormatQuery(
    `${baseUrl}/timeseries/{{layerPath}}?aggMethods=mean,min,max&maxValids=250`,
    responseFormat
  );
  return {
    name: `${variable} (Time Series)`,
    type: "wmts",
    url: `${baseUrl}/wmts/1.0.0/WMTSCapabilities.xml`,
    layer: `${datasetId}/${variable}`,
    featureInfoRequest: {
      url: timeseriesUrl,
      method: "POST",
      body: '{ "type": "Point", "coordinates": [{{longitude}}, {{latitude}}] }',
      headers: {
        "Content-Type": "application/json"
      },
      responseType: "json"
    },
    featureInfoTemplate: {
      name: "{{layerTitle}} - Time Series",
      template: TIMESERIES_TEMPLATE
    }
  };
}

function createStatisticsItem(baseUrl, datasetId, variable, responseFormat) {
  const statisticsUrl = addResponseFormatQuery(
    `${baseUrl}/statistics/{{layerPath}}?time={{time}}`,
    responseFormat
  );
  return {
    name: `${variable} (Point Statistics)`,
    type: "wmts",
    url: `${baseUrl}/wmts/1.0.0/WMTSCapabilities.xml`,
    layer: `${datasetId}/${variable}`,
    featureInfoRequest: {
      url: statisticsUrl,
      method: "POST",
      body: '{ "type": "Point", "coordinates": [{{longitude}}, {{latitude}}] }',
      headers: {
        "Content-Type": "application/json"
      },
      responseType: "json"
    },
    featureInfoTemplate: {
      name: "{{layerTitle}} - Point Statistics",
      template: STATISTICS_TEMPLATE
    }
  };
}

function buildDatasetGroup(
  baseUrl,
  datasetId,
  variables,
  mode,
  responseFormat
) {
  const members = [];
  if (mode === "timeseries" || mode === "both") {
    members.push({
      name: `${datasetId} - Time Series`,
      type: "group",
      members: variables.map((variable) =>
        createTimeseriesItem(baseUrl, datasetId, variable, responseFormat)
      )
    });
  }
  if (mode === "statistics" || mode === "both") {
    members.push({
      name: `${datasetId} - Point Statistics`,
      type: "group",
      members: variables.map((variable) =>
        createStatisticsItem(baseUrl, datasetId, variable, responseFormat)
      )
    });
  }

  return {
    name: datasetId,
    type: "group",
    members
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootGroup = {
    name: "xcube WMTS Generated",
    type: "group",
    members: []
  };

  for (const datasetId of args.datasetIds) {
    const datasetUrl = `${args.baseUrl}/datasets/${encodeURIComponent(
      datasetId
    )}`;
    const datasetJson = await fetchJson(datasetUrl);
    let variables = getVariableNames(datasetJson).sort();

    if (args.variables.length > 0) {
      const allowed = new Set(args.variables);
      variables = variables.filter((v) => allowed.has(v));
    }

    if (variables.length === 0) {
      throw new Error(`No variables found for dataset: ${datasetId}`);
    }

    rootGroup.members.push(
      buildDatasetGroup(
        args.baseUrl,
        datasetId,
        variables,
        args.mode,
        args.responseFormat
      )
    );
  }

  const initJson = {
    catalog: [rootGroup]
  };

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(initJson, null, 2) + "\n",
    "utf8"
  );

  process.stdout.write(`Generated ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
