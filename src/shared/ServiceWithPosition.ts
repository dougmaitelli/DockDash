import { Service } from "./Service.js";
import { ServicePosition } from "./types.js";

export class ServiceWithPosition extends Service {
  position: ServicePosition | null = null;
}
