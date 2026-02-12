import { runInAction } from "mobx";
import { observer } from "mobx-react";
import { ChangeEvent, FC, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import { JsonObject } from "../../../Core/Json";
import CommonStrata from "../../../Models/Definition/CommonStrata";
import { BaseModel } from "../../../Models/Definition/Model";
import StacCollectionCatalogItem from "../../../Models/Catalog/Stac/StacCollectionCatalogItem";
import UserDrawing from "../../../Models/UserDrawing";
import Box from "../../../Styled/Box";
import { RawButton } from "../../../Styled/Button";
import Input, { StyledTextArea } from "../../../Styled/Input";
import Select from "../../../Styled/Select";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";

interface FormState {
  itemsQueryMode: string;
  maximumItems: string;
  itemsPageSize: string;
  itemsPageLimit: string;
  dateTimeFilter: string;
  bboxFilter: string;
  sortBy: string;
  filterExpression: string;
  filterLanguage: string;
  intersectsGeometry: string;
  additionalQueryParameters: string;
  requestTimeoutSeconds: string;
  requestRetryAttempts: string;
  requestRetryDelaySeconds: string;
  previewRequestSizeLimit: string;
  previewRequestNumberLimit: string;
}

const StacCollectionSection: FC<{ item: BaseModel }> = observer(({ item }) => {
  if (!(item instanceof StacCollectionCatalogItem)) {
    return null;
  }

  const drawingRef = useRef<UserDrawing | undefined>(undefined);
  const initialState = useMemo(() => getInitialFormState(item), [item]);
  const [form, setForm] = useState<FormState>(initialState);
  const [isApplying, setIsApplying] = useState(false);
  const [drawingMode, setDrawingMode] = useState<"polygon" | "rectangle">();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    setForm(initialState);
    setErrorMessage(undefined);
  }, [initialState]);

  useEffect(() => {
    return () => {
      if (drawingRef.current) {
        drawingRef.current.endDrawing();
        drawingRef.current = undefined;
      }
    };
  }, []);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const applyIntersectsGeometry = (
    geometry: JsonObject,
    bbox?: number[],
    warning?: string
  ) => {
    setForm((prev) => ({
      ...prev,
      intersectsGeometry: stringifyOptionalJson(geometry),
      bboxFilter: bbox ? bbox.join(",") : prev.bboxFilter
    }));
    setErrorMessage(warning);
  };

  const stopDrawing = () => {
    if (drawingRef.current) {
      drawingRef.current.endDrawing();
      drawingRef.current = undefined;
    }
    setDrawingMode(undefined);
  };

  const startPolygonDrawing = () => {
    stopDrawing();
    setErrorMessage(undefined);

    const userDrawing = new UserDrawing({
      terria: item.terria,
      messageHeader: "Draw intersects polygon",
      onDrawingComplete: ({ points }) => {
        const geometry = polygonGeometryFromPoints(points);
        const bbox = bboxFromCartesianPoints(points);
        if (!geometry) {
          setErrorMessage(
            "Polygon drawing needs at least 3 valid points to build intersects geometry."
          );
          return;
        }
        applyIntersectsGeometry(
          geometry,
          bbox,
          bbox
            ? undefined
            : "Intersects updated. BBOX was not auto-filled because the polygon appears to cross the antimeridian (>180°)."
        );
      },
      onCleanUp: () => {
        if (drawingRef.current === userDrawing) {
          drawingRef.current = undefined;
        }
        setDrawingMode(undefined);
      }
    });

    drawingRef.current = userDrawing;
    setDrawingMode("polygon");
    userDrawing.enterDrawMode();
  };

  const startRectangleDrawing = () => {
    stopDrawing();
    setErrorMessage(undefined);

    const userDrawing = new UserDrawing({
      terria: item.terria,
      messageHeader: "Draw intersects rectangle",
      drawRectangle: true,
      onDrawingComplete: ({ rectangle, points }) => {
        const geometry =
          (rectangle && polygonGeometryFromRectangle(rectangle)) ||
          polygonGeometryFromTwoPoints(points);
        const bbox =
          (rectangle && bboxFromRectangle(rectangle)) || bboxFromPoints(points);
        if (!geometry) {
          setErrorMessage(
            "Rectangle drawing needs 2 valid points to build intersects geometry."
          );
          return;
        }
        applyIntersectsGeometry(
          geometry,
          bbox,
          bbox
            ? undefined
            : "Intersects updated. BBOX was not auto-filled because the rectangle appears to cross the antimeridian (>180°)."
        );
      },
      onCleanUp: () => {
        if (drawingRef.current === userDrawing) {
          drawingRef.current = undefined;
        }
        setDrawingMode(undefined);
      }
    });

    drawingRef.current = userDrawing;
    setDrawingMode("rectangle");
    userDrawing.enterDrawMode();
  };

  const onApply = async () => {
    if (drawingMode) {
      setErrorMessage("Finish or cancel map drawing before applying.");
      return;
    }

    const parsedBbox = parseBbox(form.bboxFilter);
    if (form.bboxFilter.trim().length > 0 && !parsedBbox) {
      setErrorMessage(
        "Bounding box must be west,south,east,north in WGS84 (lon/lat), with valid ranges and east>west, north>south."
      );
      return;
    }
    const parsedIntersectsGeometry = parseOptionalJsonObject(
      form.intersectsGeometry
    );
    if (
      form.intersectsGeometry.trim().length > 0 &&
      parsedIntersectsGeometry === null
    ) {
      setErrorMessage("Intersects geometry must be a valid JSON object.");
      return;
    }
    if (
      parsedIntersectsGeometry !== undefined &&
      parsedIntersectsGeometry !== null &&
      !isGeoJsonGeometry(parsedIntersectsGeometry)
    ) {
      setErrorMessage(
        "Intersects geometry must be a valid GeoJSON geometry object."
      );
      return;
    }

    const parsedAdditionalQueryParameters = parseOptionalJsonObject(
      form.additionalQueryParameters
    );
    if (
      form.additionalQueryParameters.trim().length > 0 &&
      parsedAdditionalQueryParameters === null
    ) {
      setErrorMessage(
        "Additional query parameters must be a valid JSON object."
      );
      return;
    }
    const intersectsGeometry =
      parsedIntersectsGeometry === null ? undefined : parsedIntersectsGeometry;
    const additionalQueryParameters =
      parsedAdditionalQueryParameters === null
        ? undefined
        : parsedAdditionalQueryParameters;

    const maximumItems = parsePositiveInteger(form.maximumItems);
    const itemsPageSize = parsePositiveInteger(form.itemsPageSize);
    const itemsPageLimit = parsePositiveInteger(form.itemsPageLimit);
    const requestTimeoutSeconds = parsePositiveInteger(
      form.requestTimeoutSeconds
    );
    const requestRetryAttempts = parseNonNegativeInteger(
      form.requestRetryAttempts
    );
    const requestRetryDelaySeconds = parseNonNegativeNumber(
      form.requestRetryDelaySeconds
    );
    const previewRequestSizeLimit = parsePositiveInteger(
      form.previewRequestSizeLimit
    );
    const previewRequestNumberLimit = parsePositiveInteger(
      form.previewRequestNumberLimit
    );

    const invalidField = getFirstInvalidField([
      [form.maximumItems, maximumItems, "Maximum items"],
      [form.itemsPageSize, itemsPageSize, "Items page size"],
      [form.itemsPageLimit, itemsPageLimit, "Items page limit"],
      [form.requestTimeoutSeconds, requestTimeoutSeconds, "Timeout (seconds)"],
      [
        form.requestRetryAttempts,
        requestRetryAttempts,
        "Retry attempts (0 or more)"
      ],
      [
        form.requestRetryDelaySeconds,
        requestRetryDelaySeconds,
        "Retry delay (seconds, 0 or more)"
      ],
      [
        form.previewRequestSizeLimit,
        previewRequestSizeLimit,
        "Preview request size limit"
      ],
      [
        form.previewRequestNumberLimit,
        previewRequestNumberLimit,
        "Preview parallel requests"
      ]
    ]);

    if (invalidField) {
      setErrorMessage(`Invalid value for ${invalidField}.`);
      return;
    }

    setErrorMessage(undefined);
    runInAction(() => {
      item.setTrait(
        CommonStrata.user,
        "itemsQueryMode",
        form.itemsQueryMode === "auto" ? undefined : form.itemsQueryMode
      );
      item.setTrait(CommonStrata.user, "maximumItems", maximumItems);
      item.setTrait(CommonStrata.user, "itemsPageSize", itemsPageSize);
      item.setTrait(CommonStrata.user, "itemsPageLimit", itemsPageLimit);
      item.setTrait(
        CommonStrata.user,
        "dateTimeFilter",
        normalizeString(form.dateTimeFilter)
      );
      item.setTrait(CommonStrata.user, "bboxFilter", parsedBbox);
      item.setTrait(CommonStrata.user, "sortBy", normalizeString(form.sortBy));
      item.setTrait(
        CommonStrata.user,
        "filterExpression",
        normalizeString(form.filterExpression)
      );
      item.setTrait(
        CommonStrata.user,
        "filterLanguage",
        normalizeString(form.filterLanguage)
      );
      item.setTrait(
        CommonStrata.user,
        "intersectsGeometry",
        intersectsGeometry
      );
      item.setTrait(
        CommonStrata.user,
        "additionalQueryParameters",
        additionalQueryParameters
      );
      item.setTrait(
        CommonStrata.user,
        "requestTimeoutSeconds",
        requestTimeoutSeconds
      );
      item.setTrait(
        CommonStrata.user,
        "requestRetryAttempts",
        requestRetryAttempts
      );
      item.setTrait(
        CommonStrata.user,
        "requestRetryDelaySeconds",
        requestRetryDelaySeconds
      );
      item.setTrait(
        CommonStrata.user,
        "previewRequestSizeLimit",
        previewRequestSizeLimit
      );
      item.setTrait(
        CommonStrata.user,
        "previewRequestNumberLimit",
        previewRequestNumberLimit
      );
    });

    try {
      setIsApplying(true);
      await item.refreshStacDataFromTraits();
    } catch (error) {
      item.terria.raiseErrorToUser(error);
    } finally {
      setIsApplying(false);
    }
  };

  const onReset = () => {
    setForm(getDefaultFormState());
    setErrorMessage(undefined);
  };

  return (
    <Box paddedHorizontally={3} paddedVertically={2} column>
      <Text medium textLight>
        STAC Request Controls
      </Text>
      <Spacing bottom={1} />
      <Text small textLightDimmed>
        Collection: {item.stacCollectionId ?? "unknown"} | Loaded items:{" "}
        {item.stacLoadedItemCount} | Supports /search:{" "}
        {item.stacSupportsSearch ? "yes" : "no"} | Effective mode:{" "}
        {item.stacEffectiveItemsQueryMode}
      </Text>
      <Spacing bottom={2} />
      <Text small textLightDimmed>
        Change values and run Apply to re-query STAC and refresh previews.
      </Text>
      <Spacing bottom={2} />

      <FieldLabel>Query mode</FieldLabel>
      <Select
        value={form.itemsQueryMode}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          updateField("itemsQueryMode", event.target.value)
        }
      >
        <option value="auto">auto</option>
        <option value="items">items</option>
        <option value="search">search</option>
      </Select>

      <FieldLabel>Maximum items</FieldLabel>
      <Input
        dark
        type="number"
        value={form.maximumItems}
        onChange={(event) => updateField("maximumItems", event.target.value)}
      />

      <FieldLabel>Items page size</FieldLabel>
      <Input
        dark
        type="number"
        value={form.itemsPageSize}
        onChange={(event) => updateField("itemsPageSize", event.target.value)}
      />

      <FieldLabel>Items page limit</FieldLabel>
      <Input
        dark
        type="number"
        value={form.itemsPageLimit}
        onChange={(event) => updateField("itemsPageLimit", event.target.value)}
      />

      <FieldLabel>DateTime filter</FieldLabel>
      <Input
        dark
        type="text"
        placeholder="2025-01-01/2025-12-31"
        value={form.dateTimeFilter}
        onChange={(event) => updateField("dateTimeFilter", event.target.value)}
      />

      <FieldLabel>BBOX filter</FieldLabel>
      <Input
        dark
        type="text"
        placeholder="-10,35,20,60"
        value={form.bboxFilter}
        onChange={(event) => updateField("bboxFilter", event.target.value)}
      />

      <FieldLabel>Sort by</FieldLabel>
      <Input
        dark
        type="text"
        placeholder="-datetime"
        value={form.sortBy}
        onChange={(event) => updateField("sortBy", event.target.value)}
      />

      <FieldLabel>Filter expression (CQL2)</FieldLabel>
      <Input
        dark
        type="text"
        value={form.filterExpression}
        onChange={(event) =>
          updateField("filterExpression", event.target.value)
        }
      />

      <FieldLabel>Filter language</FieldLabel>
      <Input
        dark
        type="text"
        placeholder="cql2-text"
        value={form.filterLanguage}
        onChange={(event) => updateField("filterLanguage", event.target.value)}
      />

      <FieldLabel>Intersects geometry (GeoJSON)</FieldLabel>
      <ActionRow>
        <ActionButton disabled={isApplying} onClick={startPolygonDrawing}>
          Draw polygon
        </ActionButton>
        <ActionButton disabled={isApplying} onClick={startRectangleDrawing}>
          Draw rectangle
        </ActionButton>
        <ActionButton
          disabled={isApplying}
          onClick={() =>
            setForm((prev) => ({ ...prev, intersectsGeometry: "" }))
          }
        >
          Clear intersects
        </ActionButton>
        {drawingMode ? (
          <ActionButton disabled={isApplying} onClick={stopDrawing}>
            Stop drawing
          </ActionButton>
        ) : null}
      </ActionRow>
      {drawingMode ? (
        <>
          <Spacing bottom={1} />
          <Text small textLightDimmed>
            Drawing mode active: {drawingMode}. Use the map dialog button to
            finish.
          </Text>
        </>
      ) : null}
      <Spacing bottom={1} />
      <StyledTextArea
        dark
        lineHeight="18px"
        styledHeight="96px"
        value={form.intersectsGeometry}
        placeholder='{"type":"Polygon","coordinates":[[[...]]]}'
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          updateField("intersectsGeometry", event.target.value)
        }
      />

      <FieldLabel>Additional query parameters (JSON object)</FieldLabel>
      <StyledTextArea
        dark
        lineHeight="18px"
        styledHeight="96px"
        value={form.additionalQueryParameters}
        placeholder='{"fields":{"exclude":["assets"]}}'
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          updateField("additionalQueryParameters", event.target.value)
        }
      />

      <FieldLabel>Timeout (seconds)</FieldLabel>
      <Input
        dark
        type="number"
        value={form.requestTimeoutSeconds}
        onChange={(event) =>
          updateField("requestTimeoutSeconds", event.target.value)
        }
      />

      <FieldLabel>Retry attempts</FieldLabel>
      <Input
        dark
        type="number"
        value={form.requestRetryAttempts}
        onChange={(event) =>
          updateField("requestRetryAttempts", event.target.value)
        }
      />

      <FieldLabel>Retry delay (seconds)</FieldLabel>
      <Input
        dark
        type="number"
        value={form.requestRetryDelaySeconds}
        onChange={(event) =>
          updateField("requestRetryDelaySeconds", event.target.value)
        }
      />

      <FieldLabel>Preview request size limit</FieldLabel>
      <Input
        dark
        type="number"
        value={form.previewRequestSizeLimit}
        onChange={(event) =>
          updateField("previewRequestSizeLimit", event.target.value)
        }
      />

      <FieldLabel>Preview parallel requests</FieldLabel>
      <Input
        dark
        type="number"
        value={form.previewRequestNumberLimit}
        onChange={(event) =>
          updateField("previewRequestNumberLimit", event.target.value)
        }
      />

      {errorMessage ? (
        <>
          <Spacing bottom={1} />
          <Text small color="#ff7b7b">
            {errorMessage}
          </Text>
        </>
      ) : null}

      <Spacing bottom={1} />
      <ActionRow>
        <ActionButton disabled={isApplying || !!drawingMode} onClick={onApply}>
          {isApplying ? "Applying..." : "Apply and reload"}
        </ActionButton>
        <ActionButton disabled={isApplying || !!drawingMode} onClick={onReset}>
          Reset defaults
        </ActionButton>
      </ActionRow>
    </Box>
  );
});

