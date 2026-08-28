export interface MenuItemSpec {
   id?: string;
   label?: string;
   role?: 'cut' | 'copy' | 'paste' | 'selectAll';
   type?: 'separator';
}
