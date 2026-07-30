import type { Page } from "playwright";
import { VerificationDetectedError } from "../../../errors";
import type { IPageTypeDetector } from "../../types";

/**
 * A automacao chegou numa etapa de foto de perfil / verificacao facial.
 * Este step NUNCA aciona camera, tira selfie, seleciona ou envia arquivo -
 * ele so coleta os sinais publicos da pagina (URL, HTML, scripts, recursos
 * carregados) e pede ao `VerificationFlowDetector` (Fase 4) para classificar
 * qual provedor esta sendo apresentado, para fins de auditoria. Sempre
 * lanca `VerificationDetectedError` ao final - nunca retorna normalmente.
 */
export async function detectProfilePhotoStep(
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

  const result = await detector.detectProfilePhotoProvider({ url, html, scripts, resources });

  throw new VerificationDetectedError({
    type: "PROFILE_PHOTO",
    provider: result.provider,
    confidence: result.confidence,
  });
}
