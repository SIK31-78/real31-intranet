// Adapter mock de l'annuaire Crypto : aucun contact (mode dev sans import).

import type { CryptoContactsProvider } from "@/lib/ports/crypto-contacts-provider";

export class MockCryptoContactsRepository implements CryptoContactsProvider {
  async coprosPourEmails(): Promise<Map<string, string[]>> {
    return new Map();
  }
}
