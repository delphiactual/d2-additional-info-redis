const { writeFile, getMostRecentManifest, uniqAndSortArray, diffArrays } = require('./helpers.js');
const mostRecentManifestLoaded = require(`./${getMostRecentManifest()}`);
const inventoryItem = mostRecentManifestLoaded.DestinyInventoryItemDefinition;

const WEAPON_CATEGORY_HASH = 1;
const DUMMY_CATEGORY_HASH = 3109687656;
const RPM_HASH = 4284893193;
const DRAW_HASH = 447667954;
const CHARGE_HASH = 2961396640;
const SWING_HASH = 2837207746;
const IMPACT_HASH = 4043523819;
const LFR_HASH = 1504945536;

// all other hashes are positive, so these are definitely ours
const ONLY_EXOTICS = -99999999; // this intrinsic list only contains exotics, so no archetype comparison button should be shown.
const STRICT_MODE = -7777777; // this intrinsic has multiple impact values only compare with same impact values.

const DEBUG = true;

// work around for https://github.com/Bungie-net/api/issues/1148
const workAroundHash = {
  'Claws of the Wolf': 23 // Claws of the Wolf, missing impact
};

const itemCategoryHashExclusion = [
  1, // Weapon
  2, // Kinetic Weapon
  3, // Energy Weapon
  4, // Power Weapon
  21, // Warlock
  22, // Titan
  23, // Hunter
  964228942, // Breaker: Disruption
  1793728308, // Breaker: Piercing
  2906646562 // Breaker: Stagger
];

const weaponCategoryHashesToROF = {
  5: RPM_HASH, // auto rifle
  6: RPM_HASH, // hand cannon
  7: RPM_HASH, // pulse rifle
  8: RPM_HASH, // scout rifle
  9: CHARGE_HASH, // fusion rifle
  10: RPM_HASH, // sniper rifle
  11: RPM_HASH, // shotgun
  12: RPM_HASH, // machine gun
  13: RPM_HASH, // rocket launcher
  14: RPM_HASH, // sidearm
  54: SWING_HASH, // sword
  153950757: RPM_HASH, // grenade launcher
  1504945536: CHARGE_HASH, // linear fusion rifle
  2489664120: RPM_HASH, // trace rifle
  3317538576: DRAW_HASH, // bow
  3954685534: RPM_HASH // submachine gun
};

const FRAME_EXCLUSION = ['Omolon Adaptive Frame'];
const FRAME_INCLUSION = ['Aggressive Burst'];

const intrinsic = {};
let exoticIntrinsicList = [];

Object.keys(inventoryItem).forEach(function(key) {
  const itemCategoryHashes = inventoryItem[key].itemCategoryHashes || [];
  if (
    itemCategoryHashes.includes(WEAPON_CATEGORY_HASH) &&
    !itemCategoryHashes.includes(DUMMY_CATEGORY_HASH) &&
    inventoryItem[key].sockets
  ) {
    const intrinsicPerkHash = inventoryItem[key].sockets.socketEntries[0].singleInitialItemHash;
    const frame = inventoryItem[intrinsicPerkHash].displayProperties.name;
    const isExotic = inventoryItem[key].inventory.tierType === 6;
    const isFrame = getIsFrame(isExotic, frame);
    const weaponType = getWeaponType(itemCategoryHashes, inventoryItem[key].hash);
    const rof = getROF(inventoryItem[key], weaponType);
    const impact = getImpact(inventoryItem[key]) || rof;

    if (impact || rof || isExotic) {
      if (isExotic) {
        exoticIntrinsicList.push(intrinsicPerkHash);
      }
      if (!intrinsic[weaponType]) {
        intrinsic[weaponType] = {};
      }
      if (!intrinsic[weaponType][frame]) {
        intrinsic[weaponType][frame] = {};
        intrinsic[weaponType][frame].hashes = [];
        intrinsic[weaponType][frame].impact = [];
        intrinsic[weaponType][frame].rof = [];
        intrinsic[weaponType][frame].strict = false;
      }

      intrinsic[weaponType][frame].hashes.push(intrinsicPerkHash);
      intrinsic[weaponType][frame].impact.push(impact);
      intrinsic[weaponType][frame].rof.push(rof);
      intrinsic[weaponType][frame].isExotic = isExotic;
      intrinsic[weaponType][frame].isFrame = isFrame;

      intrinsic[weaponType][frame].impact = uniqAndSortArray(intrinsic[weaponType][frame].impact);

      if (intrinsic[weaponType][frame].impact.length > 1 && !isExotic) {
        intrinsic[weaponType][frame].hashes.push(STRICT_MODE);
        intrinsic[weaponType][frame].strict = true;
      }

      intrinsic[weaponType][frame].hashes = uniqAndSortArray(intrinsic[weaponType][frame].hashes);
      intrinsic[weaponType][frame].rof = uniqAndSortArray(intrinsic[weaponType][frame].rof);
    }
  }
});

