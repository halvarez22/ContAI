/**
 * Declaración mínima para el import exacto usado en cfdiXsdValidate (H4).
 * Specifier debe coincidir 1:1 con: import … from 'xmllint-wasm/index-browser.mjs'
 */

declare module 'xmllint-wasm/index-browser.mjs' {
  export type XmllintFileInput = {
    fileName: string;
    contents: string;
  };

  export type XmllintValidationError = {
    message: string;
  };

  export type XmllintValidateResult = {
    valid: boolean;
    errors: XmllintValidationError[];
    rawOutput?: string;
  };

  export function validateXML(options: {
    xml: XmllintFileInput;
    schema: XmllintFileInput | XmllintFileInput[];
  }): Promise<XmllintValidateResult>;
}
