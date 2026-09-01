import { asc, eq, notExists } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { normalizeServiceLabel } from "@shared";

import { orm } from "./connection.js";
import { labels, serviceLabels } from "./schema/index.js";

export class LabelRepository {
  getAll(): string[] {
    return orm
      .select({ name: labels.name })
      .from(labels)
      .orderBy(asc(labels.name))
      .all()
      .map(({ name }) => name);
  }

  getForService(serviceId: string): string[] {
    return orm
      .select({ name: labels.name })
      .from(serviceLabels)
      .innerJoin(labels, eq(serviceLabels.labelId, labels.id))
      .where(eq(serviceLabels.serviceId, serviceId))
      .orderBy(asc(labels.name))
      .all()
      .map(({ name }) => name);
  }

  getByServiceId(): Map<string, string[]> {
    const labelsByServiceId = new Map<string, string[]>();
    const rows = orm
      .select({ serviceId: serviceLabels.serviceId, name: labels.name })
      .from(serviceLabels)
      .innerJoin(labels, eq(serviceLabels.labelId, labels.id))
      .orderBy(asc(labels.name))
      .all();

    for (const { serviceId, name } of rows) {
      const names = labelsByServiceId.get(serviceId) ?? [];

      names.push(name);
      labelsByServiceId.set(serviceId, names);
    }

    return labelsByServiceId;
  }

  replaceForService(serviceId: string, names: string[]): void {
    const uniqueNames = new Map<string, string>();

    for (const name of names) {
      const displayName = name.trim();
      const normalizedName = normalizeServiceLabel(displayName);

      if (displayName && !uniqueNames.has(normalizedName)) {
        uniqueNames.set(normalizedName, displayName);
      }
    }

    orm.delete(serviceLabels).where(eq(serviceLabels.serviceId, serviceId)).run();

    for (const [normalizedName, displayName] of uniqueNames) {
      let label = orm
        .select({ id: labels.id })
        .from(labels)
        .where(eq(labels.normalizedName, normalizedName))
        .get();

      if (!label) {
        label = { id: uuidv4() };
        orm.insert(labels).values({ id: label.id, name: displayName, normalizedName }).run();
      }

      orm
        .insert(serviceLabels)
        .values({ serviceId, labelId: label.id })
        .onConflictDoNothing()
        .run();
    }

    this.deleteOrphans();
  }

  deleteOrphans(): void {
    orm
      .delete(labels)
      .where(
        notExists(
          orm
            .select({ labelId: serviceLabels.labelId })
            .from(serviceLabels)
            .where(eq(serviceLabels.labelId, labels.id)),
        ),
      )
      .run();
  }
}

export const labelRepository = new LabelRepository();
