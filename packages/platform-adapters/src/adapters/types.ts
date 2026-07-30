import type { IVerificationFlowDetector, PageType } from "@uber-automation/verification-detector";

/**
 * `IVerificationFlowDetector` (pacote da Fase 4) declara formalmente so os
 * metodos de deteccao de provedor; a implementacao concreta
 * (`VerificationFlowDetector`) tambem expoe classificacao geral de pagina
 * (`classifyPageType`) e os checks de pagina de desafio - e o que os
 * adaptadores de plataforma precisam para decidir "isso e CAPTCHA/2FA/
 * bloqueio ou uma etapa de identidade?" antes mesmo de chamar
 * `detectProfilePhotoProvider`/`detectDriverLicenseProvider`. Esta interface
 * torna essa dependencia explicita (em vez de importar a classe concreta),
 * mantendo o adaptador testavel com um detector fake.
 */
export interface IPageTypeDetector extends IVerificationFlowDetector {
  isCaptchaPage(html: string): boolean;
  isTwoFactorPage(html: string): boolean;
  isSecurityBlockPage(html: string): boolean;
  classifyPageType(html: string): PageType;
}
