import type { Page } from "playwright";
import { UBER_SELECTORS } from "../selectors";

export interface CompletionCheckResult {
  completed: boolean;
  url: string;
}

/**
 * So declara sucesso se um indicador de conclusao POSITIVO e conhecido
 * estiver presente na pagina (`UBER_SELECTORS.completion.successIndicator`).
 * Nenhum cenario do mock server (Fase 3) chega numa conclusao "limpa" - a
 * plataforma sempre exige verificacao de identidade antes - entao este
 * caminho fica sem cobertura de teste ate a Uber real ser inspecionada e o
 * seletor correspondente ser preenchido.
 *
 * Deliberadamente conservador: se a pagina atual nao bate com nenhum tipo
 * conhecido (nem etapa sensivel, nem indicador de conclusao), o chamador
 * (`UberDriverApplicationAdapter`) trata como erro tecnico
 * (`AutomationStepError` `UNRECOGNIZED_PAGE`), nunca como sucesso silencioso
 * - assumir sucesso por omissao poderia mascarar uma etapa sensivel real
 * cujo layout mudou e nao foi mais reconhecida pelo detector.
 */
export async function checkCompletion(page: Page): Promise<CompletionCheckResult> {
  const indicator = page.locator(UBER_SELECTORS.completion.successIndicator);
  const completed = await indicator
    .count()
    .then((count) => count > 0)
    .catch(() => false);

  return { completed, url: page.url() };
}
