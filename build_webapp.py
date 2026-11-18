"""Build apps-script/Dashboard.html (public Web App) from the claude.ai dashboard page.

Same UI and parser; only the data source changes: the page asks the Apps Script server
(getDashboardData) for the sheet instead of reading it through the viewer's Google Drive connector.

    npm install && npm run build
"""
import pathlib
import re
import sys

src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
out_path = pathlib.Path(__file__).parent / "apps-script" / "Dashboard.html"

GAS_SOURCE = """/* @source:start */
/** Web App: the server reads the sheet as the owner; viewers need no account or sheet access. */
const SheetSource = {
  fetch() {
    return new Promise((resolve, reject) => {
      if (!window.google?.script?.run) return reject({ code: "no_gas" });
      google.script.run
        .withSuccessHandler(wb => { try { resolve(SheetParser.parse(wb)); } catch (e) { reject(e?.code ? e : { code: "parse", message: String(e) }); } })
        .withFailureHandler(e => reject({ code: "gas", message: e?.message || String(e) }))
        .getDashboardData();
    });
  },
};
const SnapshotStore = { init() {}, save() {} };
/* @source:end */"""


def replace_once(text, old, new):
    assert text.count(old) == 1, f"expected exactly one match for: {old[:60]!r}"
    return text.replace(old, new)


out = re.sub(r"/\* @source:start \*/.*?/\* @source:end \*/", lambda _: GAS_SOURCE, src, count=1, flags=re.S)
out = replace_once(out, '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>\n', "")
out = replace_once(out, '<meta name="claude:viewport-fit-sides" content="cover">\n', "")
# Public viewers have no access to the sheet: drop the "open sheet" button.
out = re.sub(r'\s*<a class="btn btn-dark press" id="sheetLink".*?</a>', "", out, count=1, flags=re.S)
out = replace_once(out, '$("#sheetLink").href = SHEET_URL;\n', "")
out = replace_once(
    out,
    "Đã đồng bộ từ Google Sheet lúc <b>${time(S.data.syncedAt)}</b> · tự cập nhật mỗi 3 phút",
    "Số liệu trực tiếp từ Master Plan lúc <b>${time(S.data.syncedAt)}</b> · tự cập nhật mỗi 3 phút",
)
out = replace_once(
    out,
    "const ERRORS = {\n",
    'const ERRORS = {\n  no_gas: ["Trang này cần mở qua link Web App.", ""],\n'
    '  gas: ["Máy chủ chưa đọc được Master Plan.", "Thử tải lại trang sau ít phút."],\n'
    '  parse: ["Đọc được sheet nhưng không hiểu cấu trúc.", "Kiểm tra tên tab REPORT / YT_AUTO."],\n',
)
assert "mcp" not in re.search(r"/\* @source:start \*/.*?/\* @source:end \*/", out, re.S).group(0)
# Down-level the main script (Apps Script's HTML pipeline may drop modern syntax silently).
import os, subprocess
m = re.search(r"<script>\n(\(\(\) => \{\n\"use strict\";.*?)</script>", out, re.S)
assert m, "main script not found"
js = subprocess.run(["node", str(pathlib.Path(__file__).parent / "transpile.js")], input=m.group(1), capture_output=True,
                    text=True, check=True, env={**os.environ, "NODE_PATH": os.environ.get("NODE_PATH", "")}).stdout
assert not re.search(r"\?\.(?!\d)", js) and "??" not in js and "</" not in js and "//" not in js
out = out[: m.start(1)] + js + out[m.end(1):]
out_path.write_text(out, encoding="utf-8")
print(f"wrote {out_path} ({len(out):,} bytes)")
