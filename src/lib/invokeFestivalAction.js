import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';

export async function invokeFestivalAction(subAction, payload = {}) {
  const result = await invokeEdgeFunction('festivalActions', {
    subAction,
    ...payload,
  });

  if (!result.success) {
    throw new Error(result.error || `Festival action failed: ${subAction}`);
  }

  if (result.data?.success === false) {
    throw new Error(result.data.error || `Festival action failed: ${subAction}`);
  }

  return result.data;
}