// onnxruntime-node 类型声明（optionalDependency，可能未安装）
declare module 'onnxruntime-node' {
  export interface Tensor {
    readonly data: Float32Array | BigInt64Array | Int32Array
    readonly dims: readonly number[]
    readonly type: string
  }

  export interface InferenceSession {
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>
    release(): void
  }

  export interface InferenceSessionStatic {
    create(path: string): Promise<InferenceSession>
  }

  export const InferenceSession: InferenceSessionStatic

  // Tensor 可以作为构造函数调用
  export const Tensor: {
    new(type: string, data: Float32Array | BigInt64Array | Int32Array | number[], dims: readonly number[]): Tensor
    (type: string, data: Float32Array | BigInt64Array | Int32Array | number[], dims: readonly number[]): Tensor
  }
}
