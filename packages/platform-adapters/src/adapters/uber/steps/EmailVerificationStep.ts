import type { Page } from "playwright";
import type {
  IEmailVerificationWorker,
  VerificationCodeResult,
} from "@uber-automation/email-service";
import type { AutomationContext } from "../../../types";
import { UBER_CONFIG, type UberAdapterConfig } from "../config";
import { UBER_SELECTORS } from "../selectors";

/**
 * Garante que o codigo foi enviado. No mock server o codigo ja e gerado e
 * exibido automaticamente ao carregar a pagina (nada a clicar); em uma
 * plataforma real que exija uma acao explicita de "enviar/reenviar codigo",
 * clica no botao correspondente se ele existir. Nunca falha se o botao nao
 * existir - so significa que o envio ja aconteceu antes desta pagina.
 */
export async function requestEmailCode(
  page: Page,
  config: UberAdapterConfig = UBER_CONFIG,
): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: config.timeouts.pageLoad });

  const resendButton = page.locator(UBER_SELECTORS.emailVerification.resendButton);
  const exists = await resendButton
    .count()
    .then((count) => count > 0)
    .catch(() => false);

  if (exists) {
    await resendButton.first().click();
    await page.waitForTimeout(config.timeouts.actionDelay);
  }
}

/**
 * Busca o codigo no proprio Gmail do motorista via `IEmailVerificationWorker`
 * (Fase 2) - nunca inventa, adivinha ou intercepta o codigo por outro meio.
 * O worker ja para sozinho (lanca `SecurityChallengeError`) se o Gmail
 * pedir 2FA/CAPTCHA/confirmacao de telefone; este step nao precisa (e nao
 * deve) tratar isso.
 */
export async function retrieveEmailCode(
  context: AutomationContext,
  emailWorker: IEmailVerificationWorker,
): Promise<VerificationCodeResult> {
  return emailWorker.findVerificationCode({
    applicantId: context.applicantId,
    emailAccountId: context.emailAccountId,
    proxyId: context.proxyId,
    requestedAt: new Date(),
    expectedSender: "noreply@uber.com",
  });
}

/** Insere o codigo recuperado e envia o formulario de verificacao de e-mail. */
export async function submitEmailCode(
  page: Page,
  code: string,
  config: UberAdapterConfig = UBER_CONFIG,
): Promise<void> {
  await page
    .locator(UBER_SELECTORS.emailVerification.codeInput)
    .fill(code, { timeout: config.timeouts.elementWait });
  await page.locator(UBER_SELECTORS.emailVerification.submitButton).click();
  await page.waitForLoadState("domcontentloaded", { timeout: config.timeouts.pageLoad });
}
