<template>
   <svg
      v-if="isMdi"
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      :style="{ transform: iconTransform }"
   >
      <path
         :d="iconPath"
         fill="currentColor"
      />
   </svg>
   <svg
      v-else
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      v-html="iconPath"
   />
</template>

<script setup lang="ts">
// `export =` package: a default import compiles here but resolves to undefined.
import DOMPurify from 'dompurify';
import { computed, PropType } from 'vue';

import { iconPaths } from '@/libs/iconPaths';
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
      return iconPaths[props.iconName];
   else if (props.type === 'custom') {
      if (!customIcon.value)
         return iconPaths.mdiImageBrokenVariant;

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

const flips: Record<string, string> = {
   horizontal: 'scaleX(-1)',
   vertical: 'scaleY(-1)',
   both: 'scale(-1, -1)'
};

// One `transform` for both: as two declarations on the same element the flip won on
// specificity and the rotation was dropped.
const iconTransform = computed(() => [
   props.rotate ? `rotate(${props.rotate}deg)` : '',
   flips[props.flip] ?? ''
].filter(Boolean).join(' '));
</script>
