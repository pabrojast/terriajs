import { reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import type { FeatureCollection } from "geojson";
import {
  loadWaterJson,
  WaterBody,
  WaterDetail,
  WaterMeta,
  WaterPoint,
  WaterResolution,
  WaterSeries,
  waterBodyName,
  waterBodyPoints,
  waterClass,
  waterCsv,
  waterTrend,
  waterPeriodCrossesCutoff
} from "../../Core/WaterQuality";
import CogTimeSeriesCatalogItem from "../../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import GeoJsonCatalogItem from "../../Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import CommonStrata from "../../Models/Definition/CommonStrata";
import { useViewState } from "../Context";
import configureWaterQualityOverlay from "./configureWaterQualityOverlay";
import activateWaterQualityProduct from "./activateWaterQualityProduct";
import observeWaterQualityTimeline from "./observeWaterQualityTimeline";

const COLORS = ["#0877ac", "#bb5930", "#6e55a3"];
const format = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
        value
      );
const isoDate = (date: string) =>
  `${
    date.length === 4
      ? `${date}-01-01`
      : date.length === 7
      ? `${date}-01`
      : date
  }T00:00:00Z`;

/** Only configured pilots opt into this interface. Existing COGs are unchanged. */
const WaterQualityPanel = observer(() => {
  const { terria } = useViewState();
  const items = terria.workbench.items.filter(
    (item): item is CogTimeSeriesCatalogItem =>
      item instanceof CogTimeSeriesCatalogItem &&
      !!item.waterQuality?.dataUrl &&
      !!item.waterQuality?.product
  );
  const active = items.find((item) => item.show) ?? items[0];
  return active ? (
    <PilotPanel
      key={active.waterQuality?.pilotId}
      item={active}
      items={items}
    />
  ) : null;
});

