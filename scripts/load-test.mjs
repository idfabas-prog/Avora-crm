const baseUrl = process.env.LOAD_BASE_URL || process.env.APP_URL || "http://localhost:3000";
const iterations = Number(process.env.LOAD_ITERATIONS || 20);
const target = new URL("/api/health", baseUrl);
const started = Date.now();

await Promise.all(Array.from({ length: iterations }, async () => {
  const response = await fetch(target);
  if (response.status >= 500) throw new Error(`Health check failed with ${response.status}`);
}));

const duration = Date.now() - started;
console.log(`Local load smoke completed: ${iterations} requests in ${duration}ms.`);

