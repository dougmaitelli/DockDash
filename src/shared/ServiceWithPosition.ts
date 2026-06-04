import { ServicePosition } from "./types.js";
import { Service } from "./Service.js";

export class ServiceWithPosition extends Service {
  position: ServicePosition | null = null;
}
