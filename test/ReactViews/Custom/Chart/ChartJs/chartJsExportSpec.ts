import {
  buildCsv,
  slugifyFilename
} from "../../../../../lib/ReactViews/Custom/Chart/ChartJs/chartJsExport";
import { ChartTableModel } from "../../../../../lib/ReactViews/Custom/Chart/ChartJs/ChartJsTypes";

describe("chartJsExport - buildCsv", function () {
  it("does not corrupt negative numbers with the formula-injection guard", function () {
    const model: ChartTableModel = {
      columns: [
        { key: "date", label: "Date" },
        { key: "value", label: "Value" }
      ],
      rows: [
        ["2020-01-01", -5],
        ["2020-01-02", -3.2],
        ["2020-01-03", 7]
      ]
    };
    const csv = buildCsv(model);
    expect(csv).toContain("-5");
    expect(csv).toContain("-3.2");
    // The guard must never prefix a numeric cell with an apostrophe.
    expect(csv).not.toContain("'-5");
    expect(csv).not.toContain("'-3.2");
  });

  it("prefixes the output with a single UTF-8 BOM", function () {
    const model: ChartTableModel = {
      columns: [{ key: "value", label: "Value" }],
      rows: [[1]]
    };
    const csv = buildCsv(model);
    expect(csv.charAt(0)).toBe("\uFEFF");
    expect(csv.split("\uFEFF").length - 1).toBe(1);
  });

  it("applies the formula-injection guard to string cells only", function () {
    const model: ChartTableModel = {
      columns: [{ key: "value", label: "Value" }],
      rows: [["=cmd|calc"], ["@SUM(A1)"], ["+1+2"], ["-cmd"]]
    };
    const csv = buildCsv(model);
    expect(csv).toContain("'=cmd|calc");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'+1+2");
    expect(csv).toContain("'-cmd");
  });

  it("escapes commas and quotes per CSV rules", function () {
    const model: ChartTableModel = {
      columns: [{ key: "value", label: "Value" }],
      rows: [["a,b"], ['say "hi"']]
    };
    const csv = buildCsv(model);
    // Cells containing a comma are wrapped in double quotes.
    expect(csv).toContain('"a,b"');
    // Internal quotes are doubled and the whole cell is wrapped.
    expect(csv).toContain('"say ""hi"""');
  });

  it("uses column labels for the header row", function () {
    const model: ChartTableModel = {
      columns: [
        { key: "date", label: "Date" },
        { key: "temp", label: "Temperature" }
      ],
      rows: [["2020-01-01", 12]]
    };
    const csv = buildCsv(model);
    const headerLine = csv.replace(/^\uFEFF/, "").split("\n")[0];
    expect(headerLine).toBe("Date,Temperature");
  });
});

describe("chartJsExport - slugifyFilename", function () {
  it("strips path separators to prevent directory traversal", function () {
    const slug = slugifyFilename("../../etc/passwd");
    expect(slug).not.toContain("/");
    expect(slug).not.toContain("\\");
  });

  it("strips control characters", function () {
    const slug = slugifyFilename("report:\tQ1\n2024");
    // eslint-disable-next-line no-control-regex
    expect(slug).not.toMatch(/[\x00-\x1f]/);
  });

  it("returns the fallback for empty input", function () {
    expect(slugifyFilename("")).toBe("chart");
  });

  it("strips markup characters", function () {
    const slug = slugifyFilename("<script>alert(1)</script>");
    expect(slug).not.toContain("<");
    expect(slug).not.toContain(">");
  });

  it("caps the length", function () {
    expect(slugifyFilename("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
