<template>
  <div id="app">
    <test>
      <template slot-scope="user">
        {{user.data}}
      </template>
      <div slot-scope="user">
        {{ user.data }}
      </div>
    </test>
  </div>
</template>

<script>
import test from './components/slot.vue'

export default {
  name: 'app',
  components: {
    test
  },
  data() {
    return {
      user1: {
        name: 'Weybn1'
      },
      user2: {
        name: 'Weybn2'
      }
    }
    
  }
}
</script>

<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
