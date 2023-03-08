import {
  dispatch,
  getArweave,
  getArweaveWallet,
  isVouched,
} from '@facts-kit/contract-kit';
import { getBundlrClient } from '../common/bundlr';
import { getWarpFactory, register } from '../common/warp';
import { getAns110Tags } from '../helpers/get-ans110-tags';
import { FACT_MARKET_SRC, getPermafactsTags } from '../helpers/get-pf-tags';
import { getSmartweaveTags } from '../helpers/get-smartweave-tags';
import { getTx } from '../helpers/get-tx';
import { initialState } from './interface';

export type Use = 'bundlr' | 'warp' | 'arweaveWallet';

export interface DeployFactMarketInput {
  tags: { name: string; value: string }[];
  owner: string;
  attachTo: string;
  rebutTx?: string;
  use?: Use;
}

async function deployFactMarket(input: DeployFactMarketInput): Promise<string> {
  const { use } = input;
  switch (use) {
    case 'arweaveWallet':
    case undefined:
      return deployWithArweaveWallet(input);
    case 'warp':
      return deployWithWarp(input);
    case 'bundlr':
      return deployWithBundlr(input);
    default:
      throw new Error(`Wallet ${use} not supported.`);
  }
}

async function deployWithBundlr(input: DeployFactMarketInput) {
  const { tags, owner, rebutTx, attachTo } = input;
  const newTags = [
    ...tags,
    { name: 'Data-Source', value: attachTo },
    { name: 'Protocol-Name', value: 'Facts' },
    { name: 'Render-With', value: `${'render-attached-tx'}` },
    {
      name: 'Init-State',
      value: JSON.stringify({
        ...initialState,
        name: `${
          tags.filter((t) => t.name === 'Title')[0]?.value || 'No title.'
        }`,
        creator: owner,
      }),
    },
  ];
  if (rebutTx) tags.push({ name: 'Fact-Rebuts', value: rebutTx });

  const bundlr = await getBundlrClient();
  const tx = await bundlr.upload(JSON.stringify({ facts: 'sdk' }), {
    tags: newTags,
  });

  if (!tx.id) {
    throw new Error('Failed to deploy assertion.');
  }
  await register(tx.id);
  return tx.id;
}
async function deployWithWarp(input: DeployFactMarketInput) {
  const { tags, owner, rebutTx, attachTo } = input;
  const newTags = [
    ...tags,
    { name: 'Data-Source', value: attachTo },
    { name: 'Protocol-Name', value: 'Facts' },
    { name: 'Render-With', value: `${'render-attached-tx'}` },
  ];
  if (rebutTx) tags.push({ name: 'Fact-Rebuts', value: rebutTx });

  const warp = getWarpFactory();
  const factMarket = await warp.deployFromSourceTx(
    {
      initState: JSON.stringify({
        ...initialState,
        name: `${
          tags.filter((t) => t.name === 'Title')[0]?.value || 'No title.'
        }`,
        creator: owner,
      }),
      srcTxId: FACT_MARKET_SRC,
      wallet: 'use_wallet',
      data: {
        'Content-Type': 'text/plain',
        body: JSON.stringify({ facts: 'sdk' }),
      },
      newTags,
    },
    false
  );
  if (!factMarket.contractTxId) {
    throw new Error('Failed to deploy assertion.');
  }

  return factMarket.contractTxId;
}

async function deployWithArweaveWallet(
  input: DeployFactMarketInput
): Promise<string> {
  const wallet = getArweaveWallet();
  const { tags, owner, attachTo, rebutTx } = input;
  if (!(await isVouched(owner))) throw new Error('non-vouched');
  const arweave = getArweave();
  const tx = await arweave.createTransaction({
    data: JSON.stringify({ facts: 'sdk' }),
  });
  tags.forEach((t) => tx.addTag(t.name, t.value));
  if (rebutTx) tx.addTag('Fact-Rebuts', rebutTx);
  tx.addTag('Render-With', `${'render-attached-tx'}`);
  tx.addTag('Data-Source', attachTo);
  tx.addTag('Protocol-Name', 'Facts');

  if (!wallet) throw new Error('Unable to find arweave wallet.');
  await wallet.disconnect();
  await wallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION', 'DISPATCH'], {
    name: 'facts-sdk',
  });
  const addr = await wallet.getActiveAddress();

  tx.addTag(
    'Init-State',
    JSON.stringify({
      ...initialState,
      name:
        tags.filter((t) => t.name === 'Title')[0]?.value || 'bug: no title.',
      creator: addr,
    })
  );

  const id = await dispatch(tx);
  console.log(`Transaction id: ${id}`);
  return register(id).then((tx) => tx);
}

export interface AttachFactMarketInput {
  tx: string;
  wallet: string;
  rebutTx?: string;
  use?: Use;
}
export async function attachFactMarket(
  input: AttachFactMarketInput
): Promise<{ tx: string } | { error: string }> {
  try {
    const { tx, wallet } = input;
    const transaction = await getTx(tx);
    const ans110tags = getAns110Tags(transaction?.tags);
    const factMarketTx = await deployFactMarket({
      tags: [...ans110tags, ...getSmartweaveTags(), ...getPermafactsTags()],
      attachTo: tx,
      owner: wallet,
      ...input,
    });
    return { tx: factMarketTx };
  } catch (e: any) {
    console.log(e);
    return {
      error: e.message,
    };
  }
}