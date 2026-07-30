import type { Page } from "playwright";
import type { ApplicantData } from "../../../types";
import { UBER_CONFIG, type UberAdapterConfig } from "../config";
import { UBER_SELECTORS } from "../selectors";

/**
 * Preenche exclusivamente dados administrativos (nome, e-mail, telefone,
 * endereco, CEP, tipo de veiculo). Nunca lida com foto, documento ou
 * qualquer campo de verificacao de identidade - essas etapas, quando
 * aparecerem, sao tratadas por `ProfilePhotoStep`/`DriverLicenseStep`, que
 * apenas detectam e param.
 */
export async function fillApplicationForm(
  page: Page,
  data: ApplicantData,
  config: UberAdapterConfig = UBER_CONFIG,
): Promise<void> {
  const sel = UBER_SELECTORS.applicationForm;
  const { elementWait } = config.timeouts;

  await page.locator(sel.fullNameInput).fill(data.fullName, { timeout: elementWait });
  await page.locator(sel.emailInput).fill(data.email, { timeout: elementWait });
  await page.locator(sel.phoneInput).fill(data.phone, { timeout: elementWait });
  await page.locator(sel.addressInput).fill(data.address, { timeout: elementWait });
  await page.locator(sel.cityInput).fill(data.city, { timeout: elementWait });
  await page.locator(sel.stateInput).fill(data.state, { timeout: elementWait });
  await page.locator(sel.postalCodeInput).fill(data.postalCode, { timeout: elementWait });
  await page.locator(sel.vehicleTypeSelect).selectOption(data.vehicleType, { timeout: elementWait });

  await page.locator(sel.submitButton).click();
  await page.waitForLoadState("domcontentloaded", { timeout: config.timeouts.pageLoad });
}
