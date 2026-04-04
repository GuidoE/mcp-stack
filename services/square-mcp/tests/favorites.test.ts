import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import {
  loadFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
  resolveMerchant,
  type Favorite,
} from "../src/tools/favorites.js";

const TEST_PATH = "/tmp/test-favorites.json";

beforeEach(() => {
  writeFileSync(TEST_PATH, JSON.stringify({
    barber: {
      url: "https://squareup.com/appointments/book/abc123/loc1/services",
      default_service: "Haircut",
      notes: "Ask for Mike",
    },
  }));
});

afterEach(() => {
  try { unlinkSync(TEST_PATH); } catch {}
});

describe("loadFavorites", () => {
  it("reads favorites from JSON file", () => {
    const favs = loadFavorites(TEST_PATH);
    expect(favs.barber).toBeDefined();
    expect(favs.barber.url).toContain("abc123");
  });

  it("returns empty object for missing file", () => {
    const favs = loadFavorites("/tmp/nonexistent.json");
    expect(favs).toEqual({});
  });
});

describe("addFavorite", () => {
  it("adds a new favorite and saves", () => {
    const favs = loadFavorites(TEST_PATH);
    const updated = addFavorite(favs, "dentist", {
      url: "https://squareup.com/appointments/book/xyz",
      default_service: "Cleaning",
    });
    saveFavorites(TEST_PATH, updated);

    const reloaded = loadFavorites(TEST_PATH);
    expect(reloaded.dentist.url).toContain("xyz");
    expect(reloaded.barber).toBeDefined();
  });
});

describe("removeFavorite", () => {
  it("removes an existing favorite", () => {
    const favs = loadFavorites(TEST_PATH);
    const updated = removeFavorite(favs, "barber");
    expect(updated.barber).toBeUndefined();
  });

  it("is a no-op for nonexistent nickname", () => {
    const favs = loadFavorites(TEST_PATH);
    const updated = removeFavorite(favs, "nope");
    expect(Object.keys(updated)).toEqual(["barber"]);
  });
});

describe("resolveMerchant", () => {
  it("resolves a nickname to a URL", () => {
    const favs = loadFavorites(TEST_PATH);
    const url = resolveMerchant(favs, "barber");
    expect(url).toContain("abc123");
  });

  it("returns input if it looks like a URL", () => {
    const favs = loadFavorites(TEST_PATH);
    const url = resolveMerchant(favs, "https://squareup.com/appointments/book/new");
    expect(url).toBe("https://squareup.com/appointments/book/new");
  });

  it("throws for unknown nickname", () => {
    const favs = loadFavorites(TEST_PATH);
    expect(() => resolveMerchant(favs, "nope")).toThrow("Unknown merchant");
  });
});
