import { globalCredentialVault } from "./credential-vault.js";

export type LoginAssistRequest = {
  service: "gmail" | string;
  email: string;
  browser: "arc" | "playwright";
};

export type LoginAssistResult = {
  passwordRef: string;
  expiresAt: string;
  message: string;
};

/**
 * Creates a passwordRef after secure local entry.
 * In CLI mode this is a placeholder — production UI should collect locally.
 */
export function createLoginAssistPlaceholder(
  req: LoginAssistRequest,
  passwordFromSecurePrompt: string,
): LoginAssistResult {
  const passwordRef = globalCredentialVault.store(req.service, req.email, passwordFromSecurePrompt);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  return {
    passwordRef,
    expiresAt,
    message: `Secure login assist ready for ${req.email}. Password ref expires in 60s and can be used once.`,
  };
}

export function resolvePasswordRef(passwordRef: string, email: string): string | null {
  return globalCredentialVault.consume(passwordRef, email);
}
