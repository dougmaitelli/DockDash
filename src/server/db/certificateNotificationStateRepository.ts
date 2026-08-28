import { eq } from "drizzle-orm";

import { orm } from "./connection.js";
import { certificateNotificationStates } from "./schema/index.js";

export type CertificateNotificationState = typeof certificateNotificationStates.$inferSelect;

class CertificateNotificationStateRepository {
  get(serviceId: string): CertificateNotificationState | undefined {
    return orm
      .select()
      .from(certificateNotificationStates)
      .where(eq(certificateNotificationStates.serviceId, serviceId))
      .get();
  }

  save(state: Omit<CertificateNotificationState, "updatedAt">): void {
    orm
      .insert(certificateNotificationStates)
      .values({ ...state, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: certificateNotificationStates.serviceId,
        set: { ...state, updatedAt: new Date().toISOString() },
      })
      .run();
  }
}

export const certificateNotificationStateRepository = new CertificateNotificationStateRepository();
