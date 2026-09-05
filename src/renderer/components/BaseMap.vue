<template>
   <div ref="container" class="map" />
</template>

<script setup lang="ts">
import { valueToGeoJSON } from 'common/libs/sqlUtils';
import * as L from 'leaflet';
import { onBeforeUnmount, onMounted, PropType, Ref, ref } from 'vue';

interface Coordinates { x: number; y: number }

const props = defineProps({
   points: [Object, Array] as PropType<Coordinates | Coordinates[]>,
   isMultiSpatial: Boolean
});
const container: Ref<HTMLDivElement> = ref(null);
const map: Ref<L.Map> = ref(null);
const center: Ref<[number, number]> = ref(null);

onMounted(() => {
   const markers = valueToGeoJSON(props.points, props.isMultiSpatial);

   if (!props.isMultiSpatial && !Array.isArray(props.points))
      center.value = [props.points.y, props.points.x];

   map.value = L.map(container.value, {
      center: center.value || [0, 0],
      zoom: 15,
      minZoom: 1,
      attributionControl: false
   });

   L.control.attribution({ prefix: '<b>Leaflet</b>' }).addTo(map.value);

   const geoJsonObj = L.geoJSON(markers, {
      style: function () {
         return {
            weight: 2,
            fillColor: '#ff7800',
            color: '#ff7800',
            opacity: 0.8,
            fillOpacity: 0.4
         };
      },
      pointToLayer: function (feature, latlng) {
         return L.circleMarker(latlng, {
            radius: 7,
            weight: 2,
            fillColor: '#ff7800',
            color: '#ff7800',
            opacity: 0.8,
            fillOpacity: 0.4
         });
      }
   }).addTo(map.value);

   const southWest = L.latLng(-90, -180);
   const northEast = L.latLng(90, 180);
   const bounds = L.latLngBounds(southWest, northEast);
   map.value.setMaxBounds(bounds);

   if (!center.value) map.value.fitBounds(geoJsonObj.getBounds());

   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <b>OpenStreetMap</b>'
   }).addTo(map.value);
});

onBeforeUnmount(() => map.value?.remove());
</script>

<style lang="scss">
.map {
  height: 400px;

  // Leaflet 1.9 dropped its own `font-size: 11px` on the attribution and sized
  // `.leaflet-container` in `rem` instead. Spectre sets `html { font-size: 20px }`, so that
  // `0.75rem` lands at 15px rather than the 12px upstream assumes, and the credit line comes
  // out 36% too big. Pinned back to the absolute size Leaflet used to apply itself.
  .leaflet-control-attribution {
    font-size: 11px;
    line-height: 1.5;
  }
}

.marker-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--primary-color);
  border-radius: 50%;

  // sass-loader prepends an @import, so `@use "sass:color"` cannot be first here.
  /* stylelint-disable-next-line scss/no-global-function-names */
  box-shadow: 0 0 5px 1px darken($body-font-color-dark, 40%);
}
</style>
