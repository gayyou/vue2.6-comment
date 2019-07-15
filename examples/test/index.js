let a =new Vue({
  template: '<span v-once>这个将不会改变: {{  }}{{  }}</span>',
  el: '#app',
  data() {
    return {
      a: {
        b: [
          1, 2, 3, 4
        ],
        c: {}
      }
    }
  },
  watch: {
    a() {
        console.log(123) 
      }
  },
  computed: {

  },
  mounted() {
    console.log(this.a.__ob__)
  }
})

// console.log(a.$options);