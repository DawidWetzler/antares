<template>
   <Teleport to="#window-content">
      <div class="modal active">
         <a class="modal-overlay" @click.stop="closeModal" />
         <div ref="trapRef" class="modal-container p-0">
            <div class="modal-header pl-2">
               <div class="modal-title h6">
                  <div class="d-flex">
                     <BaseIcon
                        icon-name="mdiPlaylistPlus"
                        :size="24"
                        class="mr-1"
                     />
                     <span class="cut-text">{{ t('database.insertRow', 2) }}</span>
                  </div>
               </div>
               <a class="btn btn-clear c-hand" @click.stop="closeModal" />
            </div>
            <div class="modal-body pb-0">
               <div class="content">
                  <form class="form-horizontal">
                     <fieldset :disabled="isInserting">
                        <div
                           v-for="field in fields"
                           :key="field.name"
                           class="form-group"
                        >
                           <div class="col-3 col-sm-12">
                              <label class="form-label" :title="field.name">{{ field.name }}</label>
                           </div>
                           <div class="column columns col-sm-12">
                              <FakerSelect
                                 v-model="localRow[field.name]"
                                 :type="field.type"
                                 class="column columns pr-0"
                                 :is-checked="!fieldsToExclude.includes(field.name)"
                                 :foreign-keys="foreignKeys"
                                 :key-usage="keyUsage"
                                 :field="field"
                                 :field-length="fieldLength(field)"
                                 :field-obj="localRow[field.name]"
                              >
                                 <span class="input-group-addon field-type" :class="typeClass(field.type)">
                                    {{ field.type }} {{ wrapNumber(fieldLength(field)) }}
                                 </span>
                                 <label class="form-checkbox ml-3" :title="t('general.insert')">
                                    <input
                                       type="checkbox"
                                       :checked="!fieldsToExclude.includes(field.name)"
                                       @change.prevent="toggleFields($event, field)"
                                    ><i class="form-icon" />
                                 </label>
                              </FakerSelect>
                           </div>
                        </div>
                     </fieldset>
                  </form>
               </div>
            </div>
            <div class="modal-footer columns">
               <div class="column d-flex" :class="hasFakes ? 'col-4' : 'col-2'">
                  <div class="input-group tooltip tooltip-right" :data-tooltip="t('database.numberOfInserts')">
                     <input
                        v-model="nInserts"
                        type="number"
                        class="form-input"
                        min="1"
                        :disabled="isInserting"
                     >
                     <span class="input-group-addon">
                        <BaseIcon icon-name="mdiRepeat" :size="24" />
                     </span>
                  </div>
                  <div
                     v-if="hasFakes"
                     class="tooltip tooltip-right ml-2"
                     :data-tooltip="t('database.fakeDataLanguage')"
                  >
                     <BaseSelect
                        v-model="fakerLocale"
                        :options="fakerLocales"
                        class="form-select"
                     />
                  </div>
               </div>
               <div class="column col-auto">
                  <button
                     class="btn btn-primary mr-2"
                     :class="{'loading': isInserting}"
                     @click.stop="insertRows"
                  >
                     {{ t('general.insert') }}
                  </button>
                  <button class="btn btn-link" @click.stop="closeModal">
                     {{ t('general.close') }}
                  </button>
               </div>
            </div>
         </div>
      </div>
   </Teleport>
</template>

