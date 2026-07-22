import type { Script } from './types.js';

type ScriptType = Pick<Script, 'codeHash' | 'hashType'>;

export function sameScript(a: Script, b: Script): boolean {
  return sameScriptType(a, b) && a.args === b.args;
}

export function sameScriptType(a: ScriptType, b: ScriptType): boolean {
  return a.codeHash === b.codeHash && a.hashType === b.hashType;
}
