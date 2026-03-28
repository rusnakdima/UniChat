import { LazyServiceLoader } from "./lazy-service-loader";

describe("LazyServiceLoader", () => {
  beforeEach(() => {
    LazyServiceLoader.clearAll();
  });

  it("should be created", () => {
    expect(LazyServiceLoader).toBeDefined();
  });

  describe("load", () => {
    it("should load a service on first call", async () => {
      class MockService {
        name = "MockService";
        getValue() {
          return 42;
        }
      }

      const loader = jasmine.createSpy("loader").and.returnValue(Promise.resolve(MockService));

      const service = await LazyServiceLoader.load(loader, "mock");

      expect(service).toBeInstanceOf(MockService);
      expect(service.name).toBe("MockService");
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("should return cached service on subsequent calls", async () => {
      class MockService {
        name = "MockService";
      }

      const loader = jasmine.createSpy("loader").and.returnValue(Promise.resolve(MockService));

      await LazyServiceLoader.load(loader, "mock");
      const cached = await LazyServiceLoader.load(loader, "mock");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(cached).toBeInstanceOf(MockService);
    });

    it("should not load same service twice if called concurrently", async () => {
      class MockService {
        name = "MockService";
      }

      const loader = jasmine.createSpy("loader").and.returnValue(Promise.resolve(MockService));

      // Call twice concurrently
      const [result1, result2] = await Promise.all([
        LazyServiceLoader.load(loader, "mock"),
        LazyServiceLoader.load(loader, "mock"),
      ]);

      expect(loader).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });
  });

  describe("preload", () => {
    it("should start loading in background", () => {
      class MockService {
        name = "MockService";
      }

      const loader = jasmine.createSpy("loader").and.returnValue(Promise.resolve(MockService));

      LazyServiceLoader.preload(loader, "mock");

      // Loader should be called
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("should not throw on preload error", () => {
      const loader = jasmine
        .createSpy("loader")
        .and.returnValue(Promise.reject(new Error("Load failed")));

      expect(() => LazyServiceLoader.preload(loader, "mock")).not.toThrow();
    });
  });

  describe("isLoaded", () => {
    it("should return false for unloaded service", () => {
      expect(LazyServiceLoader.isLoaded("nonexistent")).toBe(false);
    });

    it("should return true for loaded service", async () => {
      class MockService {}

      const loader = jasmine.createSpy("loader").and.returnValue(Promise.resolve(MockService));

      await LazyServiceLoader.load(loader, "mock");

      expect(LazyServiceLoader.isLoaded("mock")).toBe(true);
    });
  });

  describe("get", () => {
    it("should return undefined for unloaded service", () => {
      expect(LazyServiceLoader.get("nonexistent")).toBeUndefined();
    });

    it("should return service instance if loaded", async () => {
      class MockService {
        value = 123;
      }

      const loader = jasmine.createSpy("loader").and.returnValue(Promise.resolve(MockService));

      await LazyServiceLoader.load(loader, "mock");

      const service = LazyServiceLoader.get<MockService>("mock");
      expect(service).toBeInstanceOf(MockService);
      expect(service?.value).toBe(123);
    });
  });

  describe("clear", () => {
    it("should remove service from cache", async () => {
      class MockService {}

      const loader = jasmine.createSpy("loader").and.returnValue(Promise.resolve(MockService));

      await LazyServiceLoader.load(loader, "mock");
      expect(LazyServiceLoader.isLoaded("mock")).toBe(true);

      LazyServiceLoader.clear("mock");
      expect(LazyServiceLoader.isLoaded("mock")).toBe(false);
    });
  });

  describe("clearAll", () => {
    it("should remove all services from cache", async () => {
      class MockService {}

      const loader = jasmine.createSpy("loader").and.returnValue(Promise.resolve(MockService));

      await LazyServiceLoader.load(loader, "mock1");
      await LazyServiceLoader.load(loader, "mock2");

      expect(LazyServiceLoader.isLoaded("mock1")).toBe(true);
      expect(LazyServiceLoader.isLoaded("mock2")).toBe(true);

      LazyServiceLoader.clearAll();

      expect(LazyServiceLoader.isLoaded("mock1")).toBe(false);
      expect(LazyServiceLoader.isLoaded("mock2")).toBe(false);
    });
  });
});
