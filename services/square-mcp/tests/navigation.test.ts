import { describe, it, expect } from "vitest";
import { normalizeBookingUrl } from "../src/browser/navigation.js";

describe("normalizeBookingUrl", () => {
  it("passes through full Square URLs", () => {
    const url = "https://squareup.com/appointments/book/abc123/loc1/services";
    expect(normalizeBookingUrl(url)).toBe(url);
  });

  it("passes through custom domain URLs", () => {
    const url = "https://booking.mybusiness.com/appointments";
    expect(normalizeBookingUrl(url)).toBe(url);
  });

  it("prepends https:// if missing", () => {
    expect(normalizeBookingUrl("squareup.com/appointments/book/abc"))
      .toBe("https://squareup.com/appointments/book/abc");
  });
});
