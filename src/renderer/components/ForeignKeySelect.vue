<template>
   <BaseSelect
      ref="editField"
      :options="foreigns"
      class="form-select pl-1 pr-4"
      :class="{'small-select': size === 'small'}"
      :model-value="currentValue"
      :internal-search="false"
      dropdown-class="select-sm"
      dropdown-container=".workspace-query-results > .vscroll"
      @change="onChange"
      @search-change="onSearchChange"
      @blur="emit('blur')"
   />
</template>

<script setup lang="ts">
import { LONG_TEXT, TEXT } from 'common/fieldTypes';
import { TableField } from 'common/interfaces/antares';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, Ref, ref, watch } from 'vue';

import BaseSelect from '@/components/BaseSelect.vue';
import { useFilters } from '@/composables/useFilters';
import Tables from '@/ipc-api/Tables';
import { useNotificationsStore } from '@/stores/notifications';
import { useWorkspacesStore } from '@/stores/workspaces';

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE = 200;

const props = defineProps({
   modelValue: [String, Number],
   keyUsage: Object,
   size: {
      type: String,
      default: ''
   }
});

const emit = defineEmits(['update:modelValue', 'blur']);

const { addNotification } = useNotificationsStore();
const workspacesStore = useWorkspacesStore();
const { cutText } = useFilters();

const { getSelected: selectedWorkspace } = storeToRefs(workspacesStore);

const editField: Ref<HTMLSelectElement> = ref(null);
const foreignList = ref([]);
// Seeded, not null: BaseSelect keeps the current label on screen only if told on the way in.
const currentValue = ref(props.modelValue);
const searchTerm = ref('');
const debounceTimeout: Ref<NodeJS.Timeout> = ref(null);
let latestRequest = 0;

const isValidDefault = computed(() => {
   if (props.modelValue === null) return false;
   return foreignList.value.some(foreign => foreign.foreign_column.toString() === props.modelValue?.toString());
});

const foreigns = computed(() => {
   const list = [];
   if (!isValidDefault.value)
      list.push({ value: props.modelValue, label: props.modelValue === null ? 'NULL' : props.modelValue });
   for (const row of foreignList.value)
      list.push({ value: row.foreign_column, label: `${row.foreign_column} ${cutText('foreign_description' in row ? ` - ${row.foreign_description}` : '', 15)}` });
   return list;
});

const onChange = (opt: HTMLSelectElement) => {
   emit('update:modelValue', opt.value);
};

const fetchForeignList = async () => {
   const request = ++latestRequest;

   try {
      const { status, response } = await Tables.getForeignList({
         ...params,
         column: props.keyUsage.refField,
         description: foreignDesc,
         search: searchTerm.value,
         limit: PAGE_SIZE,
         value: props.modelValue
      });

      // A slower earlier request must not overwrite the answer to a later keystroke.
      if (request !== latestRequest) return;

      if (status === 'success')
         foreignList.value = response.rows;
      else
         addNotification({ status: 'error', message: response });
   }
   catch (err) {
      addNotification({ status: 'error', message: err.stack });
   }
};

const onSearchChange = (search: string) => {
   searchTerm.value = search;
   clearTimeout(debounceTimeout.value);
   debounceTimeout.value = setTimeout(fetchForeignList, SEARCH_DEBOUNCE);
};

watch(() => props.modelValue, () => {
   currentValue.value = props.modelValue;
});

onBeforeUnmount(() => {
   clearTimeout(debounceTimeout.value);
});

let foreignDesc: string | false;
const params = {
   uid: selectedWorkspace.value,
   schema: props.keyUsage.refSchema,
   table: props.keyUsage.refTable
};

(async () => {
   try { // Field data
      const { status, response } = await Tables.getTableColumns(params);

      if (status === 'success') {
         const textField = (response as TableField[]).find((field: {type: string; name: string}) => [...TEXT, ...LONG_TEXT].includes(field.type) && field.name !== props.keyUsage.refField);
         foreignDesc = textField ? textField.name : false;
      }
      else
         addNotification({ status: 'error', message: response });
   }
   catch (err) {
      addNotification({ status: 'error', message: err.stack });
   }

   await fetchForeignList();
})();
</script>
