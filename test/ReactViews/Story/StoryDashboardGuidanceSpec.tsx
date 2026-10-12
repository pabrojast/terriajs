import i18next from "i18next";
import { useState } from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import Terria from "../../../lib/Models/Terria";
import {
  storyComposition,
  StoryDashboard
} from "../../../lib/Models/StoryComposition";
import StoryCompositionEditor from "../../../lib/ReactViews/Story/StoryCompositionEditor";
import chooseStoryDashboard from "../../../lib/ReactViews/Story/chooseStoryDashboard";
import english from "../../../wwwroot/languages/en/translation.json";
import spanish from "../../../wwwroot/languages/es/translation.json";

describe("Story dashboard guidance and selection", function () {
  let container: HTMLDivElement;
  let root: Root;
  let previousLanguage: string;
  let previousResources: Record<string, object | undefined>;
  beforeEach(function () {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    previousLanguage = i18next.language;
    previousResources = {};
    for (const [language, resources] of Object.entries({
      en: english,
      es: spanish
    })) {
      const previous = i18next.getResourceBundle(language, "translation");
      previousResources[language] = previous
        ? JSON.parse(JSON.stringify(previous))
        : undefined;
      i18next.addResourceBundle(language, "translation", resources, true, true);
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async function () {
    for (const dialog of document.querySelectorAll("dialog[open]"))
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await act(async () => root.unmount());
    container.remove();
    await i18next.changeLanguage(previousLanguage);
    for (const [language, resources] of Object.entries(previousResources)) {
      i18next.removeResourceBundle(language, "translation");
      if (resources)
        i18next.addResourceBundle(language, "translation", resources);
    }
  });

  [
    [
      "en-AU",
      "en",
      "Choose an IHP-WINS dashboard",
      "Add dashboard from IHP-WINS"
    ],
    [
      "es-CL",
      "es",
      "Elegir un dashboard de IHP-WINS",
      "Añadir dashboard de IHP-WINS"
    ]
  ].forEach(([locale, language, title, button]) => {
    it(`inserts a dashboard through the ${locale} picker without changing the original or choosing a layout for the author`, async function () {
      await i18next.changeLanguage(locale);
      const initial = { ...storyComposition(), layout: "map" as const };
      let current = storyComposition(initial);
      const terria = new Terria({ baseUrl: "./" });
      function Editor() {
        const [value, setValue] = useState(current);
        return (
          <I18nextProvider i18n={i18next}>
            <StoryCompositionEditor
              terria={terria}
              value={value}
              onReference={() => undefined}
              onChange={(next) => {
                current = next;
                setValue(next);
              }}
            />
          </I18nextProvider>
        );
      }
      await act(async () => root.render(<Editor />));
      const add = [...container.querySelectorAll("button")].find(
        (node) => node.textContent === button
      )!;
      expect(add).toBeDefined();
      await act(async () => add.click());
      const frame = document.querySelector<HTMLIFrameElement>(
        "dialog[open] iframe"
      )!;
      expect(frame.title).toBe(title);
      expect(new URL(frame.src).pathname).toBe("/story-dashboards/picker");
      expect(new URL(frame.src).search).toBe(`?lang=${language}`);
      const dashboard: StoryDashboard = {
        id: "water-quality",
        view_id: "70441d68-3fa1-4e54-b7be-f87b6b27f515",
        title: "Water quality",
        state: {
          filters: [{ field: "country", op: "eq", value: "Madagascar" }],
          widgetId: "trend"
        }
      };
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent("message", {
            origin: location.origin,
            source: frame.contentWindow,
            data: {
              type: "ckan-story-dashboard-selected",
              version: 1,
              dashboard
            }
          })
        );
      });
      expect(current.dashboards).toEqual([dashboard]);
      expect(current.dashboards[0].state).not.toBe(dashboard.state);
      expect(initial.dashboards).toEqual([]);
      expect(current.layout).toBe("map");
      expect(document.querySelector("dialog[open]")).toBeNull();
      expect(add.disabled).toBe(false);
      // The author explicitly chooses a dashboard-capable composition.
      const layout = container.querySelector<HTMLInputElement>(
        'input[name="story-layout"][value="combined"]'
      )!;
      await act(async () => layout.click());
      expect(current.layout).toBe("combined");
      expect(current.dashboards).toEqual([dashboard]);
      expect(initial.layout).toBe("map");
    });
  });

  it("uses the English fallback and restores focus when the picker is cancelled", async function () {
    await i18next.changeLanguage("fr-FR");
    const trigger = document.createElement("button");
    trigger.textContent = "Open picker";
    container.append(trigger);
    trigger.focus();
    const result = chooseStoryDashboard();
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]")!;
    const frame = dialog.querySelector("iframe")!;
    expect(new URL(frame.src).search).toBe("?lang=en");
    expect(frame.title).toBe("Choose an IHP-WINS dashboard");
    expect(dialog.getAttribute("aria-label")).toBe(frame.title);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(await result).toBeUndefined();
    expect(document.activeElement).toBe(trigger);
  });
});
