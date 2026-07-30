import type { Page } from "playwright";
import { AutomationStepError } from "../../../errors";
import { UBER_CONFIG, type UberAdapterConfig } from "../config";
import { UBER_SELECTORS } from "../selectors";

export interface UberCredentials {
  email: string;
  password: string;
}

/**
 * Credenciais de login da conta Uber do motorista (se a plataforma exigir
 * login antes do formulario administrativo - o mock server sempre exige,
 * mas aceita qualquer valor). Ficam FORA de `AutomationContext` de
 * proposito: se um dia forem necessarias de verdade, devem vir de um cofre
 * de credenciais dedicado (mesmo padrao do `@uber-automation/credential-vault`
 * usado para a senha do e-mail), nunca hardcoded no adaptador - o rascunho
 * original desta fase usava um literal `'temp-password'`, o que nunca
 * autenticaria de verdade e foi corrigido aqui.
 */
export async function performLogin(
  page: Page,
  credentials: UberCredentials | undefined,
  config: UberAdapterConfig = UBER_CONFIG,
): Promise<void> {
  await page.goto(`${config.baseUrl}${config.endpoints.login}`, {
    timeout: config.timeouts.pageLoad,
    waitUntil: "domcontentloaded",
  });

  const emailField = page.locator(UBER_SELECTORS.login.emailInput);
  const hasLoginForm = await emailField
    .count()
    .then((count) => count > 0)
    .catch(() => false);

  // Algumas plataformas nao exigem login para iniciar um cadastro novo (a
  // sessao ja pode estar autenticada, ex: perfil de navegador reutilizado).
  if (!hasLoginForm) return;

  if (!credentials) {
    throw new AutomationStepError(
      "UBER_CREDENTIALS_MISSING",
      "A página de login exige e-mail/senha, mas nenhuma credencial foi configurada para este motorista.",
    );
  }

  await emailField.fill(credentials.email, { timeout: config.timeouts.elementWait });
  await page
    .locator(UBER_SELECTORS.login.passwordInput)
    .fill(credentials.password, { timeout: config.timeouts.elementWait });
  await page.locator(UBER_SELECTORS.login.submitButton).click();
  await page.waitForLoadState("domcontentloaded", { timeout: config.timeouts.pageLoad });
}
