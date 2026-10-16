// Pruebas de la página en el navegador (tests/web/*.spec.mjs). Cada prueba abre sus propios contextos, así que corren
// en paralelo; cada archivo sirve web/index.html con el libro de ejemplo en un puerto propio.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/web',
  testMatch: '*.spec.mjs',
  fullyParallel: true,
  // una prueba es un recorrido largo (varias decenas de comprobaciones): un minuto y medio de margen
  timeout: 90_000,
  // sin reintentos: una prueba que falla a veces se arregla, no se repite hasta que pase
  retries: 0,
  // un `test.only` olvidado no deja la CI en verde corriendo una sola prueba
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    launchOptions: { executablePath: process.env.CHROMIUM || undefined },
    // una espera que no se cumple falla en 15 s, no a los 90 del plazo de la prueba
    actionTimeout: 15_000,
    // lo que se sube como artefacto cuando algo falla: la captura y la traza
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
