<template>
  <dir>
    <h1>我下面是第一个插槽</h1>
    <slot :data="data">
      <!-- {{ user2.name }} -->
    </slot>
    <h1>我下面是第二个插槽</h1>
    <slot :data="data">
      <!-- {{ user2.name }} -->
    </slot>
  </dir>
</template>

<script>
export default {
  data() {
    return {
      data: ['Weybn1','Weybn1','Weybn1','Weybn1','Weybn1','Weybn1','Weybn1','Weybn1','Weybn1','Weybn1',]
    }
  }
}
</script>
