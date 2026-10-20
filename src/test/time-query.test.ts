import { describe, expect, it } from "vitest";
import { parseTimeQuery } from "@/components/AvailabilityPicker";

describe("parseTimeQuery", () => {
  it("reads am/pm times as one time", () => {
    expect(parseTimeQuery("7:30 pm")).toEqual(["19:30"]);
    expect(parseTimeQuery("7:30PM")).toEqual(["19:30"]);
    expect(parseTimeQuery("11 a.m.")).toEqual(["11:00"]);
    expect(parseTimeQuery("12pm")).toEqual(["12:00"]);
    expect(parseTimeQuery("12am")).toEqual(["00:00"]);
  });
  it("reads a time without am/pm as both morning and evening", () => {
    expect(parseTimeQuery("7:30")).toEqual(["07:30", "19:30"]);
    expect(parseTimeQuery("8")).toEqual(["08:00", "20:00"]);
  });
  it("reads 24-hour times", () => {
    expect(parseTimeQuery("1930")).toEqual(["19:30"]);
    expect(parseTimeQuery("19:30")).toEqual(["19:30"]);
  });
  it("rejects text that isn't a time", () => {
    expect(parseTimeQuery("abc")).toBeNull();
    expect(parseTimeQuery("7:75")).toBeNull();
    expect(parseTimeQuery("25:00")).toBeNull();
    expect(parseTimeQuery("13pm")).toBeNull();
  });
});
