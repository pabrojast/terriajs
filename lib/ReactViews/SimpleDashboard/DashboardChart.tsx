import { useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import {
  BlockResult,
  DashboardBlock
} from "../../Models/SimpleDashboard/Types";
import { tr } from "./text";
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);
export default function DashboardChart({
  block,
  result,
  onDate
}: {
  block: DashboardBlock;
  result?: BlockResult;
  onDate?: (date: string) => void;
}) {
  const [table, setTable] = useState(false);
  if (!result) return <p role="status">{tr("calculating")}</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  if (block.type === "kpi")
    return (
      <p className="simple-kpi">
        {result.value === null || result.value === undefined
          ? tr("noData")
          : result.value.toLocaleString(undefined, {
              maximumFractionDigits: 3
            })}{" "}
        <small>{result.unit || block.unit}</small>
      </p>
    );
  const data = {
    labels: result.labels || [],
    datasets: (result.datasets || []).map((d, i) => ({
      ...d,
      borderColor: ["#087bac", "#c56516", "#29834c"][i % 3],
      backgroundColor: ["#087bac66", "#c5651666", "#29834c66"][i % 3],
      pointRadius: 2,
      spanGaps: false
    }))
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: { legend: { display: data.datasets.length > 1 } },
    onClick: (_event: unknown, elements: { index: number }[]) => {
      const label = data.labels[elements[0]?.index];
      if (label && /^\d{4}-\d{2}/.test(label)) onDate?.(label);
    }
  };
  const columns = result.columns?.map((c) =>
    typeof c === "string" ? { key: c, label: c } : c
  ) || [
    { key: "date", label: tr("period") },
    ...data.datasets.map((d, i) => ({ key: String(i), label: d.label }))
  ];
  const rows =
    result.rows ||
    data.labels.map((label, i) => [
      label,
      ...data.datasets.map((d) => d.data[i])
    ]);
  return (
    <>
      {block.type !== "table" && !table && (
        <div style={{ height: 210 }}>
          {block.type === "bar" ? (
            <Bar data={data} options={options} />
          ) : (
            <Line data={data} options={options} />
          )}
        </div>
      )}
      {block.type !== "table" && (
        <button type="button" onClick={() => setTable(!table)}>
          {tr("showTable")}
        </button>
      )}
      {(block.type === "table" || table) && (
        <div className="simple-table">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c, j) => (
                    <td key={c.key}>
                      {String(
                        (Array.isArray(row) ? row[j] : row[c.key]) ?? "—"
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(result.truncated || (result.total && result.total > rows.length)) && (
        <p>{tr("more")}</p>
      )}
    </>
  );
}