const FieldLabel = styled(Text).attrs({
  small: true,
  textLight: true
})`
  margin-top: 10px;
  margin-bottom: 4px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled(RawButton)`
  background: ${(props) => props.theme.colorPrimary};
  color: ${(props) => props.theme.textLight};
  border-radius: ${(props) => props.theme.radiusSmall};
  padding: 6px 10px;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

function getInitialFormState(item: StacCollectionCatalogItem): FormState {
  return {
    itemsQueryMode: item.itemsQueryMode ?? "auto",
    maximumItems: stringifyOptionalNumber(item.maximumItems),
    itemsPageSize: stringifyOptionalNumber(item.itemsPageSize),
    itemsPageLimit: stringifyOptionalNumber(item.itemsPageLimit),
    dateTimeFilter: item.dateTimeFilter ?? "",
    bboxFilter: item.bboxFilter?.join(",") ?? "",
    sortBy: item.sortBy ?? "",
    filterExpression: item.filterExpression ?? "",
    filterLanguage: item.filterLanguage ?? "",
    intersectsGeometry: stringifyOptionalJson(item.intersectsGeometry),
    additionalQueryParameters: stringifyOptionalJson(
      item.additionalQueryParameters
    ),
    requestTimeoutSeconds: stringifyOptionalNumber(item.requestTimeoutSeconds),
    requestRetryAttempts: stringifyOptionalNumber(item.requestRetryAttempts),
    requestRetryDelaySeconds: stringifyOptionalNumber(
      item.requestRetryDelaySeconds
    ),
    previewRequestSizeLimit: stringifyOptionalNumber(
      item.previewRequestSizeLimit
    ),
    previewRequestNumberLimit: stringifyOptionalNumber(
      item.previewRequestNumberLimit
    )
  };
}

