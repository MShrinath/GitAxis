export type ConfirmationPromptFn = (message: string, detail?: string) => Promise<boolean>;

export class ConfirmationHandler {
  private promptFn: ConfirmationPromptFn;

  constructor(promptFn?: ConfirmationPromptFn) {
    this.promptFn = promptFn ?? (async (message: string, detail?: string) => {
      // Default fallback in non-VS Code environments (e.g. tests)
      return true;
    });
  }

  public setPromptFn(fn: ConfirmationPromptFn): void {
    this.promptFn = fn;
  }

  public async requestConfirmation(reason: string, warning?: string): Promise<boolean> {
    const fullMessage = `Destructive Operation: ${reason}`;
    return this.promptFn(fullMessage, warning);
  }
}
