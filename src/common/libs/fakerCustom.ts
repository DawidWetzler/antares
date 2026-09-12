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

export const fakerLocales: { value: string; label: string }[] = [
   { value: 'ar', label: 'Arabic' },
   { value: 'az', label: 'Azerbaijani' },
   { value: 'zh_CN', label: 'Chinese' },
   { value: 'zh_TW', label: 'Chinese (Taiwan)' },
   { value: 'cz', label: 'Czech' },
   { value: 'nl', label: 'Dutch' },
   { value: 'nl_BE', label: 'Dutch (Belgium)' },
   { value: 'en', label: 'English' },
   { value: 'en_AU_ocker', label: 'English (Australia Ocker)' },
   { value: 'en_AU', label: 'English (Australia)' },
   { value: 'en_BORK', label: 'English (Bork)' },
   { value: 'en_CA', label: 'English (Canada)' },
   { value: 'en_GB', label: 'English (Great Britain)' },
   { value: 'en_IND', label: 'English (India)' },
   { value: 'en_IE', label: 'English (Ireland)' },
   { value: 'en_ZA', label: 'English (South Africa)' },
   { value: 'en_US', label: 'English (United States)' },
   { value: 'fa', label: 'Farsi' },
   { value: 'fi', label: 'Finnish' },
   { value: 'fr', label: 'French' },
   { value: 'fr_CA', label: 'French (Canada)' },
   { value: 'fr_CH', label: 'French (Switzerland)' },
   { value: 'ge', label: 'Georgian' },
   { value: 'de', label: 'German' },
   { value: 'de_AT', label: 'German (Austria)' },
   { value: 'de_CH', label: 'German (Switzerland)' },
   { value: 'hr', label: 'Hrvatski' },
   { value: 'id_ID', label: 'Indonesia' },
   { value: 'it', label: 'Italian' },
   { value: 'ja', label: 'Japanese' },
   { value: 'ko', label: 'Korean' },
   { value: 'nep', label: 'Nepalese' },
   { value: 'nb_NO', label: 'Norwegian' },
   { value: 'pl', label: 'Polish' },
   { value: 'pt_BR', label: 'Portuguese (Brazil)' },
   { value: 'pt_PT', label: 'Portuguese (Portugal)' },
   { value: 'ro', label: 'Romanian' },
   { value: 'ru', label: 'Russian' },
   { value: 'sk', label: 'Slovakian' },
   { value: 'es', label: 'Spanish' },
   { value: 'es_MX', label: 'Spanish (Mexico)' },
   { value: 'sv', label: 'Swedish' },
   { value: 'tr', label: 'Turkish' },
   { value: 'uk', label: 'Ukrainian' },
   { value: 'vi', label: 'Vietnamese' }
];
