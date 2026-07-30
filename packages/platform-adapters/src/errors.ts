import type { VerificationDetectedInfo } from "./types";

/**
 * Sinaliza que a automacao chegou numa etapa sensivel (foto de perfil, CNH,
 * CAPTCHA, 2FA ou bloqueio de seguranca) e deve parar imediatamente. Nunca e
 * "tratado" - `PlatformAdapter.start()` a captura especificamente para
 * transformar em `AutomationResult.status = 'VERIFICATION_DETECTED'` e
 * devolver a sessao para o motorista concluir pessoalmente.
 */
export class VerificationDetectedError extends Error {
  readonly verification: VerificationDetectedInfo;

  constructor(verification: VerificationDetectedInfo) {
    super(
      `Etapa sensível detectada (${verification.type}, provedor: ${verification.provider}) - automação interrompida para intervenção humana`,
    );
    this.name = "VerificationDetectedError";
    this.verification = verification;
  }
}

/**
 * Falha tecnica de uma etapa (timeout, seletor desatualizado, pagina
 * inesperada, sessao expirada). Diferente de `VerificationDetectedError`,
 * nao significa necessariamente que ha uma etapa sensivel na frente - so que
 * a automacao nao conseguiu prosseguir com seguranca. `code` deve ser
 * suficientemente especifico para orientar o operador (ver README do
 * pacote).
 */
export class AutomationStepError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AutomationStepError";
    this.code = code;
  }
}
