import { getAll, loadLocal } from 'destiny2-manifest/node';
import { uniqAndSortArray, writeFile } from './helpers';

loadLocal();
const inventoryItems = getAll('DestinyInventoryItemDefinition');
const factions = getAll('DestinyFactionDefinition');

const tokenHashes: any = [];
factions.forEach(({ tokenValues }) => {
  if (tokenValues) {
    tokenHashes.push(Object.keys(tokenValues));
  }
});

const allTokenHashes = uniqAndSortArray(tokenHashes.flat()).map(Number);
const missingTokenHashes: number[] = [];
const badVendors: number[] = [];
allTokenHashes.forEach((hash) => {
  const item = inventoryItems.find((i) => i.hash === hash);
  if (!item) {
    missingTokenHashes.push(hash);
    const vendor = factions.find((i) => i.tokenValues?.[hash]);
    if (vendor) {
      badVendors.push(vendor.hash);
    }
  }
});

writeFile('./output/missing-faction-tokens.json', missingTokenHashes);
writeFile('./output/bad-vendors.json', badVendors);
