import rawData from './referenceData.json';

type BulletItem = {
  id: string;
  name: string;
  description: string;
  options?: string[];
};

type ReferenceData = {
  attributes: {
    technical: BulletItem[];
    goalkeeping: BulletItem[];
    mental: BulletItem[];
    physical: BulletItem[];
    hidden: BulletItem[];
  };
  playstyles: Array<{ id: string; name: string; description: string; category: string }>;
  teamInstructions: {
    inPossession: BulletItem[];
    outOfPossession: BulletItem[];
  };
  roles: Record<string, BulletItem[]>;
  duties: BulletItem[];
};

export const referenceData: ReferenceData = rawData as ReferenceData;

const allAttributeItems = [
  ...referenceData.attributes.technical,
  ...referenceData.attributes.goalkeeping,
  ...referenceData.attributes.mental,
  ...referenceData.attributes.physical,
  ...referenceData.attributes.hidden
];

export const attributeIds = Array.from(new Set(allAttributeItems.map((item) => item.id)));
export const attributeNameMap = new Map(
  allAttributeItems.map((item) => [normalizeKey(item.name), item.id])
);
export const attributeIdToName = new Map(allAttributeItems.map((item) => [item.id, item.name]));

export function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
