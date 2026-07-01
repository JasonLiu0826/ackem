/** True when LLM calls should return fixtures instead of hitting the network. */
export function isLlmMockMode(): boolean {
  const v = process.env.LLM_MOCK_MODE
  return v === '1' || v === 'true' || v === 'yes'
}
