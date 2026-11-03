import { Validation } from './validation';

class Logger {
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

  private sanitizeArg(arg: unknown): unknown {
    if (typeof arg === 'string') {
      return this.sanitize(arg);
    }
    if (arg instanceof Error) {
      const sanitized = new Error(this.sanitize(arg.message));
      sanitized.name = arg.name;
      if (arg.stack) {
        sanitized.stack = this.sanitize(arg.stack);
      }
      for (const key of Object.keys(arg)) {
        const val = (arg as any)[key];
        (sanitized as any)[key] = this.sanitizeArg(val);
      }
      return sanitized;
    }
    if (Array.isArray(arg)) {
      return arg.map(a => this.sanitizeArg(a));
    }
    return arg;
  }

  public info(message: string, ...args: unknown[]): void {
    if (args.length > 0) {
      console.log(`${this.prefix} ${this.sanitize(message)}`, ...args.map(a => this.sanitizeArg(a)));
    } else {
      console.log(`${this.prefix} ${this.sanitize(message)}`);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (args.length > 0) {
      console.warn(`${this.prefix} [WARN] ${this.sanitize(message)}`, ...args.map(a => this.sanitizeArg(a)));
    } else {
      console.warn(`${this.prefix} [WARN] ${this.sanitize(message)}`);
    }
  }

  public error(message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(`${this.prefix} [ERROR] ${this.sanitize(message)}`, this.sanitizeArg(error));
    } else {
      console.error(`${this.prefix} [ERROR] ${this.sanitize(message)}`);
    }
  }

  public debug(message: string, ...args: unknown[]): void {
    if (args.length > 0) {
      console.debug(`${this.prefix} [DEBUG] ${this.sanitize(message)}`, ...args.map(a => this.sanitizeArg(a)));
    } else {
      console.debug(`${this.prefix} [DEBUG] ${this.sanitize(message)}`);
    }
  }
}

export const logger = Logger.getInstance();
