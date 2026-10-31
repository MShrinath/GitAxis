import { Validation } from './validation';

export class Logger {
  private static instance: Logger;
  private prefix = '[GitAxis]';

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private sanitize(message: string): string {
    return Validation.sanitizeUrl(message);
  }


  public info(message: string, ...args: unknown[]): void {
    console.log(`${this.prefix} ${this.sanitize(message)}`, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix} [WARN] ${this.sanitize(message)}`, ...args);
  }

  public error(message: string, error?: unknown): void {
    console.error(`${this.prefix} [ERROR] ${this.sanitize(message)}`, error);
  }

  public debug(message: string, ...args: unknown[]): void {
    console.debug(`${this.prefix} [DEBUG] ${this.sanitize(message)}`, ...args);
  }
}

export const logger = Logger.getInstance();