function getDefaultFormState(): FormState {
  return {
    itemsQueryMode: "auto",
    maximumItems: "10",
    itemsPageSize: "",
    itemsPageLimit: "1",
    dateTimeFilter: "",
    bboxFilter: "",
    sortBy: "",
    filterExpression: "",
    filterLanguage: "",
    intersectsGeometry: "",
    additionalQueryParameters: "",
    requestTimeoutSeconds: "30",
    requestRetryAttempts: "0",
    requestRetryDelaySeconds: "1",
    previewRequestSizeLimit: "10",
    previewRequestNumberLimit: "3"
  };
}

function stringifyOptionalNumber(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function stringifyOptionalJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function normalizeString(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function parsePositiveInteger(value: string): number | undefined {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return undefined;
  const parsedValue = Number(trimmedValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return undefined;
  }
  return parsedValue;
}

function parseNonNegativeInteger(value: string): number | undefined {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return undefined;
  const parsedValue = Number(trimmedValue);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return undefined;
  }
  return parsedValue;
}

function parseNonNegativeNumber(value: string): number | undefined {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return undefined;
  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return undefined;
  }
  return parsedValue;
}

function parseBbox(value: string): number[] | undefined {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return undefined;
  const parts = trimmedValue.split(",");
  if (parts.length !== 4) return undefined;

  const values: number[] = [];
  for (const part of parts) {
    const trimmedPart = part.trim();
    if (trimmedPart.length === 0) return undefined;
    const parsedValue = Number(trimmedPart);
    if (!Number.isFinite(parsedValue)) return undefined;
    values.push(parsedValue);
  }

  const [west, south, east, north] = values;
  if (
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    south > 90 ||
    north < -90 ||
    north > 90
  ) {
    return undefined;
  }

  if (east <= west || north <= south) return undefined;

  return values;
}

