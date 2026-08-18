const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || "http://localhost:3000";
const routes = ["/api/health", "/login", "/portal/login", "/mobile"];

for (const route of routes) {
  const response = await fetch(new URL(route, baseUrl));
  if (response.status >= 500) {
    throw new Error(`Smoke route ${route} failed with ${response.status}`);
  }
  console.log(`${route}: ${response.status}`);
}

console.log("Smoke test completed. Authenticated CRM routes may redirect to login.");

