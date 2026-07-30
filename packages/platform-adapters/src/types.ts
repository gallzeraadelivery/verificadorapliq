export type AutomationStatus = "IDLE" | "RUNNING" | "PAUSED" | "SUCCESS" | "ERROR" | "CANCELLED";

/**
 * Somente dados administrativos - nunca documentos, fotos ou senhas. Espelha
 * o schema de `ApplicantFormData` do mock server (Fase 3), que por sua vez
 * espelha o que a Uber realmente pede num cadastro de motorista parceiro.
 */
export interface ApplicantData {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  vehicleType: string;
}

/**
 * `companyId` nao fazia parte do rascunho original desta interface, mas e
 * exigido por `AuditLogger.log()` (toda entrada de auditoria e isolada por
 * empresa - ver Fase 2) e ja existe em `AutomationJob` (`apps/worker`), cujo
 * formato este contexto espelha de proposito para que a futura integracao
 * worker -> adapter seja uma passagem direta de campos.
 */
export interface AutomationContext {
  companyId: string;
  applicantId: string;
  browserProfileId: string;
  emailAccountId: string;
  proxyId: string;
  applicantData: ApplicantData;
}

/**
 * Tipos de etapa sensivel que a automacao esta autorizada a apenas
 * detectar e reportar - nunca a completar. CAPTCHA/TWO_FACTOR/SECURITY_BLOCK
 * nao tem "provider" no sentido de provedor de verificacao de identidade,
 * mas usam o mesmo formato de resultado para simplificar o consumidor.
 */
export type SensitiveStepType =
  | "PROFILE_PHOTO"
  | "DRIVER_LICENSE"
  | "CAPTCHA"
  | "TWO_FACTOR"
  | "SECURITY_BLOCK";

export interface VerificationDetectedInfo {
  type: SensitiveStepType;
  provider: string;
  confidence: string;
}

export interface AutomationErrorInfo {
  code: string;
  message: string;
}

export interface AutomationResult {
  status: "SUCCESS" | "PAUSED" | "ERROR" | "VERIFICATION_DETECTED" | "CANCELLED";
  currentStep: string;
  verificationDetected?: VerificationDetectedInfo;
  error?: AutomationErrorInfo;
}

export interface IPlatformAdapter {
  start(context: AutomationContext): Promise<AutomationResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  cancel(): Promise<void>;
  getCurrentStep(): string;
  getStatus(): AutomationStatus;
}
