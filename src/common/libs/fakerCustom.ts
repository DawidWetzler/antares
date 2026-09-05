import { faker } from '@faker-js/faker';

import { dateToString } from './dateUtils';

export const fakerCustom = {
   seed: faker.seed,
   setLocale: faker.setLocale,
   ...faker,
   date: {
      now: () => dateToString(new Date(), 'YYYY-MM-DD HH:mm:ss'),
      ...faker.date
   },
   time: {
      now: () => dateToString(new Date(), 'HH:mm:ss'),
      random: () => dateToString(faker.date.recent(), 'HH:mm:ss'),
      ...faker.time
   }
};
