<template>
   <SvgIcon
      v-if="isMdi"
      type="mdi"
      :path="iconPath"
      :size="size"
      :rotate="rotate"
      :class="iconFlip"
   />
   <svg
      v-else
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      v-html="iconPath"
   />
</template>

<script setup lang="ts">
import SvgIcon from '@jamescoyle/vue-icon';
import * as Icons from '@mdi/js';
// `export =` package: a default import compiles here but resolves to undefined.
import DOMPurify from 'dompurify';
import { computed, PropType } from 'vue';

import { useConnectionsStore } from '@/stores/connections';

const { getIconByUid } = useConnectionsStore();

const props = defineProps({
   iconName: {
      type: String,
      required: true
   },
   size: {
      type: Number,
      default: 48
   },
   type: {
      type: String as PropType<'mdi' | 'custom'>,
      default: () => 'mdi'
   },
   flip: {
      type: String as PropType<'horizontal' | 'vertical' | 'both' | null>,
      default: () => null
   },
   rotate: {
      type: Number as PropType<number | null>,
      default: () => null
   }
});

const customIcon = computed(() => (props.type === 'custom' ? getIconByUid(props.iconName)?.base64 : undefined));

// Also flips the branch: an mdi path in `v-html` paints nothing.
const isMdi = computed(() => props.type !== 'custom' || !customIcon.value);

const iconPath = computed(() => {
   if (props.type === 'mdi')
      return (Icons as {[k:string]: string})[props.iconName];
   else if (props.type === 'custom') {
      if (!customIcon.value)
         return Icons.mdiImageBrokenVariant;

      const svgString = Buffer
         .from(customIcon.value, 'base64')
         .toString('utf-8');

      return DOMPurify.sanitize(svgString, {
         // SVG only: under the default profile an `<img>` is re-parented out of the wrapper as a live element.
         USE_PROFILES: { svg: true, svgFilters: true },
         // Permitted by the SVG profile: `<image href>` fetches on render, `<a href>` navigates the renderer.
         FORBID_TAGS: ['image', 'a']
      });
   }
   return null;
});

const iconFlip = computed(() => {
   if (['horizontal', 'vertical', 'both'].includes(props.flip))
      return `flip-${props.flip}`;
   else return '';
});
</script>

<style lang="scss" scoped>
.flip-horizontal {
    transform: scaleX(-1);
}

.flip-vertical {
    transform: scaleY(-1);
}

.flip-both {
    transform: scale(-1, -1);
}
</style>