function parseOptionalJsonObject(value: string): JsonObject | undefined | null {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return undefined;

  try {
    const parsedValue = JSON.parse(trimmedValue);
    if (!isPlainObject(parsedValue)) return null;
    return parsedValue;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeoJsonGeometry(value: JsonObject): boolean {
  const geometry = value as Record<string, unknown>;
  if (typeof geometry.type !== "string") return false;

  if (geometry.type === "GeometryCollection") {
    return Array.isArray(geometry.geometries);
  }

  return Array.isArray(geometry.coordinates);
}

function polygonGeometryFromRectangle(
  rectangle: Rectangle
): JsonObject | undefined {
  const west = CesiumMath.toDegrees(rectangle.west);
  const south = CesiumMath.toDegrees(rectangle.south);
  const east = CesiumMath.toDegrees(rectangle.east);
  const north = CesiumMath.toDegrees(rectangle.north);

  if (
    !isFiniteNumber(west) ||
    !isFiniteNumber(south) ||
    !isFiniteNumber(east) ||
    !isFiniteNumber(north)
  ) {
    return undefined;
  }

  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south]
      ]
    ]
  };
}

function polygonGeometryFromTwoPoints(
  points: Cartesian3[]
): JsonObject | undefined {
  if (points.length < 2) return undefined;
  const firstPoint = toLonLat(points[0]);
  const secondPoint = toLonLat(points[1]);
  if (!firstPoint || !secondPoint) return undefined;

  const west = Math.min(firstPoint[0], secondPoint[0]);
  const east = Math.max(firstPoint[0], secondPoint[0]);
  const south = Math.min(firstPoint[1], secondPoint[1]);
  const north = Math.max(firstPoint[1], secondPoint[1]);

  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south]
      ]
    ]
  };
}

