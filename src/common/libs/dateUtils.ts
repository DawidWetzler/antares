export function parseDate (value?: Date | string | number): Date | null {
   if (value === undefined) return new Date();

   let date: Date;

   if (typeof value === 'string') {
      // a bare date is local midnight for moment, UTC midnight for `new Date` — a day off west of UTC
      const dateOnly = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
      date = dateOnly
         ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00`)
         : new Date(value.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T'));
   }
   else if (value instanceof Date || typeof value === 'number')
      date = new Date(value);
   else
      return null;

   return isNaN(date.getTime()) ? null : date;
}

export function dateToString (date: Date | null, pattern: string): string {
   if (!date || isNaN(date.getTime())) return 'Invalid date';

   const pad = (value: number, length: number) => String(value).padStart(length, '0');

   return pattern.replace(/YYYY|MM|DD|HH|mm|ss|S+|Z/g, token => {
      switch (token) {
         case 'YYYY': return pad(date.getFullYear(), 4);
         case 'MM': return pad(date.getMonth() + 1, 2);
         case 'DD': return pad(date.getDate(), 2);
         case 'HH': return pad(date.getHours(), 2);
         case 'mm': return pad(date.getMinutes(), 2);
         case 'ss': return pad(date.getSeconds(), 2);
         case 'Z': {
            const offset = -date.getTimezoneOffset();
            return `${offset < 0 ? '-' : '+'}${pad(Math.trunc(Math.abs(offset) / 60), 2)}:${pad(Math.abs(offset) % 60, 2)}`;
         }
         default: return pad(date.getMilliseconds(), 3).slice(0, token.length).padEnd(token.length, '0');
      }
   });
}
