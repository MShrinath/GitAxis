export interface TagInfo {
  name: string;
}

export class TagParser {
  public static parseTagList(output: string): TagInfo[] {
    return output
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(name => ({ name }));
  }
}
