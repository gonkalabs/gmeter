export function modelDisplayName(
  modelId: string,
  aliases?: Record<string, string>,
  endpointLabel = "endpoint"
) {
  if (modelId === "broker") return endpointLabel;
  return aliases?.[modelId] || modelId.split("/").pop() || modelId;
}
