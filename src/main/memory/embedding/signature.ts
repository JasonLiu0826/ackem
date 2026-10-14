/** Changes when tokenization or pooling changes, so stored vectors are rebuilt. */
export function embeddingIndexSignature(providerName: string): string {
  return providerName === 'local:bge-small-zh'
    ? `${providerName}:hf-tokenizer-dynamic-length-v2`
    : providerName
}
