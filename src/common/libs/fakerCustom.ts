import { allFakers, allLocales, Faker, faker } from '@faker-js/faker';

import { dateToString } from './dateUtils';

export interface FakeValueParams {
   group: string;
   method: string;
   params?: Record<string, number>;
   locale?: string;
}

/**
 * Catalog entries faker 10 has no method for, or whose arguments faker 6 supplied by default.
 * Keyed by the catalog's `group.method`, so the dropdown stays the contract and this table
 * stays the only place that knows how a value is produced.
 */
const customMethods: Record<string, (f: Faker, params?: Record<string, number>) => string | number> = {
   // Ours, not faker's: faker has no `time` module at all, and its `date.now` is not a clock.
   'date.now': () => dateToString(new Date(), 'YYYY-MM-DD HH:mm:ss'),
   'time.now': () => dateToString(new Date(), 'HH:mm:ss'),
   'time.recent': f => dateToString(f.date.recent(), 'HH:mm:ss'),
   'time.random': f => dateToString(f.date.recent(), 'HH:mm:ss'),

   // faker 10 dropped the methods but still ships the data behind them.
   'location.cityPrefix': f => f.helpers.arrayElement(f.definitions.location.city_prefix),
   'location.citySuffix': f => f.helpers.arrayElement(f.definitions.location.city_suffix),
   'location.streetSuffix': f => f.helpers.arrayElement(f.definitions.location.street_suffix),
   'location.stateAbbr': f => f.location.state({ abbreviated: true }),
   'git.shortSha': f => f.git.commitSha({ length: 7 }),

   // faker 6 defaulted these arguments; faker 10 requires them.
   'helpers.arrayElement': f => f.helpers.arrayElement(['a', 'b', 'c']),
   'helpers.objectValue': f => f.helpers.objectValue({ foo: 'bar', too: 'car' }) as string,
   'number.int': (f, params) => f.number.int({ max: 99999, ...params }),
   'number.float': (f, params) => f.number.float({ max: 99999, ...params }),

   // The catalog promises a string, and the insert puts the value straight into the statement.
   // faker 6 handed all four back as strings; faker 10 does not.
   'helpers.arrayElements': f => f.helpers.arrayElements(['a', 'b', 'c']).join(', '),
   'datatype.boolean': f => String(f.datatype.boolean()),
   'location.latitude': f => String(f.location.latitude()),
   'location.longitude': f => String(f.location.longitude())
};

const call = (f: Faker, { group, method, params }: FakeValueParams) => {
   const custom = customMethods[`${group}.${method}`];
   if (custom) return custom(f, params);

   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const module = (f as any)[group];
   if (typeof module?.[method] !== 'function')
      throw new Error(`faker has no method ${group}.${method}`);

   return params && Object.keys(params).length ? module[method](params) : module[method]();
};

/**
 * The one place a fake value is produced, called by the bulk insert handler (with a locale)
 * and by the single-cell fill (without one). `locale` is a per-call input on purpose: faker 10
 * keeps one instance per locale and has no setter, so there is no shared state to assign to.
 */
export const generateFakeValue = (args: FakeValueParams): string | number | Date => {
   const instance = (args.locale && allFakers[args.locale as keyof typeof allFakers]) || faker;

   try {
      return call(instance, args);
   }
   catch (err) {
      // Not every locale carries the data behind every method -- `sk` has no state abbreviations,
      // `th` no city prefixes. faker 6 fell back to English for exactly this, so keep doing it
      // rather than failing a thousand-row insert over one missing list.
      if (instance !== faker) return call(faker, args);
      throw err;
   }
};

/** Every locale this faker build carries, minus `base`, which holds no language data. */
export const fakerLocales: { value: string; label: string }[] = Object.entries(allLocales)
   .filter(([code]) => code !== 'base')
   .map(([value, locale]) => ({ value, label: locale.metadata.title }))
   .sort((a, b) => a.label.localeCompare(b.label));
