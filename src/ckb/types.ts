export type HashType = 'type' | 'data' | 'data1' | 'data2';

export interface Script {
  codeHash: string;
  hashType: HashType;
  args: string;
}

export interface CellDep {
  outPoint: { txHash: string; index: string };
  depType: 'code' | 'depGroup';
}

export interface CellOutPoint {
  txHash: string;
  index: string;
}

export interface CellOutput {
  capacity: string;
  lock: Script;
  type: Script | null;
}

export interface LiveCell {
  outPoint: CellOutPoint;
  output: CellOutput;
  outputData: string;
  blockNumber: string;
}
