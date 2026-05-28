import "dotenv/config";
import fs from "fs";
import { PORT_INFO_MAP } from "./constants.js";

export const DEFAULT_PORT = 3001;
export const DEFAULT_DOCKER_SOCKET = "unix:///var/run/docker.sock";
export const DEFAULT_NETWORK_CIDRS = "192.168.0.0/24";
export const DEFAULT_SCAN_PORTS = [...Object.keys(PORT_INFO_MAP).map(Number), 3001, 9090];
export const DEFAULT_HEALTH_CHECK_INTERVAL = 30000;
export const DEFAULT_REFRESH_INTERVAL = 30000;
export const DEFAULT_UPDATE_CHECK_INTERVAL = 3_600_000; // 1 hour

class Config {
  get port(): number {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
  }

  get dockerHosts(): string[] {
    const envHosts = process.env.DOCKER_HOSTS
      ? process.env.DOCKER_HOSTS.split(",")
          .map((h) => h.trim())
          .filter(Boolean)
      : [];

    const socketPath = DEFAULT_DOCKER_SOCKET.replace("unix://", "");
    const socketExists = fs.existsSync(socketPath);

    if (socketExists && !envHosts.includes(DEFAULT_DOCKER_SOCKET)) {
      return [DEFAULT_DOCKER_SOCKET, ...envHosts];
    }

    return envHosts;
  }

  get networkCidrs(): string[] {
    return process.env.NETWORK_CIDRS
      ? process.env.NETWORK_CIDRS.split(",")
      : [DEFAULT_NETWORK_CIDRS];
  }

  get scanPorts(): number[] {
    return process.env.SCAN_PORTS
      ? process.env.SCAN_PORTS.split(",").map(Number)
      : DEFAULT_SCAN_PORTS;
  }

  get healthCheckInterval(): number {
    return process.env.HEALTH_CHECK_INTERVAL
      ? parseInt(process.env.HEALTH_CHECK_INTERVAL, 10)
      : DEFAULT_HEALTH_CHECK_INTERVAL;
  }

  get refreshInterval(): number {
    return process.env.REFRESH_INTERVAL
      ? parseInt(process.env.REFRESH_INTERVAL, 10)
      : DEFAULT_REFRESH_INTERVAL;
  }

  get updateCheckInterval(): number {
    return process.env.UPDATE_CHECK_INTERVAL
      ? parseInt(process.env.UPDATE_CHECK_INTERVAL, 10)
      : DEFAULT_UPDATE_CHECK_INTERVAL;
  }
}

export const config = new Config();
