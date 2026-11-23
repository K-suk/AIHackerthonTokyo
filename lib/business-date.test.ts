import { describe, expect, it } from "vitest";
import { toBusinessDate } from "./business-date";

describe("toBusinessDate（日本時間・午前4時区切り）", () => {
  it("営業時間中（JST 18:00）は当日の営業日", () => {
    expect(toBusinessDate(new Date("2026-11-23T18:00:00+09:00"))).toBe("2026-11-23");
  });

  it("区切り（JST 04:00）ちょうどは当日の営業日", () => {
    expect(toBusinessDate(new Date("2026-11-23T04:00:00+09:00"))).toBe("2026-11-23");
  });

  it("区切り直前（JST 03:59）は前日の営業日", () => {
    expect(toBusinessDate(new Date("2026-11-23T03:59:00+09:00"))).toBe("2026-11-22");
  });

  it("深夜（JST 02:00）は前日の営業日", () => {
    expect(toBusinessDate(new Date("2026-11-23T02:00:00+09:00"))).toBe("2026-11-22");
  });

  it("日付をまたぐ深夜（JST 翌01:30）は当日の営業日として扱う", () => {
    // UTC 16:30 は JST 翌 01:30。区切り前なので UTC 日付の営業日に入る。
    expect(toBusinessDate(new Date("2026-11-23T16:30:00Z"))).toBe("2026-11-23");
  });

  it("月替わりの深夜（JST 12/1 02:00）は前月末の営業日", () => {
    expect(toBusinessDate(new Date("2026-12-01T02:00:00+09:00"))).toBe("2026-11-30");
  });

  it("UTC入力でも JST に変換して判定する（UTC 10:00 = JST 19:00）", () => {
    expect(toBusinessDate(new Date("2026-11-23T10:00:00Z"))).toBe("2026-11-23");
  });
});
