import { atomicFactMarket } from './api';
import { DeployAtomicFactMarketInput } from './api/atomic-fact-market';

/**
 * Deploys a new assertion with fact markets.
 *
 * @author mogulx_operates
 * @export
 * @param {DeployAtomicFactMarketInput} input
 * @return {*}  {Promise<{ tx: string }>}
 */
export async function assert(
  input: DeployAtomicFactMarketInput
): Promise<{ tx: string }> {
  const factMarket = await atomicFactMarket.deployAtomicFactMarket({
    ...input,
  });
  return factMarket;
  return { tx: '' };
}
