
let a = new Vue({
  template: '<span>这个将不会改变: {{ getCount }}</span>',
  el: '#app',
  data() {
    return {
      c: '123',
      a: {
        name: '123',
        age: 123
      },
      b: {
        age: 321
      },
    }
  },
  watch: {

  },
  computed: {
    getCount() {
      let i = 1;
      return this.b.age + i;
    }
  },
  mounted() {
    this.a.name = 1

  }
})