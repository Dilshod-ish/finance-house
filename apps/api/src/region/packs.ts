import { NotFoundException } from '@nestjs/common';
import { uzRegionPack } from '@fincore/region-pack-uz';
import type { RegionPack } from '@fincore/region-pack-contract';

/**
 * Which region packs this deployment ships with.
 *
 * The registry lives in the app rather than in a package because it is a
 * deployment fact, not domain logic: a package that mapped codes to packs
 * would have to import every pack, and `_contract` importing `uz` is exactly
 * the inversion CLAUDE.md §4 forbids. Domain code takes a `RegionPack`; only
 * this file knows which ones exist.
 */
const PACKS: Readonly<Record<string, RegionPack>> = {
  [uzRegionPack.code]: uzRegionPack,
};

export function packByCode(code: string): RegionPack {
  const pack = PACKS[code];
  if (pack === undefined) {
    throw new NotFoundException({
      error: 'unknown_region_pack',
      message: `This deployment does not carry the region pack “${code}”.`,
    });
  }
  return pack;
}
