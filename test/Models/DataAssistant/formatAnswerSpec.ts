import formatAnswer from "../../../lib/Models/DataAssistant/formatAnswer";

describe("DataAssistant answer formatting", function () {
  it("renders readable text and evidence references", function () {
    const html = formatAnswer("**Mean:** 2 [E1]\n\n- Three observations");
    expect(html).toContain("<strong>Mean:</strong>");
    expect(html).toContain("[E1]");
    expect(html).toContain("<li>Three observations</li>");
  });
  it("removes scripts, remote media, custom tools and navigation attributes", function () {
    const html = formatAnswer(
      '<p onclick="alert(1)">Answer</p><img src="https://example.invalid/private"><iframe src="https://example.invalid"></iframe><script>alert(1)</script><chart src="https://example.invalid"></chart><a href="javascript:alert(1)">Link</a>'
    );
    expect(html).toContain("Answer");
    expect(html).not.toMatch(/script|onclick|src=|href=|<img|<iframe|<chart/);
  });
});
