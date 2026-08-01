export type AuthProvider = "telegram" | "development";

export type Identity = {
  provider: AuthProvider;
  providerSubject: string;
  displayLabel: string;
};