exoticIntrinsicList = uniqAndSortArray(exoticIntrinsicList);
intrinsicV2 = {};

Object.entries(intrinsic).forEach(([weaponType, frameList]) => {
  tempUniqueID = {};
  Object.values(frameList).forEach((frame) => {
    uniqueID = frame.impact[0]; // whatever you want to group by goes here
    if (frame.strict) {
      // Here is where the problem is...
      // if multiple impacts exists the sorting falls apart
      // need better logic
      for (let i = 1; i < frame.impact.length; i++) {
        uniqueID = frame.impact[i];
        tempUniqueID[uniqueID] = !frame.isFrame
          ? (tempUniqueID[uniqueID] || []).concat(frame.hashes)
          : frame.hashes.concat(tempUniqueID[uniqueID] || []);
      }
    } else {
      tempUniqueID[uniqueID] = !frame.isFrame
        ? (tempUniqueID[uniqueID] || []).concat(frame.hashes)
        : frame.hashes.concat(tempUniqueID[uniqueID] || []);
    }
  });

  Object.values(tempUniqueID).forEach((hashValues) => {
    if (diffArrays(hashValues, exoticIntrinsicList).length === 0) {
      hashValues.splice(0, 0, ONLY_EXOTICS); // insert hash so we know this list only contains exotic perks
    }
    if (hashValues.includes(STRICT_MODE)) {
      // ensure strict mode is at the beginning of the array
      hashValues.splice(hashValues.indexOf(STRICT_MODE), 1);
      hashValues.splice(0, 0, STRICT_MODE);
    }
  });

  intrinsicV2[weaponType] = Object.values(tempUniqueID);
});

if (DEBUG) {
  writeFile('./data/intrinsic-perk-debug.json', intrinsic, false);
}

writeFile('./output/intrinsic-perk-lookup-V2.json', intrinsicV2);

function getWeaponType(itemCategoryHashes, hash) {
  let weaponType;
  itemCategoryHashes = diffArrays(itemCategoryHashes, itemCategoryHashExclusion);

  if (itemCategoryHashes.length > 1) {
    if (itemCategoryHashes.includes(LFR_HASH)) {
      weaponType = LFR_HASH;
    } else {
      console.log(`Error! Too many itemCategoryHashes on hash ${hash}: ${itemCategoryHashes}`);
    }
  } else {
    weaponType = itemCategoryHashes[0];
  }
  return weaponType;
}

function getImpact(inventoryItem) {
  return workAroundHash[inventoryItem.displayProperties.name]
    ? workAroundHash[inventoryItem.displayProperties.name]
    : inventoryItem.stats.stats[IMPACT_HASH] && inventoryItem.stats.stats[IMPACT_HASH].value;
}

function getROF(inventoryItem, weaponType) {
  return inventoryItem.stats.stats[weaponCategoryHashesToROF[weaponType]].value;
}

function getIsFrame(isExotic, frame) {
  return (
    !isExotic &&
    !FRAME_EXCLUSION.includes(frame) &&
    (frame.includes('Frame') || !(FRAME_INCLUSION.filter((s) => s.includes(frame)).length === 0))
  );
}
