import { describe, expect, it } from "vitest";
import { GameCategoryPage, GameModePage, GameModule, LineRaceLobbyPlaceholderPage } from "./index";

describe("game module public exports", () => {
  it("keeps GameModule and exposes category-compatible pages", () => {
    expect(GameModule).toBeTypeOf("function");
    expect(GameCategoryPage).toBeTypeOf("function");
    expect(GameModePage).toBeTypeOf("function");
    expect(LineRaceLobbyPlaceholderPage).toBeTypeOf("function");
  });
});
