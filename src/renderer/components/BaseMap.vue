<template>
   <div id="map" class="map" />
</template>

<script setup lang="ts">
import {
   lineString,
   point,
   polygon
} from '@turf/helpers';
import { getArrayDepth } from 'common/libs/getArrayDepth';
import { GeoJsonObject } from 'geojson';
import * as L from 'leaflet';
import { onMounted, PropType, Ref, ref } from 'vue';

interface Coordinates { x: number; y: number }

const props = defineProps({
   points: [Object, Array] as PropType<Coordinates | Coordinates[]>,
   isMultiSpatial: Boolean
});
const map: Ref<L.Map> = ref(null);
const markers: Ref<GeoJsonObject | GeoJsonObject[]> = ref(null);
const center: Ref<[number, number]> = ref(null);

const getMarkers = (points: Coordinates) => {
   if (Array.isArray(points)) {
      if (getArrayDepth(points) === 1)
         return lineString(points.reduce((acc, curr) => [...acc, [curr.x, curr.y]], []));
      else
         return polygon(points.map(arr => arr.reduce((acc: Coordinates[], curr: Coordinates) => [...acc, [curr.x, curr.y]], [])));
   }
   else
      return point([points.x, points.y]);
};

onMounted(() => {
   if (props.isMultiSpatial) {
      for (const element of props.points as Coordinates[])
         (markers.value as GeoJsonObject[]).push(getMarkers(element));
   }
   else {
      markers.value = getMarkers(props.points as Coordinates);

      if (!Array.isArray(props.points))
         center.value = [props.points.y, props.points.x];
   }

   map.value = L.map('map', {
      center: center.value || [0, 0],
      zoom: 15,
      minZoom: 1,
      attributionControl: false
   });

   L.control.attribution({ prefix: '<b>Leaflet</b>' }).addTo(map.value);

   const geoJsonObj = L.geoJSON((markers.value as GeoJsonObject), {
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
