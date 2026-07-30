import type { Page } from "playwright";
import { VerificationDetectedError } from "../../../errors";
import type { IPageTypeDetector } from "../../types";

/**
 * A automacao chegou numa etapa de envio de CNH. Este step NUNCA seleciona
 * ou envia nenhum arquivo/documento - so coleta os sinais publicos da
 * pagina e pede ao `VerificationFlowDetector` (Fase 4) para classificar o
 * provedor, para fins de auditoria. Sempre lanca `VerificationDetectedError`
 * ao final - nunca retorna normalmente.
 */
export async function detectDriverLicenseStep(
  page: Page,
  detector: IPageTypeDetector,
): Promise<never> {
  const url = page.url();
  const html = await page.content();
  const scripts = await page.evaluate(() =>
    Array.from(document.scripts).map((script) => script.src || script.textContent || ""),
  );
  const resources = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[src]")).map((el) => el.getAttribute("src") ?? ""),
  );

  const result = await detector.detectDriverLicenseProvider({ url, html, scripts, resources });

  throw new VerificationDetectedError({
    type: "DRIVER_LICENSE",
    provider: result.provider,
    confidence: result.confidence,
  });
}
