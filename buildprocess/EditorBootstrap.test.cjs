const assert = require("node:assert/strict");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const { transformFileSync } = require("@babel/core");
const defaultBabelLoader = require("./defaultBabelLoader");

for (const devMode of [true, false]) {
  test(`lazy editor initializes TinyMCE before its extensions (${devMode ? "development" : "release"})`, () => {
    const { presets, plugins, assumptions } = defaultBabelLoader({
      devMode
    }).options;
    // Compile the real TSX entry with the application presets. A regular
    // component test can miss import elision if another test loaded TinyMCE.
    const { code } = transformFileSync(
      path.resolve(__dirname, "../lib/ReactViews/Generic/Editor.tsx"),
      { presets, plugins, assumptions, babelrc: false, configFile: false }
    );
    let initialized = false;
    const extensions = [];
    const translations = {};
    const exports = {};
    runInNewContext(
      code,
      {
        exports,
        require(id) {
          // Model only the module-evaluation contract, in a fresh realm.
          // TinyMCE DOM initialization is exercised by the browser smoke test.
          if (id === "tinymce" || id === "tinymce/tinymce") {
            initialized = true;
          } else if (id === "../../ThirdParty/tinymce/es") {
            assert.ok(initialized, "Language pack loaded before TinyMCE");
            runInNewContext(
              readFileSync(
                path.resolve(__dirname, "../lib/ThirdParty/tinymce/es.js"),
                "utf8"
              ),
              {
                tinymce: {
                  addI18n: (language, messages) => {
                    translations[language] = messages;
                  }
                }
              },
              { timeout: 1000 }
            );
          } else if (/^tinymce\/(icons|themes|models|plugins)\//.test(id)) {
            assert.ok(initialized, `${id} loaded before the TinyMCE runtime`);
            extensions.push(id);
          } else if (id === "react") {
            return { useRef: () => ({ current: null }) };
          } else if (id === "react/jsx-runtime") {
            return { jsx: (_type, props) => props };
          }
          return {};
        }
      },
      { timeout: 1000 }
    );
    assert.ok(
      initialized,
      "TinyMCE runtime was omitted from the compiled editor"
    );
    assert.ok(extensions.length > 0, "Editor extensions were not evaluated");
    assert.equal(translations.es?.Bold, "Negrita");
    for (const [language, expected] of [
      ["es", "es"],
      ["es-CL", "es"],
      ["es_ES", "es"],
      ["en", "en"],
      ["en-AU", "en"],
      ["fr", "en"]
    ]) {
      const editor = exports.default({ html: "", onChange() {}, language });
      assert.equal(editor.init.language, expected);
      assert.equal(
        editor.init.language_url,
        undefined,
        "Bundled languages must not fetch a separate script"
      );
    }
  });
}
