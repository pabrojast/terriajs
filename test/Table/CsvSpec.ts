import Csv from "../../lib/Table/Csv";

describe("Csv", function () {
  function checkCsvParse(dataColumnMajor: string[][]) {
    expect(dataColumnMajor.length).toEqual(2);
    expect(dataColumnMajor[0][0]).toEqual("x");
    expect(dataColumnMajor[0].slice(1)).toEqual(["1", "3", "4"]);
    expect(dataColumnMajor[1][0]).toEqual("y");
    expect(dataColumnMajor[1].slice(1)).toEqual(["5", "8", "-3"]);
  }

  it("can read from csv string", async function () {
    const csvString = "x,y\r\n1,5\r\n3,8\r\n4,-3\r\n";
    const data = await Csv.parseString(csvString, true);
    checkCsvParse(data);
  });

  it("can read from csv string that includes comments", async function () {
    const csvString =
      "x,y\r\n1,5\r\n3,8\r\n4,-3\r\n# this is a comment\n// and this\n";
    const data = await Csv.parseString(csvString, true, true);
    checkCsvParse(data);
  });
  it("reads every observation in a CKAN dump with a CRLF header and LF records", async () => {
    const rows = await Csv.parseString(
      "_id,date,value,site\r\n1,2026-01-01,1,A\n2,2026-02-01,3,A\n3,2026-03-01,5,B\n4,2026-04-01,,B\n",
      true
    );
    expect(rows).toEqual([
      ["_id", "1", "2", "3", "4"],
      ["date", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"],
      ["value", "1", "3", "5", ""],
      ["site", "A", "A", "B", "B"]
    ]);
  });
  it("preserves quoted line breaks and escaped quotes when repairing a mixed header", async () => {
    const rows = await Csv.parseString(
      'date,note\r\n2026-01-01,"First\r\nline ""quoted""\nlast"\n2026-04-01,end\n'
    );
    expect(rows).toEqual([
      ["date", "note"],
      ["2026-01-01", 'First\r\nline "quoted"\nlast'],
      ["2026-04-01", "end"]
    ]);
  });
});
