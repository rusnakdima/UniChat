import { describe, it, expect, vi } from "vitest";

describe("vi.fn with implementation", () => {
  it("should call the mockImpl function", () => {
    const store: Record<string, string> = {};
    const impl = (key: string, value: string) => {
      store[key] = value;
    };
    const spy = vi.fn(impl);

    spy("test", "hello");

    expect(spy).toHaveBeenCalledWith("test", "hello");
    expect(store).toEqual({ test: "hello" });
  });
});
