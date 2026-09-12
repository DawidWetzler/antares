/* eslint-disable @typescript-eslint/no-explicit-any */
export default class {
   static get _methods () {
      return [
         { name: 'human', group: 'color', types: ['string'] },
         { name: 'rgb', group: 'color', types: ['string'] },

         { name: 'department', group: 'commerce', types: ['string'] },
         { name: 'productName', group: 'commerce', types: ['string'] },
         { name: 'price', group: 'commerce', types: ['string', 'float'] },
         { name: 'productAdjective', group: 'commerce', types: ['string'] },
         { name: 'productMaterial', group: 'commerce', types: ['string'] },
         { name: 'product', group: 'commerce', types: ['string'] },
         { name: 'productDescription', group: 'commerce', types: ['string'] },

         { name: 'name', group: 'company', types: ['string'] },
         { name: 'catchPhrase', group: 'company', types: ['string'] },
         { name: 'buzzPhrase', group: 'company', types: ['string'] },
         { name: 'catchPhraseAdjective', group: 'company', types: ['string'] },
         { name: 'catchPhraseDescriptor', group: 'company', types: ['string'] },
         { name: 'catchPhraseNoun', group: 'company', types: ['string'] },
         { name: 'buzzAdjective', group: 'company', types: ['string'] },
         { name: 'buzzVerb', group: 'company', types: ['string'] },
         { name: 'buzzNoun', group: 'company', types: ['string'] },

         { name: 'column', group: 'database', types: ['string'] },
         { name: 'type', group: 'database', types: ['string'] },
         { name: 'collation', group: 'database', types: ['string'] },
         { name: 'engine', group: 'database', types: ['string'] },

         { name: 'boolean', group: 'datatype', types: ['string'] },

         { name: 'now', group: 'date', types: ['string', 'datetime'] },
         { name: 'past', group: 'date', types: ['string', 'datetime'] },
         { name: 'future', group: 'date', types: ['string', 'datetime'] },
         { name: 'recent', group: 'date', types: ['string', 'datetime'] },
         { name: 'soon', group: 'date', types: ['string', 'datetime'] },
         { name: 'month', group: 'date', types: ['string'] },
         { name: 'weekday', group: 'date', types: ['string'] },

         { name: 'accountNumber', group: 'finance', types: ['string', 'number'] },
         { name: 'accountName', group: 'finance', types: ['string'] },
         { name: 'routingNumber', group: 'finance', types: ['string', 'number'] },
         { name: 'amount', group: 'finance', types: ['string', 'float'] },
         { name: 'transactionType', group: 'finance', types: ['string'] },
         { name: 'currencyCode', group: 'finance', types: ['string'] },
         { name: 'currencyName', group: 'finance', types: ['string'] },
         { name: 'currencySymbol', group: 'finance', types: ['string'] },
         { name: 'bitcoinAddress', group: 'finance', types: ['string'] },
         { name: 'litecoinAddress', group: 'finance', types: ['string'] },
         { name: 'creditCardNumber', group: 'finance', types: ['string'] },
         { name: 'creditCardCVV', group: 'finance', types: ['string', 'number'] },
         { name: 'ethereumAddress', group: 'finance', types: ['string'] },
         { name: 'iban', group: 'finance', types: ['string'] },
         { name: 'bic', group: 'finance', types: ['string'] },
         { name: 'transactionDescription', group: 'finance', types: ['string'] },

         { name: 'branch', group: 'git', types: ['string'] },
         { name: 'commitEntry', group: 'git', types: ['string'] },
         { name: 'commitMessage', group: 'git', types: ['string'] },
         { name: 'commitSha', group: 'git', types: ['string'] },
         { name: 'shortSha', group: 'git', types: ['string'] },

         { name: 'abbreviation', group: 'hacker', types: ['string'] },
         { name: 'adjective', group: 'hacker', types: ['string'] },
         { name: 'noun', group: 'hacker', types: ['string'] },
         { name: 'verb', group: 'hacker', types: ['string'] },
         { name: 'ingverb', group: 'hacker', types: ['string'] },
         { name: 'phrase', group: 'hacker', types: ['string'] },

         { name: 'arrayElement', group: 'helpers', types: ['string'] },
         { name: 'arrayElements', group: 'helpers', types: ['string'] },
         { name: 'objectValue', group: 'helpers', types: ['string'] },

         { name: 'email', group: 'internet', types: ['string'] },
         { name: 'exampleEmail', group: 'internet', types: ['string'] },
         { name: 'username', group: 'internet', types: ['string'] },
         { name: 'protocol', group: 'internet', types: ['string'] },
         { name: 'url', group: 'internet', types: ['string'] },
         { name: 'domainName', group: 'internet', types: ['string'] },
         { name: 'domainSuffix', group: 'internet', types: ['string'] },
         { name: 'domainWord', group: 'internet', types: ['string'] },
         { name: 'ip', group: 'internet', types: ['string'] },
         { name: 'ipv6', group: 'internet', types: ['string'] },
         { name: 'userAgent', group: 'internet', types: ['string'] },
         { name: 'mac', group: 'internet', types: ['string'] },
         { name: 'password', group: 'internet', types: ['string'] },

         { name: 'zipCode', group: 'location', types: ['string'] },
         { name: 'city', group: 'location', types: ['string'] },
         { name: 'cityPrefix', group: 'location', types: ['string'] },
         { name: 'citySuffix', group: 'location', types: ['string'] },
         { name: 'street', group: 'location', types: ['string'] },
         { name: 'streetAddress', group: 'location', types: ['string'] },
         { name: 'streetSuffix', group: 'location', types: ['string'] },
         { name: 'secondaryAddress', group: 'location', types: ['string'] },
         { name: 'county', group: 'location', types: ['string'] },
         { name: 'country', group: 'location', types: ['string'] },
         { name: 'countryCode', group: 'location', types: ['string'] },
         { name: 'state', group: 'location', types: ['string'] },
         { name: 'stateAbbr', group: 'location', types: ['string'] },
         { name: 'latitude', group: 'location', types: ['string'] },
         { name: 'longitude', group: 'location', types: ['string'] },
         { name: 'direction', group: 'location', types: ['string'] },
         { name: 'cardinalDirection', group: 'location', types: ['string'] },
         { name: 'ordinalDirection', group: 'location', types: ['string'] },
         { name: 'timeZone', group: 'location', types: ['string'] },

         { name: 'word', group: 'lorem', types: ['string'] },
         { name: 'words', group: 'lorem', types: ['string'] },
         { name: 'sentence', group: 'lorem', types: ['string'] },
         { name: 'slug', group: 'lorem', types: ['string'] },
         { name: 'sentences', group: 'lorem', types: ['string'] },
         { name: 'paragraph', group: 'lorem', types: ['string'] },
         { name: 'paragraphs', group: 'lorem', types: ['string'] },
         { name: 'text', group: 'lorem', types: ['string'] },
         { name: 'lines', group: 'lorem', types: ['string'] },

         { name: 'genre', group: 'music', types: ['string'] },

         { name: 'int', group: 'number', types: ['string', 'number'], params: ['min', 'max'] },
         { name: 'float', group: 'number', types: ['string', 'float'], params: ['min', 'max'] },

         { name: 'firstName', group: 'person', types: ['string'] },
         { name: 'lastName', group: 'person', types: ['string'] },
         { name: 'middleName', group: 'person', types: ['string'] },
         { name: 'fullName', group: 'person', types: ['string'] },
         { name: 'jobTitle', group: 'person', types: ['string'] },
         { name: 'gender', group: 'person', types: ['string'] },
         { name: 'prefix', group: 'person', types: ['string'] },
         { name: 'suffix', group: 'person', types: ['string'] },
         { name: 'jobDescriptor', group: 'person', types: ['string'] },
         { name: 'jobArea', group: 'person', types: ['string'] },
         { name: 'jobType', group: 'person', types: ['string'] },

         { name: 'number', group: 'phone', types: ['string'] },

         { name: 'uuid', group: 'string', types: ['string', 'uuid'] },
         { name: 'alpha', group: 'string', types: ['string'] },
         { name: 'alphanumeric', group: 'string', types: ['string'] },
         { name: 'hexadecimal', group: 'string', types: ['string'] },

         { name: 'fileName', group: 'system', types: ['string'] },
         { name: 'commonFileName', group: 'system', types: ['string'] },
         { name: 'mimeType', group: 'system', types: ['string'] },
         { name: 'commonFileType', group: 'system', types: ['string'] },
         { name: 'commonFileExt', group: 'system', types: ['string'] },
         { name: 'fileType', group: 'system', types: ['string'] },
         { name: 'fileExt', group: 'system', types: ['string'] },
         { name: 'directoryPath', group: 'system', types: ['string'] },
         { name: 'filePath', group: 'system', types: ['string'] },
         { name: 'semver', group: 'system', types: ['string'] },

         { name: 'now', group: 'time', types: ['string', 'time'] },
         { name: 'recent', group: 'time', types: ['string', 'time'] },
         { name: 'random', group: 'time', types: ['string', 'time'] },

         { name: 'vehicle', group: 'vehicle', types: ['string'] },
         { name: 'manufacturer', group: 'vehicle', types: ['string'] },
         { name: 'model', group: 'vehicle', types: ['string'] },
         { name: 'type', group: 'vehicle', types: ['string'] },
         { name: 'fuel', group: 'vehicle', types: ['string'] },
         { name: 'vin', group: 'vehicle', types: ['string'] },
         { name: 'color', group: 'vehicle', types: ['string'] },

         { name: 'words', group: 'word', types: ['string'] }
      ];
   }

   static getGroups () {
      const groupsObj = this._methods.reduce((acc, curr) => {
         if (curr.group in acc)
            curr.types.forEach(type => acc[curr.group].add(type));
         else
            acc[curr.group] = new Set(curr.types);

         return acc;
      }, {} as any);

      const groupsArr = [];

      for (const key in groupsObj)
         groupsArr.push({ name: key, types: [...groupsObj[key]] });

      return groupsArr.sort((a, b) => {
         if (a.name < b.name)
            return -1;

         if (b.name > a.name)
            return 1;

         return 0;
      });
   }

   static getGroupsByType (type: string) {
      if (!type) return [];
      return this.getGroups().filter(group => group.types.includes(type));
   }

   static getMethods ({ type, group }: {type: string; group: string}) {
      return this._methods.filter(method => method.group === group && method.types.includes(type)).sort((a, b) => {
         if (a.name < b.name)
            return -1;

         if (b.name > a.name)
            return 1;

         return 0;
      });
   }
}
