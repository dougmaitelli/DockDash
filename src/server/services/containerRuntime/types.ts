import type { ContainerAction, ContainerStats, Service } from "@shared";
import type { FileContentResponse, FileEntry } from "@shared/responseSchemas.js";

export interface RuntimeTerminalSession {
  sessionId: string;
  stream: NodeJS.ReadWriteStream;
}

export interface ContainerRuntime {
  sourceName(service: Service): string | undefined;
  action(service: Service, action: ContainerAction): Promise<void>;
  stats(service: Service): Promise<ContainerStats>;
  logs(service: Service): Promise<NodeJS.ReadableStream & { destroy: () => void }>;
  openTerminal(
    userSessionId: string,
    service: Service,
    cols: number,
    rows: number,
  ): Promise<RuntimeTerminalSession>;
  listFiles(service: Service, path: string): Promise<FileEntry[]>;
  readFile(service: Service, path: string): Promise<FileContentResponse>;
  writeFile(service: Service, path: string, content: string): Promise<void>;
}
