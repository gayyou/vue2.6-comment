window.num = 0
let a = new Vue({
  template: '<span>这个将不会改变: {{ a.name }}{{ c }}</span>',
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
      }
    }
  },
  watch: {
    'a.name'() {

    }
  },
  computed: {

  },
  mounted() {
    this.c = this.a;
    this.c.name = '1233333';
  }
})

function dd() {
  a.a.name = '123'
  setTimeout(() => {
    a.$nextTick(() => {
      a.b.age = '123'
    })
  }, 100)
  // 对于在模板上显示的值，在渲染函数中
}

