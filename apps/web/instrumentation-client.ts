type ZodGlobal = typeof globalThis & {
  __zod_globalConfig?: {
    jitless?: boolean;
  };
};

// Zod reads this shared config during module initialization. Pre-populate it
// without importing Zod into Next.js's pre-hydration instrumentation entry.
const zodGlobal = globalThis as ZodGlobal;
zodGlobal.__zod_globalConfig ??= {};
zodGlobal.__zod_globalConfig.jitless = true;