function bboxFromRectangle(rectangle: Rectangle): number[] | undefined {
  const west = CesiumMath.toDegrees(rectangle.west);
  const south = CesiumMath.toDegrees(rectangle.south);
  const east = CesiumMath.toDegrees(rectangle.east);
  const north = CesiumMath.toDegrees(rectangle.north);

  if (
    !isFiniteNumber(west) ||
    !isFiniteNumber(south) ||
    !isFiniteNumber(east) ||
    !isFiniteNumber(north)
  ) {
    return undefined;
  }

  if (east < west) return undefined;
  if (east - west > 180) return undefined;

  return [west, south, east, north];
}

function bboxFromPoints(points: Cartesian3[]): number[] | undefined {
  if (points.length < 2) return undefined;
  const firstPoint = toLonLat(points[0]);
  const secondPoint = toLonLat(points[1]);
  if (!firstPoint || !secondPoint) return undefined;
  return bboxFromLonLatPoints([firstPoint, secondPoint]);
}

function bboxFromCartesianPoints(points: Cartesian3[]): number[] | undefined {
  const lonLatPoints = points
    .map((point) => toLonLat(point))
    .filter((point): point is [number, number] => point !== undefined);
  return bboxFromLonLatPoints(lonLatPoints);
}

function bboxFromLonLatPoints(
  points: [number, number][]
): number[] | undefined {
  if (points.length === 0) return undefined;

  let west = points[0][0];
  let east = points[0][0];
  let south = points[0][1];
  let north = points[0][1];

  for (let i = 1; i < points.length; i++) {
    const [lon, lat] = points[i];
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }

  if (east - west > 180) return undefined;
  return [west, south, east, north];
}

function polygonGeometryFromPoints(
  points: Cartesian3[]
): JsonObject | undefined {
  const ring = points
    .map((point) => toLonLat(point))
    .filter((point): point is [number, number] => point !== undefined);
  if (ring.length < 3) return undefined;

  const firstPoint = ring[0];
  const lastPoint = ring[ring.length - 1];
  if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
    ring.push([firstPoint[0], firstPoint[1]]);
  }

  return {
    type: "Polygon",
    coordinates: [ring]
  };
}

function toLonLat(point: Cartesian3): [number, number] | undefined {
  const cartographic = Ellipsoid.WGS84.cartesianToCartographic(point);
  if (!cartographic) return undefined;

  const lon = CesiumMath.toDegrees(cartographic.longitude);
  const lat = CesiumMath.toDegrees(cartographic.latitude);

  if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) return undefined;
  return [lon, lat];
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function getFirstInvalidField(
  checks: Array<[raw: string, parsed: number | undefined, label: string]>
): string | undefined {
  for (const [raw, parsed, label] of checks) {
    if (raw.trim().length > 0 && parsed === undefined) {
      return label;
    }
  }
  return undefined;
}

export default StacCollectionSection;
