/**
 * Adaptadores especificos de plataforma (ex: fluxo de cadastro de motorista
 * parceiro da Uber): navegam pelo formulario administrativo, recuperam o
 * codigo de confirmacao por e-mail e param imediatamente ao detectar
 * qualquer etapa sensivel (foto de perfil, CNH, CAPTCHA, 2FA, bloqueio de
 * seguranca), devolvendo a sessao para o motorista concluir pessoalmente.
 *
 * Nunca cria identidades falsas, envia documentos/selfies, acessa camera,
 * resolve CAPTCHA/2FA, troca o provedor de verificacao escolhido pela
 * plataforma, ou cancela/recria cadastros automaticamente.
 */
export * from "./types";
export * from "./errors";
export { PlatformAdapter, type PlatformAdapterOptions } from "./base/PlatformAdapter";
export type { IPageTypeDetector } from "./adapters/types";
export * from "./adapters/uber";
