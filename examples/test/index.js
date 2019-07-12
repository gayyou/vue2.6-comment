let a =new Vue({
  el: '#app',
  data() {
    return {
      a: {
        b: [
          1, 2, 3, 4
        ]
      }
    }
  },
  watch: {
    a(newVal) {
      console.log(newVal)
    }
  }
})

a.a.b.splice(1, 2, 3);