const PilotPanel = observer(
  ({
    item,
    items
  }: {
    item: CogTimeSeriesCatalogItem;
    items: CogTimeSeriesCatalogItem[];
  }) => {
    const viewState = useViewState();
    const { terria } = viewState;
    const { i18n } = useTranslation();
    const language = i18n.language.startsWith("es")
      ? "es"
      : i18n.language.startsWith("uk")
      ? "uk"
      : "en";
    const es = language === "es";
    const text = (en: string, spanish: string) => (es ? spanish : en);
    const base = item.waterQuality!.dataUrl!;
    const product = item.waterQuality!.product!;
    const pilotId = item.waterQuality!.pilotId;
    const [meta, setMeta] = useState<WaterMeta>();
    const [bodies, setBodies] = useState<WaterBody[]>([]);
    const [series, setSeries] = useState<WaterSeries>();
    const [details, setDetails] = useState<Record<number, WaterDetail>>({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    const [collapsed, setCollapsed] = useState(
      terria.userProperties.get("narrative") === "1"
    );
    const [search, setSearch] = useState("");
    const [showTable, setShowTable] = useState(false);
    const [kind, setKind] = useState("all");
    const ids = item.waterQualityBodyIds?.join(",") ?? "";
    const selected = useMemo(
      () =>
        ids
          .split(",")
          .filter(Boolean)
          .map(Number)
          .map((id) => bodies.find((body) => body.id === id))
          .filter((body): body is WaterBody => !!body)
          .slice(0, 3),
      [ids, bodies]
    );
    const resolution = (item.activeResolution?.id ??
      "annual") as WaterResolution;
    const selectedDate = item.currentDiscreteJulianDate
      ? JulianDate.toIso8601(item.currentDiscreteJulianDate).slice(
          0,
          resolution === "annual" ? 4 : resolution === "monthly" ? 7 : 10
        )
      : "";
    const pilotItems = items.filter(
      (candidate) => candidate.waterQuality?.pilotId === pilotId
    );

    function selectBodies(next: number[]) {
      runInAction(() =>
        pilotItems.forEach((candidate) =>
          candidate.setTrait(
            CommonStrata.user,
            "waterQualityBodyIds",
            next.map(String)
          )
        )
      );
    }
    function goTo(body: WaterBody) {
      const [west, south, east, north] = body.bbox;
      terria.currentViewer
        .zoomTo(Rectangle.fromDegrees(west, south, east, north), 0.8)
        .catch(() => undefined);
    }
    function addBody(body: WaterBody) {
      selectBodies(
        selected.some((current) => current.id === body.id)
          ? selected.map((current) => current.id)
          : [...selected.map((current) => current.id), body.id].slice(-3)
      );
      goTo(body);
      setSearch("");
    }
    function setDate(date: string) {
      runInAction(() =>
        item.setTrait(CommonStrata.user, "currentTime", isoDate(date))
      );
    }
    function setResolution(next: WaterResolution) {
      runInAction(() => {
        item.setActiveResolution(CommonStrata.user, next);
        item.setActiveBand(
          CommonStrata.user,
          next === "annual" ? "mean" : "median"
        );
      });
    }
    function setProduct(key: string) {
      const next = pilotItems.find(
        (candidate) => candidate.waterQuality?.product === key
      );
      if (!next) return;
      activateWaterQualityProduct(item, next, items, resolution);
    }

    useEffect(() => observeWaterQualityTimeline(item), [item]);

    useEffect(() => {
      let live = true;
      setLoading(true);
      setError("");
      setSeries(undefined);
      Promise.all([
        loadWaterJson<WaterMeta>(base, "meta.json"),
        loadWaterJson<{ bodies: WaterBody[] }>(base, "bodies.json"),
        loadWaterJson<WaterSeries>(base, `series/${product}.json`)
      ])
        .then(([nextMeta, nextBodies, nextSeries]) => {
          if (!live) return;
          if (
            !nextMeta.products[product] ||
            !nextBodies.bodies?.length ||
            !Array.isArray(nextSeries.ids)
          )
            throw new Error("Incomplete water-quality dataset");
          setMeta(nextMeta);
          setBodies(nextBodies.bodies);
          setSeries(nextSeries);
          if (!item.waterQualityBodyIds?.length) {
            const first =
              nextBodies.bodies.find((body) => body.name && !body.note) ??
              nextBodies.bodies[0];
            runInAction(() =>
              pilotItems.forEach((candidate) =>
                candidate.setTrait(CommonStrata.user, "waterQualityBodyIds", [
                  String(first.id)
                ])
              )
            );
          }
        })
        .catch((cause) => {
          if (live) setError(String(cause.message ?? cause));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
      return () => {
        live = false;
      };
      // Catalog configuration is stable; selecting another product reruns the loader.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base, product, retry]);

    useEffect(() => {
      let live = true;
      selected.forEach((body) => {
        if (details[body.id]) return;
        loadWaterJson<WaterDetail>(base, `lake/${body.id}.json`)
          .then((detail) => {
            if (live)
              setDetails((current) => ({ ...current, [body.id]: detail }));
          })
          .catch((cause) => {
            if (live) setError(String(cause.message ?? cause));
          });
      });
      return () => {
        live = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base, ids, bodies, retry]);

    // Boundary overlay is native Terria GeoJSON. A picked body updates the same
    // selection used by the search, charts and exports.
    useEffect(() => {
      let live = true;
      const overlay = new GeoJsonCatalogItem(
        `water-quality-bodies-${pilotId}`,
        terria
      );
      loadWaterJson<FeatureCollection>(base, "lakes.json")
        .then((geojson) => {
          if (!live) return;
          configureWaterQualityOverlay(
            overlay,
            geojson,
            pilotId,
            text("Water-body boundaries", "Límites de cuerpos de agua")
          );
          runInAction(() => {
            terria.addModel(overlay);
            terria.overlays.add(overlay);
          });
        })
        .catch((cause) => {
          if (live) setError(String(cause.message ?? cause));
        });
      const stop = reaction(
        () => terria.pickedFeatures,
        (picked) => {
          picked?.allFeaturesAvailablePromise
            ?.then(() => {
              if (!live || terria.pickedFeatures !== picked) return;
              if (
                items.some(
                  (candidate) =>
                    candidate.show && candidate.waterQualityPixelMode
                )
              )
                return;
              const properties = picked.features
                .map((feature) =>
                  feature.properties?.getValue(JulianDate.now())
                )
                .find(
                  (props) =>
                    props?.waterQualityPilot === pilotId &&
                    props?.waterQualityBodyId !== undefined
                );
              if (!properties) return;
              runInAction(() => {
                items
                  .filter(
                    (candidate) => candidate.waterQuality?.pilotId === pilotId
                  )
                  .forEach((candidate) =>
                    candidate.setTrait(
                      CommonStrata.user,
                      "waterQualityBodyIds",
                      [String(properties.waterQualityBodyId)]
                    )
                  );
                viewState.featureInfoPanelIsVisible = false;
              });
              setCollapsed(false);
            })
            .catch(() => undefined);
        }
      );
      return () => {
        live = false;
        stop();
        runInAction(() => {
          terria.overlays.remove(overlay);
          terria.removeModelReferences(overlay);
          overlay.dispose();
        });
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base, pilotId, retry]);

    const productMeta = meta?.products[product];
    const plots =
      meta && series
        ? selected.map((body, index) => ({
            body,
            color: COLORS[index],
            points: waterBodyPoints(
              body.id,
              series,
              details[body.id],
              product,
              resolution,
              meta
            )
          }))
        : [];
    const dates = item.timeEntries.map((entry) =>
      (entry.time ?? "").slice(
        0,
        resolution === "annual" ? 4 : resolution === "monthly" ? 7 : 10
      )
    );
    const matches = bodies
      .filter(
        (body) =>
          (kind === "all" ||
            (kind === "river"
              ? body.kind === "river"
              : body.kind !== "river")) &&
          [body.name, body.nameEn, body.nameUk, body.id]
            .join(" ")
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())
      )
      .slice(0, 7);
    const detailLoading =
      resolution === "daily" && selected.some((body) => !details[body.id]);
    const exportBody = (body: WaterBody, points: WaterPoint[]) => {
      if (!meta) return;
      const blob = new Blob(
        [
          "\ufeff" +
            waterCsv(
              meta,
              product,
              body,
              points,
              resolution,
              details[body.id]?.products[product]
            )
        ],
        { type: "text/csv;charset=utf-8" }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${pilotId}-${product}-body-${body.id}-${resolution}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
      <Panel
        aria-label={text(
          "Water quality analysis",
          "Análisis de calidad del agua"
        )}
        data-water-quality-panel
      >
        <Header>
          <div>
            <Eyebrow>
              {text(
                "WATER QUALITY OBSERVATORY",
                "OBSERVATORIO DE CALIDAD DEL AGUA"
              )}
            </Eyebrow>
            <Title>
              {pilotId === "ukraine"
                ? text("Ukraine · Dnipro", "Ucrania · Dniéper")
                : "Madagascar"}
            </Title>
          </div>
          <IconButton
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? text("Open analysis", "Abrir análisis")
                : text("Collapse analysis", "Plegar análisis")
            }
          >
            {collapsed ? "+" : "−"}
          </IconButton>
        </Header>
        {!collapsed && (
          <Content>
            <Intro>
              {text(
                "Explore satellite observations. Select a water body to connect its map, history and data quality.",
                "Explora observaciones satelitales. Selecciona un cuerpo de agua para conectar mapa, historia y calidad del dato."
              )}
            </Intro>
            {error && (
              <Alert role="alert">
                {error}{" "}
                <Action
                  type="button"
                  onClick={() => {
                    setError("");
                    setRetry((count) => count + 1);
                  }}
                >
                  {text("Retry", "Reintentar")}
                </Action>
              </Alert>
            )}
            {loading && (
              <Status role="status">
                {text("Loading pilot data…", "Cargando datos del piloto…")}
              </Status>
            )}
            {meta && productMeta && series && !loading && (
              <>
                <Field>
                  {text("Variable", "Variable")}
                  <Select
                    aria-label={text(
                      "Water quality variable",
                      "Variable de calidad del agua"
                    )}
                    value={product}
                    onChange={(event) => setProduct(event.target.value)}
                  >
                    {pilotItems.map((candidate) => {
                      const key = candidate.waterQuality!.product!;
                      return (
                        <option key={key} value={key}>
                          {meta.products[key]?.label[language] ??
                            meta.products[key]?.label.en ??
                            key}
                        </option>
                      );
                    })}
                  </Select>
                </Field>
                <Segments
                  aria-label={text("Time resolution", "Resolución temporal")}
                >
                  {(["daily", "monthly", "annual"] as WaterResolution[])
                    .filter((mode) =>
                      item.resolutions.some((entry) => entry.id === mode)
                    )
                    .map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={resolution === mode}
                        onClick={() => setResolution(mode)}
                      >
                        {mode === "daily"
                          ? text("Daily", "Diaria")
                          : mode === "monthly"
                          ? text("Monthly", "Mensual")
                          : text("Annual", "Anual")}
                      </button>
                    ))}
                </Segments>
                <Field>
                  {text("Map date · UTC", "Fecha del mapa · UTC")}
                  <DateRow>
                    <Action
                      type="button"
                      disabled={dates.indexOf(selectedDate) <= 0}
                      aria-label={text("Previous date", "Fecha anterior")}
                      onClick={() =>
                        setDate(
                          dates[Math.max(0, dates.indexOf(selectedDate) - 1)]
                        )
                      }
                    >
                      ‹
                    </Action>
                    <Select
                      aria-label={text("Map date", "Fecha del mapa")}
                      value={selectedDate}
                      onChange={(event) => setDate(event.target.value)}
                    >
                      {dates.map((date) => (
                        <option key={date} value={date}>
                          {date}
                        </option>
                      ))}
                    </Select>
                    <Action
                      type="button"
                      aria-label={text("Next date", "Fecha siguiente")}
                      disabled={dates.indexOf(selectedDate) >= dates.length - 1}
                      onClick={() =>
                        setDate(
                          dates[
                            Math.min(
                              dates.length - 1,
                              dates.indexOf(selectedDate) + 1
                            )
                          ]
                        )
                      }
                    >
                      ›
                    </Action>
                  </DateRow>
                </Field>
                <Fine>
                  {text("Latest acquisition", "Última adquisición")}:{" "}
                  {productMeta.lastDate ?? "—"} · {productMeta.unit}
                </Fine>
                <SearchRow>
                  <Field>
                    {text("Find a water body", "Buscar cuerpo de agua")}
                    <Input
                      type="search"
                      placeholder={text("Name or ID…", "Nombre o ID…")}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </Field>
                  <Field>
                    {text("Type", "Tipo")}
                    <Select
                      aria-label={text("Body type", "Tipo de cuerpo")}
                      value={kind}
                      onChange={(event) => setKind(event.target.value)}
                    >
                      <option value="all">{text("All", "Todos")}</option>
                      <option value="lake">{text("Lakes", "Lagos")}</option>
                      <option value="river">{text("Rivers", "Ríos")}</option>
                    </Select>
                  </Field>
                </SearchRow>
                {(search || selected.length === 0) && (
                  <Results aria-label={text("Water bodies", "Cuerpos de agua")}>
                    {matches.map((body) => (
                      <button
                        type="button"
                        key={body.id}
                        onClick={() => addBody(body)}
                      >
                        {waterBodyName(body, language)}
                        <span>
                          {format(body.area)} km² · #{body.id}
                        </span>
                      </button>
                    ))}
                    {!matches.length && (
                      <Fine>
                        {text(
                          "No matching water body",
                          "No se encontraron cuerpos de agua"
                        )}
                      </Fine>
                    )}
                  </Results>
                )}
                <Fine>
                  {text(
                    "Choose up to three bodies to compare, or click a boundary on the map.",
                    "Compara hasta tres cuerpos o pulsa un contorno en el mapa."
                  )}
                </Fine>
                <Chips>
                  {selected.map((body, index) => (
                    <Chip key={body.id} $color={COLORS[index]}>
                      <button type="button" onClick={() => goTo(body)}>
                        {waterBodyName(body, language)}
                      </button>
                      <button
                        type="button"
                        aria-label={`${text(
                          "Remove",
                          "Quitar"
                        )} ${waterBodyName(body, language)}`}
                        onClick={() =>
                          selectBodies(
                            selected
                              .filter((current) => current.id !== body.id)
                              .map((current) => current.id)
                          )
                        }
                      >
                        ×
                      </button>
                    </Chip>
                  ))}
                </Chips>
                {plots.map(({ body, points, color }) => {
                  const current = points.find(
                    (point) => point.date === selectedDate
                  );
                  const row = series.ids.indexOf(body.id);
                  const trend = waterTrend(
                    waterBodyPoints(
                      body.id,
                      series,
                      details[body.id],
                      product,
                      "annual",
                      meta
                    )
                  );
                  const last = row >= 0 ? series.lastValid?.[row] : undefined;
                  const observed = details[body.id]?.products[product];
                  const observationIndex =
                    observed?.date.indexOf(selectedDate) ?? -1;
                  return (
                    <Summary key={body.id} $color={color}>
                      <strong>{waterBodyName(body, language)}</strong>
                      <Value>
                        {format(current?.value)}{" "}
                        <small>{productMeta.unit}</small>
                        <Badge>
                          {waterClass(current?.value, productMeta, language)}
                        </Badge>
                      </Value>
                      <Fine>
                        {selectedDate} ·{" "}
                        {text("Water-body core", "Núcleo del cuerpo de agua")}
                      </Fine>
                      {current?.coverage !== undefined && (
                        <Fine>
                          {text("Valid coverage", "Cobertura válida")}:{" "}
                          {format(current.coverage * 100)} %{" "}
                          {current.coverage < meta.minCoverage &&
                            `· ${text("insufficient", "insuficiente")}`}
                        </Fine>
                      )}
                      {current?.partial && (
                        <Alert>
                          {text("Partial period", "Período parcial")}:{" "}
                          {resolution === "annual"
                            ? `${current.count ?? 0} ${text(
                                "months with data",
                                "meses con datos"
                              )}`
                            : selectedDate}
                        </Alert>
                      )}
                      {(current?.value === null ||
                        current?.value === undefined) && (
                        <Fine>
                          {text(
                            "No qualifying observation for this period. Missing values are not zero.",
                            "Sin observación suficiente para este período. Sin dato no significa cero."
                          )}
                          {observationIndex >= 0 && observed
                            ? ` ${text(
                                "Observed median",
                                "Mediana observada"
                              )}: ${format(
                                observed.med[observationIndex]
                              )}; ${format(
                                observed.cov[observationIndex] * 100
                              )} %.`
                            : ""}
                        </Fine>
                      )}
                      <Fine>
                        {text(
                          "Last valid observation",
                          "Última observación válida"
                        )}
                        : {last ?? "—"}
                      </Fine>
                      {body.note && (
                        <Alert>{body.note[language] ?? body.note.en}</Alert>
                      )}
                      {meta.bodyCutoffs?.[String(body.id)] &&
                        waterPeriodCrossesCutoff(
                          selectedDate,
                          meta.bodyCutoffs[String(body.id)]
                        ) && (
                          <Alert>
                            {text(
                              "This summary includes only observations before the body cutoff. The map omits this body for composites extending past that date:",
                              "Este resumen incluye solo observaciones previas al corte. El mapa omite este cuerpo en compuestos que superan esa fecha:"
                            )}{" "}
                            {meta.bodyCutoffs[String(body.id)]}
                          </Alert>
                        )}
                      <details>
                        <summary>
                          {text(
                            "Trend and confidence",
                            "Tendencia y confianza"
                          )}
                        </summary>
                        <Fine>
                          {trend
                            ? `${text("Theil–Sen", "Theil–Sen")}: ${format(
                                trend.slope
                              )} ${productMeta.unit}/${text(
                                "year",
                                "año"
                              )}; p=${format(trend.p)}; n=${trend.years}. ${
                                trend.p <= 0.1
                                  ? text(
                                      "Significant at p ≤ 0.1.",
                                      "Significativa con p ≤ 0,1."
                                    )
                                  : text(
                                      "No significant trend.",
                                      "Sin tendencia significativa."
                                    )
                              }`
                            : text(
                                "At least five sufficiently observed years are needed for a trend. Compare individual years below.",
                                "Se requieren al menos cinco años con observaciones suficientes. Compara años individuales abajo."
                              )}
                        </Fine>
                      </details>
                    </Summary>
                  );
                })}
                {detailLoading && (
                  <Status role="status">
                    {text(
                      "Loading daily observations…",
                      "Cargando observaciones diarias…"
                    )}
                  </Status>
                )}
                {plots.length > 0 && (
                  <>
                    <SectionTitle>
                      {text(
                        "History of the selected bodies",
                        "Historia de los cuerpos seleccionados"
                      )}
                    </SectionTitle>
                    <Fine>
                      {text(
                        "Click an observation to move the map to that date. Gaps are preserved.",
                        "Pulsa una observación para mover el mapa a esa fecha. Los vacíos se conservan."
                      )}
                    </Fine>
                    <WaterChart
                      plots={
                        resolution === "daily"
                          ? plots.map((plot) => ({
                              ...plot,
                              points: plot.points.filter((point) =>
                                point.date.startsWith(selectedDate.slice(0, 4))
                              )
                            }))
                          : plots
                      }
                      date={selectedDate}
                      onDate={setDate}
                      unit={productMeta.unit}
                    />
                    <details
                      onToggle={(event) =>
                        setShowTable(event.currentTarget.open)
                      }
                    >
                      <summary>
                        {text("Data table and CSV", "Tabla de datos y CSV")}
                      </summary>
                      {showTable &&
                        plots.map(({ body, points }) => (
                          <div key={body.id}>
                            <TableTitle>
                              <strong>{waterBodyName(body, language)}</strong>
                              <Action
                                type="button"
                                disabled={!points.length}
                                onClick={() => exportBody(body, points)}
                              >
                                {text("Download CSV", "Descargar CSV")}
                              </Action>
                            </TableTitle>
                            <TableWrap tabIndex={0}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>{text("Date", "Fecha")}</th>
                                    <th>{productMeta.unit}</th>
                                    <th>
                                      {resolution === "daily"
                                        ? text("Coverage", "Cobertura")
                                        : resolution === "annual"
                                        ? text("Months", "Meses")
                                        : text("Passes", "Pasadas")}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...points].reverse().map((point) => (
                                    <tr key={point.date}>
                                      <td>
                                        <DateButton
                                          type="button"
                                          onClick={() => setDate(point.date)}
                                        >
                                          {point.date}
                                        </DateButton>
                                      </td>
                                      <td>
                                        {format(point.value)}
                                        {point.partial ? " *" : ""}
                                      </td>
                                      <td>
                                        {resolution === "daily"
                                          ? `${format(
                                              point.coverage === undefined
                                                ? undefined
                                                : point.coverage * 100
                                            )} %`
                                          : point.count ?? "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </TableWrap>
                          </div>
                        ))}
                    </details>
                  </>
                )}
                <details>
                  <summary>
                    {text("Sources and method", "Fuentes y método")}
                  </summary>
                  <Fine>
                    {meta.source} · {meta.sourceVersion} ·{" "}
                    {text("Published", "Publicado")}:{" "}
                    {meta.generatedAt.slice(0, 10)}.
                  </Fine>
                  <Fine>
                    {text(
                      "Body statistics use the water core, a minimum coverage of",
                      "Las estadísticas usan el núcleo del agua, cobertura mínima de"
                    )}{" "}
                    {meta.minCoverage * 100} %.{" "}
                    {text(
                      "Monthly = median of daily medians; annual = mean of monthly medians. Map values describe individual pixels and can differ from body summaries.",
                      "Mensual = mediana de medianas diarias; anual = media de medianas mensuales. El mapa representa píxeles individuales y puede diferir del resumen del cuerpo."
                    )}
                  </Fine>
                  <Fine>
                    {text(
                      "Chlorophyll classes are indicative; turbidity and suspended-matter classes are operational, not regulatory. Satellite screening does not establish drinking-water safety.",
                      "Las clases de clorofila son indicativas; turbidez y sólidos usan cortes operativos, no normativos. La observación satelital no determina potabilidad."
                    )}
                  </Fine>
                </details>
                <Fine>
                  {text(
                    "For a pixel series or a drawn polygon, use the map and Terria analysis tools. These are separate analyses.",
                    "Para series por píxel o un polígono dibujado, usa el mapa y las herramientas de análisis de Terria. Son análisis distintos."
                  )}
                </Fine>
                <Field>
                  <input
                    type="checkbox"
                    checked={item.waterQualityPixelMode}
                    onChange={(event) =>
                      runInAction(() => {
                        const enabled = event.target.checked;
                        pilotItems.forEach((candidate) =>
                          candidate.setTrait(
                            CommonStrata.user,
                            "waterQualityPixelMode",
                            enabled
                          )
                        );
                        if (enabled) setCollapsed(true);
                      })
                    }
                  />{" "}
                  {text(
                    "Map clicks: analyse individual pixels",
                    "Clics en el mapa: analizar píxeles individuales"
                  )}
                </Field>
                <Action
                  type="button"
                  onClick={() => {
                    setCollapsed(true);
                    viewState.openTool({
                      toolName: "cog-calculation-tool",
                      getToolComponent: () =>
                        import(
                          "../Tools/CogCalculation/CogCalculationTool"
                        ).then((module) => module.default as any),
                      params: {}
                    });
                  }}
                >
                  {text(
                    "Draw an analysis polygon",
                    "Dibujar un polígono de análisis"
                  )}
                </Action>
              </>
            )}
          </Content>
        )}
      </Panel>
    );
  }
);

function WaterChart({
  plots,
  date,
  onDate,
  unit
}: {
  plots: { body: WaterBody; color: string; points: WaterPoint[] }[];
  date: string;
  onDate: (date: string) => void;
  unit: string;
}) {
  const all = plots.flatMap((plot) => plot.points);
  const valid = all.filter(
    (point) => point.value !== null && Number.isFinite(point.value)
  );
  if (!valid.length) return <Status>{"—"}</Status>;
  const times = all.map((point) => Date.parse(isoDate(point.date)));
  const minX = Math.min(...times),
    maxX = Math.max(...times);
  const ys = valid.map((point) => point.value!);
  const minY = Math.min(0, ...ys),
    maxY = Math.max(...ys);
  const x = (point: WaterPoint) =>
    40 + ((Date.parse(isoDate(point.date)) - minX) / (maxX - minX || 1)) * 310;
  const y = (point: WaterPoint) =>
    150 - ((point.value! - minY) / (maxY - minY || 1)) * 124;
  return (
    <Chart
      viewBox="0 0 366 183"
      role="img"
      aria-label={`${unit}; ${valid.length} observations. Data table follows.`}
    >
      {[0, 0.5, 1].map((fraction) => (
        <g key={fraction}>
          <line
            x1="40"
            x2="350"
            y1={150 - fraction * 124}
            y2={150 - fraction * 124}
            stroke="#d9e5ec"
          />
          <text x="34" y={154 - fraction * 124} textAnchor="end">
            {format(minY + fraction * (maxY - minY))}
          </text>
        </g>
      ))}
      {plots.map((plot) => {
        let open = false;
        const path = plot.points
          .map((point) => {
            if (point.value === null || !Number.isFinite(point.value)) {
              open = false;
              return "";
            }
            const command = `${open ? "L" : "M"}${x(point)},${y(point)}`;
            open = true;
            return command;
          })
          .join(" ");
        return (
          <g key={plot.body.id}>
            <path d={path} stroke={plot.color} fill="none" strokeWidth="1.8" />
            {plot.points
              .filter(
                (point) => point.value !== null && Number.isFinite(point.value)
              )
              .map((point) => (
                <circle
                  key={point.date}
                  cx={x(point)}
                  cy={y(point)}
                  r={point.date === date ? 5 : 2.8}
                  fill={plot.color}
                  stroke="white"
                  strokeWidth="0.8"
                  onClick={() => onDate(point.date)}
                  style={{ cursor: "pointer" }}
                >
                  <title>{`${plot.body.name}: ${point.date}, ${format(
                    point.value
                  )} ${unit}`}</title>
                </circle>
              ))}
          </g>
        );
      })}
      <text x="40" y="175">
        {new Date(minX).toISOString().slice(0, 10)}
      </text>
      <text x="350" y="175" textAnchor="end">
        {new Date(maxX).toISOString().slice(0, 10)}
      </text>
    </Chart>
  );
}

const Panel = styled.aside`
  position: absolute;
  z-index: 12;
  top: 78px;
  right: 52px;
  width: 390px;
  max-width: calc(100% - 68px);
  max-height: calc(100% - 164px);
  display: flex;
  flex-direction: column;
  border: 1px solid #d8e4ea;
  border-radius: 12px;
  background: #fff;
  color: #173b50;
  box-shadow: 0 8px 28px #173b5026;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  button,
  input,
  select {
    font: inherit;
  }
  button {
    cursor: pointer;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  summary:focus-visible {
    outline: 3px solid #1698d3;
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  details {
    margin-top: 12px;
    border-top: 1px solid #e5edf1;
    padding-top: 10px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    color: #116b99;
  }
  @media (max-width: 767px) {
    top: auto;
    bottom: 36px;
    left: 8px;
    right: 8px;
    width: auto;
    max-width: none;
    max-height: 62%;
    border-radius: 14px;
  }
`;
const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #e5edf1;
  flex-shrink: 0;
`;
const Eyebrow = styled.div`
  font-size: 9px;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: #1975a2;
`;
const Title = styled.h2`
  margin: 2px 0 0;
  font-size: 21px;
  font-weight: 650;
  line-height: 1.25;
`;
const IconButton = styled.button`
  border: 1px solid #d8e4ea;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  background: #f4f8fa;
  color: #176a92;
  font-size: 22px !important;
`;
const Content = styled.div`
  padding: 0 18px 18px;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  scrollbar-width: thin;
`;
const Intro = styled.p`
  font-size: 12px;
  color: #4d6776;
  margin: 14px 0;
`;
const Field = styled.label`
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #476272;
  margin-top: 10px;
  flex: 1;
  min-width: 0;
`;
const Select = styled.select`
  display: block;
  width: 100%;
  min-height: 36px;
  border: 1px solid #cbdce5;
  color: #173b50;
  background: #fff;
  border-radius: 6px;
  padding: 6px 9px;
  margin-top: 4px;
`;
const Input = styled.input`
  display: block;
  width: 100%;
  min-height: 36px;
  border: 1px solid #cbdce5;
  border-radius: 6px;
  color: #173b50;
  background: #fff;
  padding: 6px 9px;
  margin-top: 4px;
`;
const DateRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  select {
    flex: 1;
    margin-top: 0;
  }
  margin-top: 4px;
`;
const Segments = styled.div`
  display: flex;
  background: #edf4f7;
  border-radius: 7px;
  padding: 3px;
  gap: 3px;
  margin: 12px 0 3px;
  button {
    border: 0;
    border-radius: 5px;
    flex: 1;
    padding: 7px 4px;
    color: #376076;
    background: transparent;
  }
  button[aria-pressed="true"] {
    background: #fff;
    color: #086b9c;
    box-shadow: 0 1px 4px #23495c26;
    font-weight: 650;
  }
`;
const Fine = styled.p`
  font-size: 11px;
  color: #5a7180;
  margin: 7px 0 0;
  overflow-wrap: anywhere;
`;
const SearchRow = styled.div`
  display: flex;
  gap: 8px;
  label:first-child {
    flex: 3;
  }
`;
const Results = styled.div`
  margin-top: 6px;
  border: 1px solid #d8e4ea;
  border-radius: 7px;
  overflow: hidden;
  button {
    display: block;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #edf2f4;
    width: 100%;
    background: #fff;
    color: #174962;
    padding: 8px 10px;
  }
  button:hover {
    background: #eef7fb;
  }
  span {
    display: block;
    font-size: 10px;
    color: #657e8b;
  }
`;
const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
`;
const Chip = styled.span<{ $color: string }>`
  display: inline-flex;
  border: 1px solid ${(p) => p.$color};
  border-radius: 15px;
  max-width: 100%;
  button {
    color: ${(p) => p.$color};
    background: #fff;
    border: 0;
    border-radius: 15px;
    padding: 4px 8px;
    font-size: 11px;
  }
`;
const Summary = styled.div<{ $color: string }>`
  border-left: 3px solid ${(p) => p.$color};
  background: #f6f9fb;
  padding: 11px 12px;
  border-radius: 0 7px 7px 0;
  margin-top: 12px;
`;
const Value = styled.div`
  font-size: 25px;
  font-weight: 650;
  line-height: 1.5;
  margin-top: 3px;
  small {
    font-size: 11px;
    font-weight: 400;
  }
`;
const Badge = styled.span`
  display: inline-block;
  font-size: 10px;
  font-weight: 550;
  background: #e5f0f4;
  padding: 2px 7px;
  border-radius: 10px;
  margin-left: 8px;
  vertical-align: middle;
`;
const Alert = styled.div`
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #e4cf9c;
  background: #fff8e9;
  color: #70581e;
  font-size: 11px;
`;
const Status = styled.p`
  font-size: 12px;
  color: #527082;
  padding: 10px 0;
`;
const SectionTitle = styled.h3`
  font-size: 13px;
  margin: 18px 0 0;
`;
const Action = styled.button`
  min-height: 32px;
  border-radius: 5px;
  border: 1px solid #c6dce8;
  background: #f1f7fa;
  color: #096b9b;
  padding: 5px 10px;
  font-size: 11px !important;
`;
const Chart = styled.svg`
  width: 100%;
  height: auto;
  margin-top: 9px;
  text {
    fill: #617786;
    font-size: 9px;
  }
`;
const TableTitle = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 7px;
  font-size: 11px;
`;
const TableWrap = styled.div`
  overflow: auto;
  max-height: 240px;
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 11px;
  }
  th,
  td {
    text-align: right;
    padding: 5px 7px;
    border-bottom: 1px solid #e5edf1;
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  th {
    position: sticky;
    top: 0;
    background: #eef4f7;
  }
`;
const DateButton = styled.button`
  color: #096b9b;
  background: transparent;
  border: 0;
  padding: 3px 0;
  text-decoration: underline;
`;
export default WaterQualityPanel;
