import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5273",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run demo",
      env: { PORT: "3101" },
      url: "http://127.0.0.1:3101/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -w @office/web",
      url: "http://127.0.0.1:5273",
      env: {
        VITE_DEMO_TOKEN: "",
        WEB_PORT: "5273",
        API_PROXY: "http://127.0.0.1:3101",
      },
      reuseExistingServer: false,
    },
  ],
});
