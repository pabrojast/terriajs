import createAreaPolygon from "../../lib/Core/createAreaPolygon";

describe("Area polygon validation", () => {
  it("closes exactly once and removes repeated adjacent vertices", () => {
    const polygon = createAreaPolygon([
      [34, 48],
      [34, 48],
      [35, 48],
      [35, 49],
      [34, 48]
    ]);
    expect(polygon?.coordinates[0]).toEqual([
      [34, 48],
      [35, 48],
      [35, 49],
      [34, 48]
    ]);
  });
  it("rejects too few, collinear and crossing vertices", () => {
    expect(
      createAreaPolygon([
        [0, 0],
        [1, 1]
      ])
    ).toBeUndefined();
    expect(
      createAreaPolygon([
        [0, 0],
        [1, 1],
        [2, 2]
      ])
    ).toBeUndefined();
    expect(
      createAreaPolygon([
        [0, 0],
        [2, 2],
        [0, 2],
        [2, 0]
      ])
    ).toBeUndefined();
    expect(
      createAreaPolygon([
        [0, 0],
        [2, 0],
        [1, 1],
        [0, 0],
        [0, 2]
      ])
    ).toBeUndefined();
  });
  it("accepts a concave area and a local antimeridian crossing", () => {
    expect(
      createAreaPolygon([
        [0, 0],
        [3, 0],
        [1, 1],
        [3, 3],
        [0, 3]
      ])
    ).toBeDefined();
    expect(
      createAreaPolygon([
        [179, 0],
        [-179, 0],
        [-179, 1],
        [179, 1]
      ])
    ).toBeDefined();
  });
});
