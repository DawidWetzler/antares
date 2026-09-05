const SIGNATURES: Record<string, { ext: string; mime: string }> = {
   '424D': { ext: 'bmp', mime: 'image/bmp' },
   '1F8B': { ext: 'tar.gz', mime: 'application/gzip' },
   '0B77': { ext: 'ac3', mime: 'audio/vnd.dolby.dd-raw' },
   7801: { ext: 'dmg', mime: 'application/x-apple-diskimage' },
   '4D5A': { ext: 'exe', mime: 'application/x-msdownload' },
   '1FA0': { ext: 'Z', mime: 'application/x-compress' },
   '1F9D': { ext: 'Z', mime: 'application/x-compress' },
   FFD8FF: { ext: 'jpg', mime: 'image/jpeg' },
   '4949BC': { ext: 'jxr', mime: 'image/vnd.ms-photo' },
   '425A68': { ext: 'bz2', mime: 'application/x-bzip2' },
   '89504E47': { ext: 'png', mime: 'image/png' },
   47494638: { ext: 'gif', mime: 'image/gif' },
   25504446: { ext: 'pdf', mime: 'application/pdf' },
   '504B0304': { ext: 'zip', mime: 'application/zip' },
   '425047FB': { ext: 'bpg', mime: 'image/bpg' },
   '4D4D002A': { ext: 'tif', mime: 'image/tiff' },
   '00000100': { ext: 'ico', mime: 'image/x-icon' }
};

export function mimeFromHex (hex: string): { ext: string; mime: string } {
   return SIGNATURES[hex.substring(0, 4)] ??
      SIGNATURES[hex.substring(0, 6)] ??
      SIGNATURES[hex] ??
      { ext: '', mime: `unknown ${hex}` };
}