<script setup lang="ts">
import { BIT, BLOB, DATE, DATETIME, FLOAT, LONG_TEXT, NUMBER, TEXT, TIME } from 'common/fieldTypes';
import { TableField, TableForeign } from 'common/interfaces/antares';
import { dateToString } from 'common/libs/dateUtils';
import { fakerLocales } from 'common/libs/fakerCustom';
import { storeToRefs } from 'pinia';
import { computed, onBeforeMount, onMounted, Prop, Ref, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import BaseIcon from '@/components/BaseIcon.vue';
import BaseSelect from '@/components/BaseSelect.vue';
import FakerSelect from '@/components/FakerSelect.vue';
import { useFilters } from '@/composables/useFilters';
import { useFocusTrap } from '@/composables/useFocusTrap';
import Tables from '@/ipc-api/Tables';
import { useNotificationsStore } from '@/stores/notifications';
import { useWorkspacesStore } from '@/stores/workspaces';

const { t } = useI18n();

const { wrapNumber } = useFilters();

const props = defineProps({
   tabUid: [String, Number],
   schema: String,
   table: String,
   fields: Array as Prop<TableField[]>,
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   rowToDuplicate: Object as Prop<any>,
   keyUsage: Array as Prop<TableForeign[]>
});

const emit = defineEmits(['reload', 'hide']);

const { addNotification } = useNotificationsStore();
const workspacesStore = useWorkspacesStore();

const { getSelected: selectedWorkspace } = storeToRefs(workspacesStore);

const { trapRef } = useFocusTrap({ disableAutofocus: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localRow: Ref<Record<string, any>> = ref({});
const fieldsToExclude = ref([]);
const nInserts = ref(1);
const isInserting = ref(false);
const fakerLocale = ref('en');

const foreignKeys = computed(() => props.keyUsage.map(key => key.field));
const hasFakes = computed(() => Object.keys(localRow.value).some(field => 'group' in localRow.value[field] && localRow.value[field].group !== 'manual'));

watch(nInserts, (val) => {
   if (!val || val < 1)
      nInserts.value = 1;
   else if (val > 1000)
      nInserts.value = 1000;
});

const typeClass = (type: string) => {
   if (type)
      return `type-${type.toLowerCase().replaceAll(' ', '_').replaceAll('"', '')}`;
   return '';
};

const insertRows = async () => {
   isInserting.value = true;
   const rowToInsert = localRow.value;

   Object.keys(rowToInsert).forEach(key => {
      if (fieldsToExclude.value.includes(key))
         delete rowToInsert[key];

      if (typeof rowToInsert[key] === 'undefined')
         delete rowToInsert[key];
   });

   const fieldTypes: Record<string, string> = {};
   props.fields.forEach(field => {
      fieldTypes[field.name] = field.type;
   });

   try {
      const { status, response } = await Tables.insertTableFakeRows({
         uid: selectedWorkspace.value,
         schema: props.schema,
         table: props.table,
         row: rowToInsert,
         repeat: nInserts.value,
         fields: fieldTypes,
         locale: fakerLocale.value
      });

      if (status === 'success') {
         closeModal();
         emit('reload');
      }
      else
         addNotification({ status: 'error', message: response });
   }
   catch (err) {
      addNotification({ status: 'error', message: err.stack });
   }

   isInserting.value = false;
};

const closeModal = () => {
   emit('hide');
};

const fieldLength = (field: TableField) => {
   if ([...BLOB, ...LONG_TEXT].includes(field.type)) return null;
   else if (TEXT.includes(field.type)) return Number(field.charLength);
   return Number(field.length);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toggleFields = (event: any, field: TableField) => {
   if (event.target.checked)
      fieldsToExclude.value = fieldsToExclude.value.filter(f => f !== field.name);
   else
      fieldsToExclude.value = [...fieldsToExclude.value, field.name];
};

const onKey = (e: KeyboardEvent) => {
   e.stopPropagation();
   if (e.key === 'Escape')
      closeModal();
};

window.addEventListener('keydown', onKey);

onMounted(() => {
   setTimeout(() => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.modal-container .form-input'));
      if (inputs?.length) {
         const firstEnabledInput = inputs.find((el) => !el.disabled);
         firstEnabledInput?.focus();
      }
   }, 50);

   const rowObj: Record<string, unknown> = {};

   if (!props.rowToDuplicate) {
      // Set default values
      for (const field of props.fields) {
         let fieldDefault;

         if (field.default === 'NULL') fieldDefault = null;
         else {
            if ([...NUMBER, ...FLOAT].includes(field.type))
               fieldDefault = !field.default || Number.isNaN(+field.default.replaceAll('\'', '')) ? null : +field.default.replaceAll('\'', '');
            else if ([...TEXT, ...LONG_TEXT].includes(field.type)) {
               fieldDefault = field.default
                  ? field.default.includes('\'')
                     ? field.default.split('\'')[1]
                     : field.default
                  : '';
            }
            else if ([...TIME, ...DATE].includes(field.type))
               fieldDefault = field.default;
            else if (BIT.includes(field.type))
               fieldDefault = field.default?.replaceAll('\'', '').replaceAll('b', '');
            else if (DATETIME.includes(field.type)) {
               if (field.default && ['current_timestamp', 'now()'].some(term => field.default.toLowerCase().includes(term))) {
                  let datePrecision = '';
                  for (let i = 0; i < field.datePrecision; i++)
                     datePrecision += i === 0 ? '.S' : 'S';
                  fieldDefault = dateToString(new Date(), `YYYY-MM-DD HH:mm:ss${datePrecision}`);
               }
               else
                  fieldDefault = field.default;
            }
            else if (field.enumValues)
               fieldDefault = field.enumValues.replaceAll('\'', '').split(',');
            else
               fieldDefault = field.default;
         }

         rowObj[field.name] = { value: fieldDefault };

         if (field.autoIncrement || !!field.onUpdate)// Disable by default auto increment or "on update" fields
            fieldsToExclude.value = [...fieldsToExclude.value, field.name];
      }
   }
   else {
      // Set values to duplicate
      for (const field of props.fields) {
         if (typeof props.rowToDuplicate[field.name] !== 'object')
            rowObj[field.name] = { value: props.rowToDuplicate[field.name] };
         else if (field.type === 'JSON')
            rowObj[field.name] = { value: JSON.stringify(props.rowToDuplicate[field.name]) };

         if (field.autoIncrement || !!field.onUpdate)// Disable by default auto increment or "on update" fields
            fieldsToExclude.value = [...fieldsToExclude.value, field.name];
      }
   }

   localRow.value = { ...rowObj };
});

onBeforeMount(() => {
   window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
  .modal-container {
    max-width: 800px;
  }

  .form-label {
    overflow: hidden;
    white-space: normal;
    text-overflow: ellipsis;
  }

  .input-group-addon {
    display: flex;
    align-items: center;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .field-type {
    font-size: 0.6rem;
  }
</style>
